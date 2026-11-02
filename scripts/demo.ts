/**
 * npm run demo [-- --fast | --pace <x>] [--osc] [--memory]
 *
 * The whole Mimicwatch-for-NEAR story, deterministic and offline:
 *   1. re-scores the RECORDED mainnet scan in data/demo/ (no network: scoring is a pure function of it)
 *   2. syncs it into a copy of the RECORDED review queue (data/demo/review-queue.json)
 *   3. starts a LOCAL NEAR node (near-sandbox), deploys the registry, approves a reporter and publishes
 *      only the approved high/critical findings
 *   4. an agent wallet checks recipients before sending: BLOCK / WARN / ALLOW
 *   5. a third party disputes an entry; the owner rejects the dispute
 * Same findings, verdicts and order on every run; only transaction hashes differ.
 *
 *   --memory   no sandbox node: an in-memory registry with the contract's lookup rules (CI / no binary)
 *   --osc      emit viewer events (scripts/record-demo.ts sets this)
 */
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrandIndex, loadBrands, ROOT } from "../src/brands.ts";
import { analyzeScan, type AccountFinding } from "../src/near/analyze.ts";
import type { RawScan } from "../src/near/collect.ts";
import { bold, cyan, dim, green, oscEvent, red, sevTag, verdictTag, yellow } from "../src/demo/print.ts";
import { evidencePath, publish, selectForPublish, sha256, type RegistryWriter, type ReportInput } from "../src/publish/publisher.ts";
import { deployRegistry, RegistrySigner, RegistryViews, type FlagResult } from "../src/registry/client.ts";
import { registryWasm } from "../src/registry/wasm.ts";
import { accountCandidates, loadQueue, saveQueue, syncQueue, type Candidate } from "../src/review/queue.ts";
import { checkNearRecipient, type CheckResult } from "../src/sdk/check.ts";

const argv = process.argv.slice(2);
const fast = argv.includes("--fast");
const paceArg = argv.indexOf("--pace");
const PACE = fast ? 0 : paceArg >= 0 ? Number(argv[paceArg + 1]) : 1;
const OSC = argv.includes("--osc");
const MEMORY = argv.includes("--memory");
const DEMO = join(ROOT, "data/demo");
const out = (s = "") => process.stdout.write(s + "\n");
const pause = (ms: number) => (PACE > 0 ? new Promise((r) => setTimeout(r, ms * PACE)) : Promise.resolve());
const ev = (e: Record<string, unknown>) => OSC && process.stdout.write(oscEvent(e));
/** A narration cue: the subtitle shown (and, unless `say` differs, spoken) when this point of the run appears on screen. */
const cue = (id: string, text: string, say: string = text) => ev({ type: "cue", id, text, say });

const W = 96;
const SCENES = 6;
let sceneNo = 0;
async function scene(title: string, subtitle: string) {
  sceneNo++;
  await pause(700);
  ev({ type: "scene", n: sceneNo, of: SCENES, title, subtitle });
  out();
  out(cyan("━".repeat(W)));
  out(bold(`  ${sceneNo}/${SCENES}  ${title}`));
  out(dim(`       ${subtitle}`));
  out(cyan("━".repeat(W)));
  await pause(900);
}

// ------------------------------------------------------------------ recorded inputs
const brands = new BrandIndex(loadBrands());
const story = JSON.parse(readFileSync(join(DEMO, "story.json"), "utf8")) as {
  scan: string;
  closeUp: string;
  falsePositives: string[];
  checks: Array<{ who: string; to: string; amount?: string; sub?: string; say?: string }>;
  closeUpSub: string;
  closeUpSay: string;
  domainsSub: string;
  domainsSay: string;
  dispute: { subject: string; kind: "account" | "domain"; reason: string };
};
const raw = JSON.parse(readFileSync(join(ROOT, story.scan, "accounts-raw.json"), "utf8")) as RawScan;
const domains = JSON.parse(readFileSync(join(ROOT, story.scan, "domains.json"), "utf8")) as { scannedAt: string; brands: number; findings: Candidate[]; counts: Record<string, number> };
const tmp = mkdtempSync(join(tmpdir(), "mimicwatch-demo-"));
const queuePath = join(tmp, "queue.json");
copyFileSync(join(DEMO, "review-queue.json"), queuePath);

// ------------------------------------------------------------------ registry: local node or in-memory
interface Registry {
  name: string;
  writer: RegistryWriter;
  views: Pick<RegistryViews, "isFlagged" | "stats">;
  dispute(subject: string, kind: "account" | "domain", reason: string): Promise<string>;
  resolve(subject: string, kind: "account" | "domain", keep: boolean, note: string): Promise<string>;
  stop(): Promise<void>;
}

async function sandboxRegistry(): Promise<Registry> {
  const { Sandbox, DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY } = await import("near-sandbox");
  const { Account, JsonRpcProvider, KeyPair, nearToYocto } = await import("near-api-js");
  const sandbox = await Sandbox.start({});
  const provider = new JsonRpcProvider({ url: sandbox.rpcUrl });
  const genesis = new Account(DEFAULT_ACCOUNT_ID, provider, DEFAULT_PRIVATE_KEY as `ed25519:${string}`);
  const make = async (prefix: string, near: `${number}`) => {
    const kp = KeyPair.fromRandom("ed25519");
    await genesis.createSubAccount({ accountOrPrefix: prefix, publicKey: kp.getPublicKey().toString(), nearToTransfer: nearToYocto(near) });
    return { id: `${prefix}.${DEFAULT_ACCOUNT_ID}`, key: kp.toString() as `ed25519:${string}` };
  };
  const owner = await make("owner", "20");
  const reg = await make("registry", "20");
  const reporter = await make("reporter", "5");
  const friend = await make("friend", "5");
  const wasm = registryWasm((m) => console.log(dim(m)));
  await deployRegistry({ rpcUrl: sandbox.rpcUrl, accountId: reg.id, key: reg.key, wasm, owner: owner.id });
  const asOwner = new RegistrySigner(reg.id, "sandbox", sandbox.rpcUrl, owner.id, owner.key);
  await asOwner.addReporter(reporter.id);
  const asFriend = new RegistrySigner(reg.id, "sandbox", sandbox.rpcUrl, friend.id, friend.key);
  return {
    name: reg.id,
    writer: new RegistrySigner(reg.id, "sandbox", sandbox.rpcUrl, reporter.id, reporter.key),
    views: new RegistryViews(reg.id, sandbox.rpcUrl),
    dispute: async (s, k, r) => (await asFriend.dispute(s, k, r, 50_000_000_000_000_000_000_000n)).tx,
    resolve: async (s, k, keep, n) => (await asOwner.resolveDispute(s, k, keep, n)).tx,
    stop: () => sandbox.tearDown(),
  };
}

/** Same lookup rules as the contract (exact, then parent account / parent domain). For --memory only. */
function memoryRegistry(): Registry {
  const entries = new Map<string, ReportInput & { status: "active" | "disputed"; reason?: string }>();
  let n = 0;
  const isFlagged = async (id: string): Promise<FlagResult> => {
    const q = id.toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/?#:]/)[0];
    const labels = q.split(".");
    for (let i = 0; i < Math.max(1, labels.length - 1); i++) {
      const e = entries.get(labels.slice(i).join("."));
      if (e)
        return {
          query: q, flagged: true, via: i === 0 ? "exact" : e.kind === "account" ? "parent-account" : "parent-domain", cleared: null,
          entry: { subject: e.subject, kind: e.kind, category: e.category, severity: e.severity, status: e.status, brand: e.brand, evidence_url: e.evidence_url, evidence_hash: e.evidence_hash, note: e.note, reporter: "reporter.memory", reported_at_ms: 0, updated_at_ms: 0, dispute: e.status === "disputed" ? { by: "friend.memory", by_subject: false, reason: e.reason ?? "", deposit: "0", at_ms: 0 } : null, disputes_rejected: 0 },
        };
    }
    return { query: q, flagged: false, via: null, entry: null, cleared: null };
  };
  return {
    name: "registry (in memory)",
    writer: { network: "memory", contract: "registry.memory", reportBatch: async (es) => { for (const e of es) entries.set(e.subject, { ...e, status: "active" }); return { tx: `memory-${++n}` }; } },
    views: { isFlagged, stats: async () => ({ entries: entries.size, active: [...entries.values()].filter((e) => e.status === "active").length, disputed: [...entries.values()].filter((e) => e.status === "disputed").length, cleared: 0, reporters: 1 }) },
    dispute: async (s, _k, r) => { const e = entries.get(s)!; e.status = "disputed"; e.reason = r; return `memory-${++n}`; },
    resolve: async (s) => { entries.get(s)!.status = "active"; return `memory-${++n}`; },
    stop: async () => {},
  };
}

/** Word-wraps for the 110-column recording. */
function wrap(text: string, first: string, rest: string, width = 104): string[] {
  const out: string[] = [];
  let line = first;
  for (const w of text.split(" ")) {
    if (line.length + w.length + 1 > width && line.trim().length) {
      out.push(line);
      line = rest;
    }
    line += (line === first || line === rest ? "" : " ") + w;
  }
  out.push(line);
  return out;
}

function showCheck(r: CheckResult, who: string, amount?: string) {
  out(`  ${bold(who)} ${dim("→")} ${r.subject} ${amount ? dim(`(${amount})`) : ""}`);
  out(`     ${verdictTag(r.verdict)}  ${r.reasons.map((x) => x.code).join(", ")}`);
  for (const x of r.reasons.slice(0, 2)) out(dim(`       ${x.message.length > 96 ? x.message.slice(0, 95) + "…" : x.message}`));
  const action = r.verdict === "BLOCK" ? "refused: nothing signed" : r.verdict === "WARN" ? "paused: asks the human" : "sent";
  out(`     ${r.verdict === "BLOCK" ? red("✗") : r.verdict === "WARN" ? yellow("?") : green("✓")} ${action}`);
  const short = (m: string) => m.replace(/https:\/\/github\.com\/kacpergumieniuk\/mimicwatch-near\/blob\/main\//, "");
  ev({ type: "check", who, to: r.subject, amount, verdict: r.verdict, reasons: r.reasons.map((x) => short(x.message)), action: action[0].toUpperCase() + action.slice(1) });
}

// ================================================================== the story
out(bold("Mimicwatch for NEAR") + "  lookalike NEAR accounts and phishing domains, published to an on-chain registry");
out(dim(`recorded mainnet scan from ${raw.scannedAt.slice(0, 10)} · ${MEMORY ? "in-memory registry" : "local NEAR node (near-sandbox)"} · nothing here touches mainnet`));
cue("c01", "Scammers register lookalikes of NEAR accounts and dApp domains. Wallets and agents can't tell them apart.", "Scammers register lookalikes of NEAR accounts and app domains. Wallets and agents can't tell them apart.");
await pause(2500);

// 1 -------------------------------------------------------------- scan
const report = analyzeScan(raw, brands);
await scene("Which lookalikes exist on NEAR mainnet?", `${report.candidates.toLocaleString("en")} lookalike names, checked with RPC view_account (recorded ${raw.scannedAt.slice(0, 10)})`);
const officialCount = brands.brands.reduce((n, b) => n + b.officialAccounts.length, 0);
cue("c02", `Mimicwatch generated ${Math.round(report.candidates / 1000)} thousand lookalikes of ${officialCount} official accounts of ${raw.brands} NEAR dApps and asked mainnet which exist: ${report.found} do.`, `Mimicwatch generated ${Math.round(report.candidates / 1000)} thousand lookalikes of ${officialCount} official accounts of ${raw.brands} NEAR apps, and asked mainnet which exist. ${report.found} do.`);
out(`  brands ${bold(String(raw.brands))}   official accounts ${bold(String(officialCount))}   names checked ${bold(report.candidates.toLocaleString("en"))}   exist on mainnet ${bold(String(report.found))}`);
await pause(1200);
out();
out(dim("  label                    count"));
for (const [k, v] of Object.entries(report.counts)) out(`  ${k.padEnd(24)} ${String(v).padStart(5)}`);
await pause(1500);
cue("c03", "Each one is scored from on-chain facts: age, creator, keys, contracts, tokens, and who sent it money.");
out();
const top = report.findings.filter((f) => ["critical", "high", "medium"].includes(f.severity)).slice(0, 7);
for (const f of top) {
  out(`  ${sevTag(f.severity).padEnd(18)} ${f.id.padEnd(30)} ${f.label.padEnd(20)} ${dim(`${f.brandName}${f.facts.ftHolders ? ` · token held by ${f.facts.ftHolders.toLocaleString("en")}` : ""}`)}`);
  await pause(250);
}
await pause(1500);

// 2 -------------------------------------------------------------- close-up and false positives
await scene("Evidence, not vibes", "every finding carries the facts it was scored on, and the false positives are labelled");
const close = report.findings.find((f) => f.id === story.closeUp) as AccountFinding;
cue("c04", story.closeUpSub, story.closeUpSay);
out(`  ${bold(close.id)}  ${sevTag(close.severity)} ${close.label}  score ${close.score}`);
for (const e of close.evidence) {
  for (const l of wrap(e, "   • ", "     ")) out(l);
  await pause(450);
}
await pause(1500);
cue("c05", "Not every lookalike is a scam: someone's own account, a brand's defensive name. These are labelled, and never published.");
out();
for (const id of story.falsePositives) {
  const f = report.findings.find((x) => x.id === id);
  if (!f) continue;
  out(`  ${dim(f.label.padEnd(20))} ${f.id}`);
  const last = f.evidence.slice(-1)[0];
  out(dim(`     ${last.length > 100 ? last.slice(0, 99) + "…" : last}`));
  await pause(700);
}
await pause(1500);

// 3 -------------------------------------------------------------- domains + review
await scene("Domains, then a human review", `the existing Mimicwatch engine scanned lookalike domains of ${domains.brands} NEAR dApps; nothing publishes itself`);
const dTop = domains.findings.filter((d) => ["critical", "high"].includes(d.severity)).slice(0, 4);
cue("c06", story.domainsSub, story.domainsSay);
for (const d of dTop) {
  out(`  ${sevTag(d.severity).padEnd(18)} ${d.subject.replace(/\./g, "[.]").padEnd(36)} ${d.label.padEnd(18)} ${dim(d.brandName)}`);
  await pause(300);
}
await pause(1200);
const q = loadQueue(queuePath);
syncQueue(q, [...accountCandidates(report.findings), ...domains.findings], raw.scannedAt.slice(0, 10), "2026-11-01T00:00:00.000Z");
saveQueue(queuePath, q);
const counts: Record<string, number> = {};
for (const i of q.items) counts[i.review.decision] = (counts[i.review.decision] ?? 0) + 1;
out();
cue("c07", "Everything lands in a review queue. Nothing publishes itself: only findings a reviewer approved, at high or critical, go on chain.");
out(`  review queue: ${q.items.length} items · ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(" · ")}`);
const sel = selectForPublish(q, { evidenceBaseUrl: "https://github.com/kacpergumieniuk/mimicwatch-near/blob/main", network: "sandbox", contract: "registry" });
const reasons: Record<string, number> = {};
for (const s of sel.skipped) reasons[s.reason] = (reasons[s.reason] ?? 0) + 1;
for (const [r, n] of Object.entries(reasons)) out(dim(`    skip ${String(n).padStart(3)} × ${r}`));
for (const s of sel.publish) out(`    ${green("publish")} ${s.input.severity.padEnd(8)} ${s.input.kind.padEnd(7)} ${s.input.subject}  ${dim(`reviewed by ${s.item.review.reviewer}`)}`);
await pause(2500);

// 4 -------------------------------------------------------------- publish
await scene("Publish to the registry contract", MEMORY ? "in-memory registry (same lookup rules as the contract)" : "local NEAR node: real contract, real transactions");
cue("c08", "The publisher writes them to the registry contract, here on a local NEAR node, with the hash of each evidence file.");
out(dim(MEMORY ? "  in-memory registry…" : "  starting a local NEAR node and deploying the registry…"));
const reg = MEMORY ? memoryRegistry() : await sandboxRegistry();
ev({ type: "registry", name: reg.name, entries: 0, disputed: 0 });
const res = await publish(q, reg.writer, { root: tmp, evidenceBaseUrl: "https://github.com/kacpergumieniuk/mimicwatch-near/blob/main", at: "2026-11-01T00:00:00.000Z" });
for (const p of res.published) out(`  ${green("✓")} report_batch  ${p.key.padEnd(44)} ${dim(`tx ${p.tx.slice(0, 10)}…`)}`);
const st = await reg.views.stats();
ev({ type: "registry", name: reg.name, entries: st.entries, disputed: st.disputed });
const first = sel.publish.find((p) => p.input.subject === story.closeUp) ?? sel.publish[0];
if (first) {
  const file = readFileSync(join(tmp, evidencePath(first.item)), "utf8");
  const onChain = (await reg.views.isFlagged(first.input.subject)).entry?.evidence_hash;
  out(`  ${evidencePath(first.item)}  sha256 ${sha256(file).slice(0, 16)}…  ${sha256(file) === onChain ? green("= evidence_hash stored on chain") : red("≠ on-chain hash")}`);
}
out(`  registry ${bold(reg.name)}: ${st.entries} entries`);
await pause(2500);

// 5 -------------------------------------------------------------- check before you send
await scene("Check before you send", "a wallet or agent calls is_flagged (one view call) before it signs anything");
cue("c09", "Now an agent is told to pay. Before it signs, it asks the registry.");
for (const [i, c] of story.checks.entries()) {
  const r = await checkNearRecipient(c.to, { views: reg.views as RegistryViews, brands, now: () => new Date("2026-11-01T00:00:00Z") });
  if (c.sub) cue(`c1${i}`, c.sub, c.say ?? c.sub);
  showCheck(r, c.who, c.amount);
  await pause(2600);
}

// 6 -------------------------------------------------------------- dispute
await scene("Wrong? Dispute it on chain", "anyone can dispute with a deposit; the owner decides; disputed entries turn BLOCK into WARN");
cue("c20", "If an entry is wrong, anyone can dispute it on chain with a small deposit. While it is disputed, wallets warn instead of blocking.");
const dtx = await reg.dispute(story.dispute.subject, story.dispute.kind, story.dispute.reason);
out(`  ${yellow("dispute")} ${story.dispute.subject}: "${story.dispute.reason}"  ${dim(`tx ${dtx.slice(0, 10)}…`)}`);
ev({ type: "registry", name: reg.name, entries: st.entries, disputed: 1 });
showCheck(await checkNearRecipient(story.dispute.subject, { views: reg.views as RegistryViews, brands }), "agent", story.checks[0]?.amount);
await pause(2200);
cue("c20b", "The owner reviews the dispute and keeps the entry, so it blocks again. Accepting it would clear the entry and refund the deposit.");
const rtx = await reg.resolve(story.dispute.subject, story.dispute.kind, true, "evidence stands");
out(`  ${bold("owner")} keeps the entry  ${dim(`tx ${rtx.slice(0, 10)}…`)}   (accepting it would clear the entry and refund the deposit)`);
ev({ type: "registry", name: reg.name, entries: st.entries, disputed: 0 });
showCheck(await checkNearRecipient(story.dispute.subject, { views: reg.views as RegistryViews, brands }), "agent", story.checks[0]?.amount);
await pause(1500);

out();
out(cyan("━".repeat(W)));
cue("c21", "The same contract is live on NEAR testnet, with an MCP tool for agents. What should your wallet check before it sends?", "The same contract is live on NEAR testnet, with an M C P tool for agents. What should your wallet check before it sends?");
out(`  ${bold("Live on NEAR testnet:")} registry.mimicwatch-e7iig5g5.testnet   ${dim("npm run check -- <account | domain | URL>")}`);
out(`  ${bold("Agents:")} MCP tool check_near_recipient   ${bold("Wallets:")} one view call, is_flagged(id)`);
out(cyan("━".repeat(W)));
await pause(3000);
ev({ type: "end" });
await pause(4000);
await reg.stop();
process.exit(0);


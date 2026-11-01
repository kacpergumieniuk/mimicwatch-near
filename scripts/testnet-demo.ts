/**
 * npm run testnet:demo   Exercises every registry flow on the live testnet contract with SYNTHETIC entries
 * that point at nothing real: an account we create under our own throwaway owner account, and a domain under
 * the reserved `.example` TLD. Real mainnet findings are published only after the owner's review
 * (npm run publish:registry). Prints explorer links; keys stay in .mimicwatch-local/testnet.json.
 *
 *   1. reporter publishes two test entries (report_batch, evidence hashed)
 *   2. the flagged test account disputes its own entry (by_subject = true), the owner keeps it
 *   3. a third party disputes the test domain, the owner accepts: cleared, deposit refunded
 *   4. read-only checks: BLOCK, BLOCK via parent account, ALLOW with "cleared"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { JsonRpcProvider } from "near-api-js";
import { BrandIndex, loadBrands, ROOT } from "../src/brands.ts";
import { canonicalJson, sha256, type ReportInput } from "../src/publish/publisher.ts";
import { RegistrySigner, RegistryViews } from "../src/registry/client.ts";
import { loadDeployment, saveDeployment, subAccount } from "../src/registry/local.ts";
import { checkNearRecipient } from "../src/sdk/check.ts";

const dep = loadDeployment("testnet");
if (!dep) throw new Error("run npm run testnet:setup first");
const provider = new JsonRpcProvider({ url: dep.rpcUrl });
const tx = (h: string) => `https://testnet.nearblocks.io/txns/${h}`;
const lines: string[] = [];
const log = (s: string) => {
  console.log(s);
  lines.push(s);
};

// A deliberately lookalike-named TEST account under our own owner account.
const testId = `ref-flnance.${dep.owner.id}`;
if (!dep.testLookalike) {
  dep.testLookalike = await subAccount(dep.owner, "ref-flnance", "1", provider);
  saveDeployment(dep);
  log(`created test account ${dep.testLookalike.id}`);
}
const testAcc = dep.testLookalike;
const domain = "rhea-claim-test.example";
const base = process.env.MIMICWATCH_EVIDENCE_BASE ?? "https://github.com/kacpergumieniuk/mimicwatch-near/blob/main";
const entries: ReportInput[] = [];
for (const [subject, kind, category, severity, note] of [
  [testId, "account", "impersonation", "high", "TEST ENTRY (synthetic): our own testnet account named like ref-finance"],
  [domain, "domain", "phishing", "critical", "TEST ENTRY (synthetic): reserved .example domain"],
] as const) {
  const doc = { schema: "mimicwatch-near/evidence/v1", subject, kind, test: true, note, evidence: ["Synthetic entry created by scripts/testnet-demo.ts to exercise the registry on testnet. It does not describe a real account or site."] };
  const path = `evidence/testnet-demo/${subject}.json`;
  const body = canonicalJson(doc);
  mkdirSync(dirname(join(ROOT, path)), { recursive: true });
  writeFileSync(join(ROOT, path), body);
  entries.push({ subject, kind, category, severity, evidence_url: `${base}/${path}`, evidence_hash: sha256(body), brand: "rhea", note });
}

const reporter = new RegistrySigner(dep.registry.id, "testnet", dep.rpcUrl, dep.reporter.id, dep.reporter.key);
const owner = new RegistrySigner(dep.registry.id, "testnet", dep.rpcUrl, dep.owner.id, dep.owner.key);
const subject = new RegistrySigner(dep.registry.id, "testnet", dep.rpcUrl, testAcc.id, testAcc.key);
const third = new RegistrySigner(dep.registry.id, "testnet", dep.rpcUrl, dep.disputer!.id, dep.disputer!.key);
const views = new RegistryViews(dep.registry.id, dep.rpcUrl);
const brands = new BrandIndex(loadBrands());
const DEPOSIT = 50_000_000_000_000_000_000_000n; // 0.05 NEAR

const r1 = await reporter.reportBatch(entries);
log(`1. report_batch (2 synthetic entries)                ${tx(r1.tx)}`);
const r2 = await subject.dispute(testId, "account", "this is the project's own test account", DEPOSIT);
log(`2. dispute by the flagged account itself             ${tx(r2.tx)}`);
const e = await views.getEntry(testId, "account");
log(`   entry status ${e?.status}, by_subject ${e?.dispute?.by_subject}`);
const r3 = await owner.resolveDispute(testId, "account", true, "test: keep the entry");
log(`   owner keeps the entry (resolve_dispute keep=true)  ${tx(r3.tx)}`);
const r4 = await third.dispute(domain, "domain", "test: a third party disputes", DEPOSIT);
log(`3. dispute by a third party                          ${tx(r4.tx)}`);
const r5 = await owner.resolveDispute(domain, "domain", false, "test: dispute accepted, entry cleared");
log(`   owner accepts: cleared, deposit refunded           ${tx(r5.tx)}`);
log(`4. read-only checks against ${dep.registry.id}`);
for (const id of [testId, `claim.${testId}`, `https://app.${domain}/connect`]) {
  const r = await checkNearRecipient(id, { views, brands });
  log(`   ${r.verdict.padEnd(5)} ${r.subject.padEnd(52)} ${r.reasons.map((x) => x.code).join(", ")}`);
}
const st = await views.stats();
log(`   stats: ${JSON.stringify(st)}`);
writeFileSync(join(ROOT, "docs/testnet-demo-output.txt"), lines.join("\n") + "\n");

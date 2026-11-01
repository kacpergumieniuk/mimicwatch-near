/**
 * npm run review -- <command>
 *
 *   sync [scanDir]                    add a scan's medium+ findings to review/queue.json (default: newest scan)
 *   list [--decision pending] [--kind account|domain]
 *   show <subject>
 *   approve <subject> --reviewer <name> [--severity high|critical] [--category ...] [--note "..."]
 *   reject  <subject> --reviewer <name> --note "why it is a false positive"
 *   watch   <subject> --reviewer <name> [--note "..."]
 *   note    <subject> --note "..."        add a note without changing the decision (e.g. a recommendation)
 *
 * Nothing here touches a chain. Publishing is a separate step (npm run publish:registry) that reads
 * only approved high/critical items.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ROOT } from "../src/brands.ts";
import type { Severity } from "../src/near/analyze.ts";
import { accountCandidates, decide, effectiveSeverity, loadQueue, saveQueue, syncQueue, type Candidate, type Decision, type Kind, type RegistryCategory } from "../src/review/queue.ts";

const QUEUE = process.env.MW_QUEUE ?? join(ROOT, "review/queue.json");
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    reviewer: { type: "string" },
    note: { type: "string" },
    severity: { type: "string" },
    category: { type: "string" },
    decision: { type: "string" },
    kind: { type: "string" },
  },
});
const [cmd, arg] = positionals;
const q = loadQueue(QUEUE);
const now = new Date().toISOString();

function newestScan(): string {
  const dir = join(ROOT, "data/scans");
  const d = readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().at(-1);
  if (!d) throw new Error("no scans in data/scans");
  return join(dir, d);
}

if (cmd === "sync") {
  const dir = arg ?? newestScan();
  const id = dir.split("/").at(-1)!;
  const cands: Candidate[] = [];
  if (existsSync(join(dir, "accounts.json"))) cands.push(...accountCandidates(JSON.parse(readFileSync(join(dir, "accounts.json"), "utf8")).findings));
  if (existsSync(join(dir, "domains.json"))) cands.push(...(JSON.parse(readFileSync(join(dir, "domains.json"), "utf8")).findings as Candidate[]));
  const r = syncQueue(q, cands, id, now);
  saveQueue(QUEUE, q);
  console.log(`synced ${id}: ${r.added.length} new (pending), ${r.updated.length} seen again, ${r.reset.length} approvals reset because the evidence changed`);
} else if (cmd === "list" || cmd === undefined) {
  const items = q.items.filter((i) => (!values.decision || i.review.decision === values.decision) && (!values.kind || i.kind === values.kind));
  const counts: Record<string, number> = {};
  for (const i of q.items) counts[i.review.decision] = (counts[i.review.decision] ?? 0) + 1;
  console.log(`${q.items.length} items: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`);
  for (const i of items)
    console.log(`  ${i.review.decision.padEnd(8)} ${effectiveSeverity(i).padEnd(8)} ${i.kind.padEnd(7)} ${i.subject.padEnd(40)} ${i.label.padEnd(26)} ${i.brandName}${i.published ? `  [published ${i.published.network}]` : ""}${i.changed ? "  [changed]" : ""}`);
} else if (cmd === "show") {
  const i = q.items.find((x) => x.subject === arg);
  if (!i) throw new Error(`not in the queue: ${arg}`);
  console.log(JSON.stringify(i, null, 2));
} else if (cmd === "approve" || cmd === "reject" || cmd === "watch") {
  if (!arg) throw new Error(`usage: review ${cmd} <subject> --reviewer <name>`);
  if (cmd === "reject" && !values.note) throw new Error("rejecting needs --note (why it is a false positive)");
  const decision: Decision = cmd;
  const item = decide(q, arg, decision, {
    reviewer: values.reviewer,
    note: values.note,
    severity: values.severity as Severity | undefined,
    category: values.category as RegistryCategory | undefined,
    kind: values.kind as Kind | undefined,
    at: now,
  });
  saveQueue(QUEUE, q);
  const sev = effectiveSeverity(item);
  console.log(`${item.subject}: ${decision} by ${item.review.reviewer ?? "?"} (${sev})${decision === "approve" && !["high", "critical"].includes(sev) ? " - note: only high/critical are published" : ""}`);
} else if (cmd === "note") {
  const i = q.items.find((x) => x.subject === arg && (!values.kind || x.kind === values.kind));
  if (!i || !values.note) throw new Error("usage: review note <subject> --note \"...\"");
  i.review.note = values.note;
  saveQueue(QUEUE, q);
  console.log(`${i.subject}: note saved (decision stays ${i.review.decision})`);
} else {
  console.error(`unknown command ${cmd}`);
  process.exit(1);
}

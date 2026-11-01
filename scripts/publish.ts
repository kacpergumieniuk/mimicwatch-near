/**
 * npm run publish:registry -- [--network testnet|sandbox] [--send]
 *
 * Publishes reviewed findings from review/queue.json to the registry. Dry run by default: it prints what
 * it would publish and why everything else is skipped. --send signs report_batch as the reporter
 * account from .mimicwatch-local/<network>.json. Mainnet is refused.
 *
 * Only items a person approved, with severity high or critical, are published (src/publish/publisher.ts).
 */
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ROOT } from "../src/brands.ts";
import { publish, selectForPublish } from "../src/publish/publisher.ts";
import { RegistrySigner } from "../src/registry/client.ts";
import { loadDeployment } from "../src/registry/local.ts";
import { loadQueue, saveQueue } from "../src/review/queue.ts";

const { values } = parseArgs({ options: { network: { type: "string", default: "testnet" }, send: { type: "boolean", default: false }, queue: { type: "string" } } });
if (values.network === "mainnet") throw new Error("refusing: this project publishes to testnet or a local sandbox only");
const QUEUE = values.queue ?? process.env.MW_QUEUE ?? join(ROOT, "review/queue.json");
const EVIDENCE_BASE = process.env.MIMICWATCH_EVIDENCE_BASE ?? "https://github.com/kacpergumieniuk/mimicwatch-near/blob/main";
const dep = loadDeployment(values.network!);
if (!dep) throw new Error(`no ${values.network} deployment; run npm run testnet:setup first`);
const q = loadQueue(QUEUE);
const sel = selectForPublish(q, { evidenceBaseUrl: EVIDENCE_BASE, network: dep.network, contract: dep.registry.id });
console.log(`${q.items.length} items in the queue; ${sel.publish.length} to publish, ${sel.skipped.length} skipped`);
for (const s of sel.publish) console.log(`  publish  ${s.input.severity.padEnd(8)} ${s.input.kind.padEnd(7)} ${s.input.subject}  ${s.input.category}  evidence ${s.input.evidence_hash.slice(0, 12)}…`);
const reasons: Record<string, number> = {};
for (const s of sel.skipped) reasons[s.reason] = (reasons[s.reason] ?? 0) + 1;
for (const [r, n] of Object.entries(reasons)) console.log(`  skip     ${String(n).padStart(4)} × ${r}`);
if (!values.send) {
  console.log("\ndry run: nothing was sent. Add --send to publish.");
  process.exit(0);
}
const w = new RegistrySigner(dep.registry.id, dep.network, dep.rpcUrl, dep.reporter.id, dep.reporter.key);
const res = await publish(q, w, { root: ROOT, evidenceBaseUrl: EVIDENCE_BASE, at: new Date().toISOString(), log: (s) => console.log(s) });
saveQueue(QUEUE, q);
console.log(`published ${res.published.length}; evidence files written under evidence/ (commit them so the evidence URLs resolve)`);

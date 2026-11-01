/**
 * npm run scan:accounts [-- options]
 *
 * Generates lookalikes of every official NEAR account in brands/near-brands.json, checks which exist on
 * mainnet (RPC view_account, read-only), enriches the ones that exist (creation, activity, keys, token
 * metadata) and scores them. Writes data/scans/<date>/accounts-raw.json (the recorded scan data) and
 * accounts.json (findings).
 *
 *   --brand <id>       only this brand (repeatable)
 *   --no-typos         skip keyboard-typo permutations (about 3x fewer RPC calls)
 *   --limit <n>        only the first n candidates (smoke test)
 *   --out <dir>        default data/scans/<YYYY-MM-DD>
 *   --rescore <raw>    no network: re-score a recorded accounts-raw.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { BrandIndex, loadBrands, ROOT } from "../src/brands.ts";
import { analyzeScan } from "../src/near/analyze.ts";
import { collect, type RawScan } from "../src/near/collect.ts";
import { allCandidates } from "../src/near/permute.ts";

const { values } = parseArgs({
  options: {
    brand: { type: "string", multiple: true },
    "no-typos": { type: "boolean", default: false },
    limit: { type: "string" },
    out: { type: "string" },
    rescore: { type: "string" },
  },
});
const all = loadBrands();
const brands = values.brand?.length ? all.brands.filter((b) => values.brand!.includes(b.id)) : all.brands;
const index = new BrandIndex(all.brands);
const scoped = new BrandIndex(brands);
let raw: RawScan;
let out: string;
if (values.rescore) {
  raw = JSON.parse(readFileSync(values.rescore, "utf8")) as RawScan;
  out = values.out ?? join(values.rescore, "..");
} else {
  let cands = allCandidates(scoped, { noTypos: values["no-typos"] });
  // Never treat another brand's official account as a lookalike.
  cands = cands.filter((c) => !index.ownerOfAccount(c.id));
  if (values.limit) cands = cands.slice(0, Number(values.limit));
  out = values.out ?? join(ROOT, "data/scans", new Date().toISOString().slice(0, 10));
  console.log(`${brands.length} brands, ${cands.length} candidates`);
  mkdirSync(join(ROOT, ".cache"), { recursive: true });
  raw = await collect(index, cands, { log: (s) => console.log(s), cachePath: join(ROOT, ".cache", `near-exists-${new Date().toISOString().slice(0, 10)}.json`) });
}
mkdirSync(out, { recursive: true });
if (!values.rescore) writeFileSync(join(out, "accounts-raw.json"), JSON.stringify(raw, null, 1));
const report = analyzeScan(raw, index);
writeFileSync(join(out, "accounts.json"), JSON.stringify(report, null, 2));
console.log(`\n${report.found} lookalike accounts exist out of ${report.candidates} checked:`);
for (const [k, v] of Object.entries(report.counts)) console.log(`  ${k.padEnd(22)} ${v}`);
for (const f of report.findings.filter((f) => ["critical", "high", "medium"].includes(f.severity)).slice(0, 40))
  console.log(`  ${f.severity.padEnd(8)} ${String(f.score).padStart(3)}  ${f.id.padEnd(36)} ${f.label.padEnd(22)} imitates ${f.imitates}`);
console.log(`\nwrote ${join(out, "accounts.json")}`);

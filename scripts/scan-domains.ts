/**
 * npm run scan:domains [-- --brand <id> ...] [--jobs 3] [--out <dir>]
 *
 * Runs the pre-existing Mimicwatch domain engine (engine/src/cli.ts: permutations, DNS, certificate
 * transparency, newly registered domains, page fingerprints, wallet blocklists) for every NEAR brand
 * with an official domain. Read-only towards suspects. Writes one folder per brand under
 * data/scans/<date>/domains/ and a merged domains.json with the findings in this project's shape.
 *
 * Global stablecoin issuers (Tether, Circle) are skipped: their phishing is not NEAR-specific.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadBrands, ROOT, type NearBrand } from "../src/brands.ts";
import { domainCandidates, type EngineScan } from "../src/domains/normalize.ts";

const { values } = parseArgs({
  options: {
    brand: { type: "string", multiple: true },
    jobs: { type: "string", default: "3" },
    out: { type: "string" },
    days: { type: "string", default: "30" },
    "nrd-days": { type: "string", default: "4" },
    "max-pages": { type: "string", default: "80" },
    "max-render": { type: "string", default: "12" },
    "merge-only": { type: "boolean", default: false },
    "skip-ct": { type: "boolean", default: false },
  },
});
const SKIP = new Set(["tether-usdt", "circle-usdc"]);
const brands = loadBrands().brands.filter((b) => b.officialDomains.length && !SKIP.has(b.id) && (!values.brand?.length || values.brand.includes(b.id)));
const date = new Date().toISOString().slice(0, 10);
const out = values.out ?? join(ROOT, "data/scans", date, "domains");
const profiles = join(ROOT, "data/brand-profiles");
mkdirSync(out, { recursive: true });
mkdirSync(profiles, { recursive: true });

/** The engine's brand-profile format (engine/src/brand.ts). */
function engineProfile(b: NearBrand) {
  return {
    name: b.name,
    notes: `Generated from brands/near-brands.json (${b.id}).`,
    officialDomains: b.officialDomains,
    referenceUrl: b.referenceUrl?.startsWith("https://") && !/nearblocks|circle|tether/.test(b.referenceUrl) ? b.referenceUrl : undefined,
    officialTokens: [],
    officialSocials: b.officialSocials ?? {},
    keywords: [...new Set(b.keywords.map((k) => k.toLowerCase()).filter((k) => k.length >= 4))],
    // Legacy domains are the brand's own, but some lapsed (burrow.cash): they are not allowlisted here.
    allowlist: [],
  };
}

function run(b: NearBrand): Promise<number> {
  const file = join(profiles, `${b.id}.json`);
  writeFileSync(file, JSON.stringify(engineProfile(b), null, 2) + "\n");
  const args = ["tsx", join(ROOT, "scripts/engine-run.ts"), "scan", file, "--no-tokens", "--fast", "--out", out, "--days", values.days!, "--nrd-days", values["nrd-days"]!, "--max-pages", values["max-pages"]!, "--max-render", values["max-render"]!];
  return new Promise((resolve) => {
    const child = spawn("npx", args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, MW_SKIP_CT: skipCt ? "1" : "" } });
    const log = (d: Buffer) => process.stdout.write(d.toString().split("\n").filter(Boolean).map((l) => `[${b.id}] ${l}\n`).join(""));
    child.stdout.on("data", log);
    child.stderr.on("data", log);
    child.on("close", (c) => resolve(c ?? 1));
  });
}

/** crt.sh is often down; when it does not answer a small query in 30 s, skip CT for this run (recorded in each report). */
async function crtUp(): Promise<boolean> {
  try {
    const r = await fetch("https://crt.sh/?q=pikespeak.ai&output=json", { signal: AbortSignal.timeout(30_000) });
    return r.ok;
  } catch {
    return false;
  }
}
const skipCt = values["skip-ct"] || (!values["merge-only"] && !(await crtUp()));
if (skipCt && !values["merge-only"]) console.log("crt.sh is not answering: certificate-transparency search is skipped in this run (reports say so)");

if (!values["merge-only"]) {
  const queue = [...brands];
  const jobs = Number(values.jobs);
  await Promise.all(
    Array.from({ length: jobs }, async () => {
      for (let b = queue.shift(); b; b = queue.shift()) {
        const code = await run(b);
        console.log(`[${b.id}] finished with code ${code}`);
      }
    }),
  );
}

// Merge: one findings.json per brand folder -> domains.json in this project's shape.
const scans: EngineScan[] = [];
for (const d of readdirSync(out)) {
  const f = join(out, d, "findings.json");
  if (existsSync(f)) scans.push(JSON.parse(readFileSync(f, "utf8")) as EngineScan);
}
const all = loadBrands().brands;
const merged = domainCandidates(scans, all);
writeFileSync(join(out, "..", "domains.json"), JSON.stringify({ scannedAt: scans.map((s) => s.startedAt).sort()[0], brands: scans.length, ...merged }, null, 2));
console.log(`merged ${scans.length} brand scans: ${merged.findings.length} domain findings -> ${join(out, "..", "domains.json")}`);

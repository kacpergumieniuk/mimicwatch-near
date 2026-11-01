/**
 * npm run check -- <account | domain | URL> [...more] [--registry <contract>] [--rpc <url>] [--json] [--no-brands]
 *
 * "Check before you send": ALLOW / WARN / BLOCK with reasons, from the on-chain registry plus the offline
 * lookalike test against the NEAR brand list. Read-only; no keys.
 */
import { parseArgs } from "node:util";
import { BrandIndex, loadBrands } from "../src/brands.ts";
import { loadDeployment } from "../src/registry/local.ts";
import { checkNearRecipient } from "../src/sdk/check.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { registry: { type: "string" }, rpc: { type: "string" }, json: { type: "boolean", default: false }, "no-brands": { type: "boolean", default: false } },
});
const dep = loadDeployment("testnet");
const registry = values.registry ?? process.env.MIMICWATCH_REGISTRY ?? dep?.registry.id ?? "";
const rpcUrl = values.rpc ?? process.env.MIMICWATCH_RPC ?? dep?.rpcUrl ?? "https://test.rpc.fastnear.com";
const brands = values["no-brands"] ? false : new BrandIndex(loadBrands());
if (!positionals.length) {
  console.error("usage: npm run check -- <account | domain | URL> [...]");
  process.exit(2);
}
const color = (v: string) => (v === "BLOCK" ? `\x1b[1;31m${v}\x1b[0m` : v === "WARN" ? `\x1b[1;33m${v}\x1b[0m` : `\x1b[1;32m${v}\x1b[0m`);
for (const p of positionals) {
  const r = await checkNearRecipient(p, { registry, rpcUrl, brands });
  if (values.json) {
    console.log(JSON.stringify(r, null, 2));
    continue;
  }
  console.log(`${color(r.verdict).padEnd(16)} ${r.subject} (${r.kind})`);
  for (const x of r.reasons) console.log(`        ${x.code.padEnd(24)} ${x.message}`);
}
if (!registry) console.error("(no registry configured: heuristics only. Run npm run testnet:setup or pass --registry)");

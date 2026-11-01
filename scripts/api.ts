/**
 * npm run api [-- --port 8787]   A tiny read-only HTTP API in front of the registry, for wallets that prefer HTTP.
 *
 *   GET /check?id=<account|domain|url>   -> { verdict, subject, kind, reasons, registry }
 *   GET /entries?from=0&limit=50         -> registry entries
 *   GET /stats                           -> registry counters
 */
import { createServer } from "node:http";
import { parseArgs } from "node:util";
import { BrandIndex, loadBrands } from "../src/brands.ts";
import { RegistryViews } from "../src/registry/client.ts";
import { loadDeployment } from "../src/registry/local.ts";
import { checkNearRecipient } from "../src/sdk/check.ts";

const { values } = parseArgs({ options: { port: { type: "string", default: "8787" } } });
const dep = loadDeployment("testnet");
const registry = process.env.MIMICWATCH_REGISTRY ?? dep?.registry.id ?? "";
const rpcUrl = process.env.MIMICWATCH_RPC ?? dep?.rpcUrl ?? "https://test.rpc.fastnear.com";
const brands = new BrandIndex(loadBrands());
const views = new RegistryViews(registry, rpcUrl);

createServer(async (req, res) => {
  const u = new URL(req.url ?? "/", "http://localhost");
  const send = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(body, null, 2));
  };
  try {
    if (req.method !== "GET") return send(405, { error: "GET only" });
    if (u.pathname === "/check") {
      const id = u.searchParams.get("id");
      if (!id || id.length > 300) return send(400, { error: "id required (max 300 chars)" });
      return send(200, await checkNearRecipient(id, { registry, rpcUrl, brands }));
    }
    if (u.pathname === "/entries") return send(200, await views.listEntries(Number(u.searchParams.get("from") ?? 0), Math.min(100, Number(u.searchParams.get("limit") ?? 50))));
    if (u.pathname === "/stats") return send(200, { registry, ...(await views.stats()) });
    return send(404, { error: "try /check?id=ref-flnance.near, /entries or /stats" });
  } catch (e) {
    return send(502, { error: (e as Error).message });
  }
}).listen(Number(values.port), "127.0.0.1", () => console.log(`mimicwatch-near API on http://127.0.0.1:${values.port} (registry ${registry || "none"})`));

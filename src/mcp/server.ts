/**
 * MCP server (stdio) with one tool, `check_near_recipient`: an agent calls it before it sends funds to a
 * NEAR account or opens a link. Read-only; no keys.
 *
 *   npm run mcp                         # uses .mimicwatch-local/testnet.json or MIMICWATCH_REGISTRY
 *   claude mcp add mimicwatch-near -- npx tsx /path/to/mimicwatch-near/src/mcp/server.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BrandIndex, loadBrands } from "../brands.ts";
import { loadDeployment } from "../registry/local.ts";
import { checkNearRecipient, type CheckOptions } from "../sdk/check.ts";

export function buildServer(opts: CheckOptions): McpServer {
  const server = new McpServer({ name: "mimicwatch-near", version: "0.1.0" });
  server.registerTool(
    "check_near_recipient",
    {
      title: "Check a NEAR recipient before sending",
      description:
        "Before sending funds to a NEAR account, or opening a link, ask the Mimicwatch registry. Returns verdict ALLOW, WARN or BLOCK with reasons. " +
        "BLOCK: do not send. WARN: ask the human first. Accepts a NEAR account (alice.near), a domain or a URL.",
      inputSchema: { recipient: z.string().min(2).max(300).describe("NEAR account id, domain or URL") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ recipient }) => {
      const r = await checkNearRecipient(recipient, opts);
      const text = `${r.verdict}: ${r.subject} (${r.kind})\n${r.reasons.map((x) => `- ${x.code}: ${x.message}`).join("\n")}`;
      return { content: [{ type: "text", text }], structuredContent: { verdict: r.verdict, subject: r.subject, kind: r.kind, reasons: r.reasons } };
    },
  );
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dep = loadDeployment("testnet");
  const server = buildServer({
    registry: process.env.MIMICWATCH_REGISTRY ?? dep?.registry.id ?? "",
    rpcUrl: process.env.MIMICWATCH_RPC ?? dep?.rpcUrl ?? "https://test.rpc.fastnear.com",
    brands: new BrandIndex(loadBrands()),
  });
  await server.connect(new StdioServerTransport());
}

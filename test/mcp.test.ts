import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { buildServer } from "../src/mcp/server.ts";
import type { FlagResult } from "../src/registry/client.ts";
import { index } from "./fixtures.ts";

const flagged: FlagResult = {
  query: "ref-flnance.near", flagged: true, via: "exact", cleared: null,
  entry: { subject: "ref-flnance.near", kind: "account", category: "impersonation", severity: "high", status: "active", brand: "rhea", evidence_url: "https://e/x.json", evidence_hash: "a".repeat(64), note: null, reporter: "r", reported_at_ms: 1, updated_at_ms: 1, dispute: null, disputes_rejected: 0 },
};

describe("MCP tool check_near_recipient", () => {
  it("lists the tool and answers BLOCK / ALLOW", async () => {
    const server = buildServer({
      views: { isFlagged: async (id: string) => (id === "ref-flnance.near" ? flagged : { query: id, flagged: false, via: null, entry: null, cleared: null }) },
      brands: index(),
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(b);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(["check_near_recipient"]);
    expect(tools.tools[0].annotations?.readOnlyHint).toBe(true);
    const r = await client.callTool({ name: "check_near_recipient", arguments: { recipient: "ref-flnance.near" } });
    expect((r.structuredContent as { verdict: string }).verdict).toBe("BLOCK");
    expect((r.content as Array<{ text: string }>)[0].text).toMatch(/^BLOCK: ref-flnance.near/);
    const ok = await client.callTool({ name: "check_near_recipient", arguments: { recipient: "v2.ref-finance.near" } });
    expect((ok.structuredContent as { verdict: string }).verdict).toBe("ALLOW");
    await client.close();
  });
});

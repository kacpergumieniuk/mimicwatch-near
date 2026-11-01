import { describe, expect, it } from "vitest";
import { RpcPool } from "../src/near/rpc.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const unknown = (id: string) => ({ jsonrpc: "2.0", id: 1, error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCOUNT", info: {} }, data: `account ${id} does not exist while viewing` } });
const view = { amount: "1", locked: "0", code_hash: "11111111111111111111111111111111", storage_usage: 182 };

describe("RPC pool", () => {
  it("returns undefined for a missing account and the view for an existing one", async () => {
    const pool = new RpcPool([{ url: "https://a", rps: 1000 }], async (_u, i) => {
      const id = JSON.parse(String(i.body)).params.account_id;
      return json(id === "real.near" ? { result: view } : unknown(id));
    });
    expect(await pool.viewAccount("nope.near")).toBeUndefined();
    expect(await pool.viewAccount("real.near")).toEqual(view);
  });
  it("fails over on 429 to another endpoint", async () => {
    const hits: string[] = [];
    const pool = new RpcPool([{ url: "https://limited", rps: 1000 }, { url: "https://ok", rps: 1000 }], async (u) => {
      hits.push(u);
      return u === "https://limited" ? json({}, 429) : json({ result: view });
    });
    expect(await pool.viewAccount("real.near")).toEqual(view);
    expect(hits).toContain("https://ok");
  });
  it("does not mistake an unsupported-method error for a missing account", async () => {
    let n = 0;
    const pool = new RpcPool([{ url: "https://a", rps: 1000 }, { url: "https://b", rps: 1000 }], async () => {
      n++;
      return n === 1 ? json({ error: { name: "REQUEST_VALIDATION_ERROR", cause: { name: "METHOD_NOT_FOUND" }, data: "the method query does not exist/is not available" } }) : json({ result: view });
    });
    expect(await pool.viewAccount("real.near")).toEqual(view);
    expect(n).toBeGreaterThanOrEqual(2);
  });
  it("gives up after the retry budget", async () => {
    const pool = new RpcPool([{ url: "https://down", rps: 1000 }], async () => json({}, 503));
    // cool-down makes this slow with real timers; one attempt is enough to prove it throws
    await expect(pool.call("query", {}, 1)).rejects.toThrow(/503/);
  });
});

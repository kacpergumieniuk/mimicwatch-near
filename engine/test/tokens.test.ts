import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Address, Hex } from "viem";
import { describe, expect, it } from "vitest";
import { buildTokenIndex, CHAIN_CONFIG, tokensFromLogs, type TokenRpc } from "../src/tokens/index.ts";

const pad = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}` as Hex;
const WETH = "0x4200000000000000000000000000000000000006";
const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const cfg = CHAIN_CONFIG.base;
const v4 = cfg.sources[0];
const v2 = cfg.sources[2];

const v4Log = (c0: string, c1: string, block: number) => ({ address: v4.address, topics: [v4.topic0, pad("0x01"), pad(c0), pad(c1)], blockNumber: block });
const v2Log = (t0: string, t1: string, block: number) => ({ address: v2.address, topics: [v2.topic0, pad(t0), pad(t1)], blockNumber: block });

describe("tokensFromLogs", () => {
  it("takes token addresses from the right topics, drops quotes, keeps the first block", () => {
    const toks = tokensFromLogs(cfg, [v4Log(WETH, TOKEN_A, 120), v2Log(TOKEN_A, WETH, 100), v2Log(TOKEN_B, "0x0000000000000000000000000000000000000000", 130)]);
    expect(toks.map((t) => [t.address.toLowerCase(), t.firstBlock, t.source])).toEqual([
      [TOKEN_A, 100, "uniswap-v2"],
      [TOKEN_B, 130, "uniswap-v2"],
    ]);
  });
  it("ignores logs from unknown contracts or topics", () => {
    expect(tokensFromLogs(cfg, [{ address: "0x0000000000000000000000000000000000000001" as Address, topics: [v4.topic0, pad(TOKEN_A), pad(TOKEN_B)], blockNumber: 1 }])).toEqual([]);
  });
});

describe("buildTokenIndex (mocked RPC)", () => {
  const head = 1_234_567;
  function rpc(failBelow = -1) {
    const calls = { logs: 0, meta: 0 };
    const r: TokenRpc = {
      blockNumber: async () => head,
      async getLogs(_a, _t, from) {
        calls.logs++;
        if (from < failBelow) throw new Error("Archive requests require a personal token");
        return from <= 1_225_000 && 1_225_000 <= from + 10_000 ? [v4Log(WETH, TOKEN_A, 1_225_000)] : [v2Log(TOKEN_B, WETH, from + 1)];
      },
      async metadata(addrs) {
        calls.meta++;
        return addrs.map((a) => (a.toLowerCase() === TOKEN_A ? { name: "Uniswap", symbol: "UNI" } : { name: "Bee", symbol: "BEE" }));
      },
    };
    return { r, calls };
  }

  it("scans aligned windows, fetches metadata once and reuses the cache", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bw-tok-"));
    const a = rpc();
    const idx = await buildTokenIndex("base", { days: 1, cacheDir: dir, rpc: a.r });
    // 1 day of Base = 43,200 blocks -> 5 aligned 10k windows
    expect(a.calls.logs).toBe(5);
    expect(idx.coveredDays).toBeCloseTo(1, 0);
    expect(idx.tokens.find((t) => t.address.toLowerCase() === TOKEN_A)).toMatchObject({ name: "Uniswap", symbol: "UNI" });
    const cache = JSON.parse(await readFile(join(dir, "tokens-base.json"), "utf8"));
    // the head window and the oldest (partial) window are not cached
    expect(Object.keys(cache.windows).length).toBe(3);
    const b = rpc();
    await buildTokenIndex("base", { days: 1, cacheDir: dir, rpc: b.r });
    expect(b.calls.logs).toBe(2);
    expect(b.calls.meta).toBe(0);
  });

  it("stops at ranges the free RPC refuses and reports the real coverage", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bw-tok-"));
    const a = rpc(head - 15_000);
    const idx = await buildTokenIndex("base", { days: 3, cacheDir: dir, rpc: a.r });
    expect(idx.coveredDays).toBeLessThan(1);
    expect(idx.errors.join(" ")).toMatch(/Archive/);
  });

  it("anchors Ethereum windows at the head (free RPC serves only the newest ~10k blocks)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bw-tok-"));
    const ranges: Array<[number, number]> = [];
    const r: TokenRpc = {
      blockNumber: async () => head,
      async getLogs(_a, _t, from, to) {
        ranges.push([from, to]);
        if (from < head - 9_999) throw new Error("Invalid parameters were provided to the RPC method.");
        return [];
      },
      metadata: async (a) => a.map(() => ({})),
    };
    const idx = await buildTokenIndex("ethereum", { days: 3, cacheDir: dir, rpc: r });
    expect(ranges[0]).toEqual([head - 9_999, head]);
    expect(idx.coveredDays).toBeCloseTo(1.4, 1);
  });
});

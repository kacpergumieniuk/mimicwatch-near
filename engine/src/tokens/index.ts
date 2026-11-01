/**
 * Index of recently traded-into-existence tokens, built from free RPC logs: every pool created on the main DEX
 * factories in the lookback window (same approach as canisell's scripts/launch-census.ts). A copycat token has to
 * get a pool to hurt anyone, so "new pools" is the useful definition of "new tokens" here.
 *
 * Coverage checked 2026-11-01: base-rpc.publicnode.com serves eth_getLogs ~30 days back in 10k-block windows;
 * ethereum-rpc.publicnode.com only serves recent blocks (older ranges need an archive token), so Ethereum
 * coverage is about a day. Windows are scanned newest first and the scan stops at the first range the RPC refuses;
 * the achieved coverage is reported.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicClient, getAddress, http, parseAbi, toEventSelector, type Address, type Hex, type PublicClient } from "viem";
import { base, mainnet } from "viem/chains";
import type { Chain } from "../brand.ts";
import { mapLimit } from "../util/http.ts";

export interface LogSource {
  name: string;
  address: Address;
  topic0: Hex;
  /** topic indexes holding the two token addresses */
  tokenTopics: [number, number];
}

export interface ChainConfig {
  chain: Chain;
  rpcUrl: string;
  blockTimeSec: number;
  window: number;
  sources: LogSource[];
  /** Quote assets that are never the copycat. */
  quotes: string[];
  /**
   * Align windows to multiples of `window` so runs can share cached windows. Off for Ethereum: the free RPC only
   * serves the newest ~10k blocks, so windows must be anchored at the head or the first one straddles the cutoff.
   */
  align: boolean;
  explorer: string;
}

const V4_INIT = toEventSelector("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
const V3_POOL = toEventSelector("PoolCreated(address,address,uint24,int24,address)");
const V2_PAIR = toEventSelector("PairCreated(address,address,address,uint256)");
const AERO_V2 = toEventSelector("PoolCreated(address,address,bool,address,uint256)");
const AERO_CL = toEventSelector("PoolCreated(address,address,int24,address)");

export const CHAIN_CONFIG: Record<Chain, ChainConfig> = {
  base: {
    chain: "base",
    rpcUrl: process.env.BASE_RPC_URL ?? "https://base-rpc.publicnode.com",
    blockTimeSec: 2,
    window: 10_000,
    align: true,
    explorer: "https://basescan.org",
    sources: [
      { name: "uniswap-v4", address: "0x498581fF718922c3f8e6A244956aF099B2652b2b", topic0: V4_INIT, tokenTopics: [2, 3] },
      { name: "uniswap-v3", address: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD", topic0: V3_POOL, tokenTopics: [1, 2] },
      { name: "uniswap-v2", address: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6", topic0: V2_PAIR, tokenTopics: [1, 2] },
      { name: "aerodrome-v2", address: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da", topic0: AERO_V2, tokenTopics: [1, 2] },
      { name: "aerodrome-cl", address: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A", topic0: AERO_CL, tokenTopics: [1, 2] },
    ],
    quotes: [
      "0x0000000000000000000000000000000000000000",
      "0x4200000000000000000000000000000000000006",
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca",
      "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
      "0x1111111111166b7fe7bd91427724b487980afc69", // ZORA
    ],
  },
  ethereum: {
    chain: "ethereum",
    rpcUrl: process.env.ETH_RPC_URL ?? "https://ethereum-rpc.publicnode.com",
    blockTimeSec: 12,
    window: 10_000,
    align: false,
    explorer: "https://etherscan.io",
    sources: [
      { name: "uniswap-v4", address: "0x000000000004444c5dc75cB358380D2e3dE08A90", topic0: V4_INIT, tokenTopics: [2, 3] },
      { name: "uniswap-v3", address: "0x1F98431c8aD98523631AE4a59f267346ea31F984", topic0: V3_POOL, tokenTopics: [1, 2] },
      { name: "uniswap-v2", address: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", topic0: V2_PAIR, tokenTopics: [1, 2] },
    ],
    quotes: [
      "0x0000000000000000000000000000000000000000",
      "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "0xdac17f958d2ee523a2206206994597c13d831ec7",
      "0x6b175474e89094c44da98b954eedeac495271d0f",
      "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    ],
  },
};

export interface IndexedToken {
  address: Address;
  firstBlock: number;
  source: string;
  name?: string;
  symbol?: string;
}

export interface TokenIndex {
  chain: Chain;
  head: number;
  fromBlock: number;
  /** Oldest block actually covered (> fromBlock when the RPC refused older ranges). */
  coveredFrom: number;
  coveredDays: number;
  tokens: IndexedToken[];
  errors: string[];
}

/** Narrow RPC surface for tests. */
export interface TokenRpc {
  blockNumber(): Promise<number>;
  getLogs(addresses: Address[], topic0s: Hex[], from: number, to: number): Promise<{ address: Address; topics: Hex[]; blockNumber: number }[]>;
  /** name/symbol per address; undefined entries when the call failed */
  metadata(addresses: Address[]): Promise<Array<{ name?: string; symbol?: string }>>;
}

const META_ABI = parseAbi(["function name() view returns (string)", "function symbol() view returns (string)"]);

export function viemTokenRpc(cfg: ChainConfig): TokenRpc {
  const client = createPublicClient({
    chain: cfg.chain === "base" ? base : mainnet,
    transport: http(cfg.rpcUrl, { timeout: 30_000, retryCount: 2, retryDelay: 1_000 }),
  }) as PublicClient;
  return {
    blockNumber: async () => Number(await client.getBlockNumber()),
    async getLogs(addresses, topic0s, from, to) {
      const logs = (await client.request({
        method: "eth_getLogs",
        params: [{ address: addresses, topics: [topic0s], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }],
      } as any)) as any[];
      return logs.map((l) => ({ address: l.address, topics: l.topics, blockNumber: Number(l.blockNumber) }));
    },
    async metadata(addresses) {
      const contracts = addresses.flatMap((a) => [
        { address: a, abi: META_ABI, functionName: "name" as const },
        { address: a, abi: META_ABI, functionName: "symbol" as const },
      ]);
      const res = await client.multicall({ contracts, allowFailure: true, batchSize: 0 });
      return addresses.map((_, i) => ({
        name: res[2 * i].status === "success" ? String(res[2 * i].result).slice(0, 120) : undefined,
        symbol: res[2 * i + 1].status === "success" ? String(res[2 * i + 1].result).slice(0, 40) : undefined,
      }));
    },
  };
}

const topicAddr = (t: Hex | undefined) => (t && t.length === 66 ? getAddress(`0x${t.slice(26)}`) : undefined);

/** Pool-creation logs -> unique non-quote tokens with the first block they got a pool in. */
export function tokensFromLogs(cfg: ChainConfig, logs: { address: Address; topics: Hex[]; blockNumber: number }[]): IndexedToken[] {
  const quotes = new Set(cfg.quotes);
  const out = new Map<string, IndexedToken>();
  for (const l of logs) {
    const src = cfg.sources.find((s) => s.address.toLowerCase() === l.address.toLowerCase() && s.topic0 === l.topics[0]);
    if (!src) continue;
    for (const ti of src.tokenTopics) {
      const a = topicAddr(l.topics[ti]);
      if (!a || quotes.has(a.toLowerCase())) continue;
      const prev = out.get(a.toLowerCase());
      if (!prev || l.blockNumber < prev.firstBlock) out.set(a.toLowerCase(), { address: a, firstBlock: l.blockNumber, source: src.name });
    }
  }
  return [...out.values()];
}

interface Cache {
  windows: Record<string, IndexedToken[]>;
  meta: Record<string, { name?: string; symbol?: string }>;
}

async function readCache(file: string): Promise<Cache> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return { windows: {}, meta: {} };
  }
}

export interface IndexOptions {
  days: number;
  cacheDir: string;
  rpc?: TokenRpc;
  log?: (s: string) => void;
}

/** Builds (or reuses from .cache) the token index for one chain. Windows are aligned so runs can share them. */
export async function buildTokenIndex(chain: Chain, o: IndexOptions): Promise<TokenIndex> {
  const cfg = CHAIN_CONFIG[chain];
  const rpc = o.rpc ?? viemTokenRpc(cfg);
  const log = o.log ?? (() => {});
  const cacheFile = join(o.cacheDir, `tokens-${chain}.json`);
  const cache = await readCache(cacheFile);
  const head = await rpc.blockNumber();
  const fromBlock = Math.max(0, head - Math.ceil((o.days * 86_400) / cfg.blockTimeSec));
  const errors: string[] = [];
  const all = new Map<string, IndexedToken>();
  const addresses = cfg.sources.map((s) => s.address);
  const topic0s = [...new Set(cfg.sources.map((s) => s.topic0))];

  // Windows newest first: aligned (cacheable) or anchored at the head.
  const windows: Array<[number, number]> = [];
  if (cfg.align) {
    for (let start = Math.floor(head / cfg.window) * cfg.window; start + cfg.window > fromBlock; start -= cfg.window)
      windows.push([Math.max(start, fromBlock), Math.min(start + cfg.window - 1, head)]);
  } else {
    for (let end = head; end >= fromBlock; end -= cfg.window) windows.push([Math.max(end - cfg.window + 1, fromBlock), end]);
  }

  let coveredFrom = head;
  let stop = false;
  let done = 0;
  await mapLimit(windows, 3, async ([a, b]) => {
    if (stop) return;
    const key = `${a}-${b}`;
    const complete = cfg.align && b === Math.floor(a / cfg.window) * cfg.window + cfg.window - 1 && a % cfg.window === 0;
    let toks = cache.windows[key];
    if (!toks) {
      try {
        toks = tokensFromLogs(cfg, await rpc.getLogs(addresses, topic0s, a, b));
        if (complete) cache.windows[key] = toks;
      } catch (e) {
        const msg = (e as Error).message.split("\n")[0].slice(0, 160);
        errors.push(`logs ${a}-${b}: ${msg}`);
        if (/archive|personal token|pruned|too old|403|invalid parameters/i.test(msg)) stop = true;
        return;
      }
    }
    coveredFrom = Math.min(coveredFrom, a);
    for (const t of toks) {
      const prev = all.get(t.address.toLowerCase());
      if (!prev || t.firstBlock < prev.firstBlock) all.set(t.address.toLowerCase(), { ...t });
    }
    if (++done % 20 === 0) log(`[tokens:${chain}] ${done}/${windows.length} log windows`);
  });

  // Metadata for tokens not cached yet.
  const need = [...all.values()].filter((t) => !cache.meta[t.address.toLowerCase()]);
  log(`[tokens:${chain}] ${all.size} tokens with new pools, ${need.length} need name/symbol`);
  const CHUNK = 250;
  const chunks: IndexedToken[][] = [];
  for (let i = 0; i < need.length; i += CHUNK) chunks.push(need.slice(i, i + CHUNK));
  let metaDone = 0;
  await mapLimit(chunks, 4, async (c) => {
    try {
      const md = await rpc.metadata(c.map((t) => t.address));
      c.forEach((t, i) => (cache.meta[t.address.toLowerCase()] = md[i] ?? {}));
    } catch (e) {
      errors.push(`metadata: ${(e as Error).message.split("\n")[0].slice(0, 120)}`);
    }
    if (++metaDone % 50 === 0) log(`[tokens:${chain}] metadata ${metaDone}/${chunks.length} batches`);
  });
  await mkdir(o.cacheDir, { recursive: true });
  await writeFile(cacheFile, JSON.stringify(cache));

  const tokens = [...all.values()].map((t) => ({ ...t, ...cache.meta[t.address.toLowerCase()] }));
  return {
    chain,
    head,
    fromBlock,
    coveredFrom,
    coveredDays: Math.round((((head - coveredFrom) * cfg.blockTimeSec) / 86_400) * 10) / 10,
    tokens,
    errors: errors.slice(0, 20),
  };
}

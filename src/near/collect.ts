/**
 * Collects raw on-chain facts for lookalike candidates: existence (RPC `view_account`), keys, the
 * creation transaction, recent activity, and token metadata for contracts. The output (`raw.json`)
 * is the recorded scan data: scoring (`analyze.ts`) is a pure function of it, so a recorded scan
 * can be re-scored offline and gives the same findings every time.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mapLimit } from "../../engine/src/util/http.ts";
import type { BrandIndex } from "../brands.ts";
import { FastNear, type AccountTx, type TxDetail } from "./fastnear.ts";
import { STRONG_FUZZERS, subAccountProbes, type NearCandidate } from "./permute.ts";
import { EMPTY_CODE_HASH, RpcPool, type AccessKeyInfo, type AccountView } from "./rpc.ts";

export interface ActionSummary {
  kind: string;
  deposit?: string;
  method?: string;
}

export interface TxSummary {
  hash: string;
  signer: string;
  receiver: string;
  timestampNs: string;
  actions: ActionSummary[];
}

export interface FtMetadata {
  name?: string;
  symbol?: string;
  decimals?: number;
  icon?: string | null;
  reference?: string | null;
}

export interface AccountRaw {
  id: string;
  candidate: NearCandidate;
  view: AccountView;
  keys: Array<{ publicKey: string; fullAccess: boolean; receiver?: string }>;
  txsCount: number;
  /** Newest first, at most 200. */
  recent: Array<{ hash: string; ts: string; signer: boolean; receiver: boolean; fn: boolean }>;
  creation?: TxSummary;
  /** Details of up to 30 recent transactions that touched the account. */
  details: TxSummary[];
  ft?: FtMetadata | null;
  /** Other accounts that hold one of this account's full-access keys. */
  keyAccounts: Record<string, string[]>;
  errors: string[];
}

export interface RawScan {
  tool: string;
  scannedAt: string;
  network: "mainnet";
  brands: number;
  candidates: number;
  byFuzzer: Record<string, number>;
  subAccountProbes: number;
  rpcRequests: number;
  indexerRequests: number;
  endpoints: string[];
  found: AccountRaw[];
  errors: string[];
}

export function summarizeActions(actions: TxDetail["actions"]): ActionSummary[] {
  return actions.map((a) => {
    if (typeof a === "string") return { kind: a };
    const [kind, body] = Object.entries(a)[0] ?? ["Unknown", {}];
    const b = (body ?? {}) as { deposit?: string; method_name?: string };
    const out: ActionSummary = { kind };
    if (b.deposit && b.deposit !== "0") out.deposit = b.deposit;
    if (b.method_name) out.method = b.method_name;
    return out;
  });
}

const toSummary = (t: TxDetail, ts?: string): TxSummary => ({
  hash: t.hash,
  signer: t.signer_id,
  receiver: t.receiver_id,
  timestampNs: t.block_timestamp ?? ts ?? "0",
  actions: summarizeActions(t.actions),
});

export interface CollectOptions {
  rpc?: RpcPool;
  fastnear?: FastNear;
  concurrency?: number;
  log?: (s: string) => void;
  /** Enrich at most this many found accounts (default: all). */
  maxEnrich?: number;
  /** Existence answers are cached here so an interrupted sweep can resume. */
  cachePath?: string;
}

/** Phase 1: which candidates exist on mainnet. `cachePath` lets an interrupted sweep resume. */
export async function existing(cands: NearCandidate[], o: CollectOptions & { rpc: RpcPool }): Promise<Array<{ c: NearCandidate; view: AccountView }>> {
  const log = o.log ?? (() => {});
  const found: Array<{ c: NearCandidate; view: AccountView }> = [];
  let done = 0;
  const errors: string[] = [];
  const cache: Record<string, AccountView | null> = o.cachePath && existsSync(o.cachePath) ? JSON.parse(readFileSync(o.cachePath, "utf8")) : {};
  const save = () => o.cachePath && writeFileSync(o.cachePath, JSON.stringify(cache));
  const cached = cands.filter((c) => c.id in cache).length;
  if (cached) log(`  ${cached} answers reused from ${o.cachePath}`);
  await mapLimit(cands, o.concurrency ?? 24, async (c) => {
    try {
      const v = c.id in cache ? (cache[c.id] ?? undefined) : await o.rpc.viewAccount(c.id);
      cache[c.id] = v ?? null;
      if (v) found.push({ c, view: v });
    } catch (e) {
      errors.push(`${c.id}: ${(e as Error).message}`);
    }
    if (++done % 500 === 0) {
      log(`  checked ${done}/${cands.length}, found ${found.length}`);
      save();
    }
  });
  save();
  if (errors.length) log(`  ${errors.length} lookups failed (e.g. ${errors[0]})`);
  return found.sort((a, b) => a.c.id.localeCompare(b.c.id));
}

/** Phase 3: activity, creator, keys, token metadata. */
export async function enrich(id: string, c: NearCandidate, view: AccountView, o: { rpc: RpcPool; fastnear: FastNear }): Promise<AccountRaw> {
  const errors: string[] = [];
  const raw: AccountRaw = { id, candidate: c, view, keys: [], txsCount: 0, recent: [], details: [], keyAccounts: {}, errors };
  try {
    const keys: AccessKeyInfo[] = await o.rpc.accessKeys(id);
    raw.keys = keys.map((k) => ({
      publicKey: k.public_key,
      fullAccess: k.access_key.permission === "FullAccess",
      receiver: typeof k.access_key.permission === "object" ? k.access_key.permission.FunctionCall.receiver_id : undefined,
    }));
  } catch (e) {
    errors.push(`keys: ${(e as Error).message}`);
  }
  let recent: AccountTx[] = [];
  try {
    const r = await o.fastnear.accountTxs(id);
    raw.txsCount = r.txs_count;
    recent = r.account_txs;
    raw.recent = recent.map((t) => ({ hash: t.transaction_hash, ts: t.tx_block_timestamp, signer: t.is_signer, receiver: t.is_receiver, fn: t.is_function_call }));
  } catch (e) {
    errors.push(`txs: ${(e as Error).message}`);
  }
  try {
    const first = raw.txsCount > recent.length ? await o.fastnear.firstTx(id) : recent.at(-1);
    // Details: the creation tx, the 20 newest, and the 10 newest inbound ones from others.
    const want = new Map<string, string>();
    if (first) want.set(first.transaction_hash, first.tx_block_timestamp);
    for (const t of recent.slice(0, 20)) want.set(t.transaction_hash, t.tx_block_timestamp);
    for (const t of recent.filter((t) => !t.is_signer).slice(0, 10)) want.set(t.transaction_hash, t.tx_block_timestamp);
    const details = await o.fastnear.transactions([...want.keys()]);
    raw.details = details.map((d) => toSummary(d, want.get(d.hash))).sort((a, b) => b.timestampNs.localeCompare(a.timestampNs));
    if (first) raw.creation = raw.details.find((d) => d.hash === first.transaction_hash);
  } catch (e) {
    errors.push(`details: ${(e as Error).message}`);
  }
  if (view.code_hash !== EMPTY_CODE_HASH) {
    raw.ft = (await o.rpc.view<FtMetadata>(id, "ft_metadata").catch(() => undefined)) ?? null;
    if (raw.ft?.icon && raw.ft.icon.length > 200) raw.ft.icon = `${raw.ft.icon.slice(0, 60)}… (${raw.ft.icon.length} chars)`;
  }
  for (const k of raw.keys.filter((k) => k.fullAccess).slice(0, 3)) {
    try {
      raw.keyAccounts[k.publicKey] = (await o.fastnear.accountsForKey(k.publicKey)).filter((a) => a !== id).slice(0, 50);
    } catch (e) {
      errors.push(`key lookup: ${(e as Error).message}`);
    }
  }
  return raw;
}

/** The whole collection: existence sweep, sub-account probes on found lookalikes, enrichment. */
export async function collect(index: BrandIndex, cands: NearCandidate[], o: CollectOptions = {}): Promise<RawScan> {
  const log = o.log ?? (() => {});
  const rpc = o.rpc ?? new RpcPool();
  const fastnear = o.fastnear ?? new FastNear();
  const scannedAt = new Date().toISOString();
  const byFuzzer: Record<string, number> = {};
  for (const c of cands) byFuzzer[c.fuzzer] = (byFuzzer[c.fuzzer] ?? 0) + 1;

  log(`phase 1: view_account for ${cands.length} candidates`);
  const found = await existing(cands, { ...o, rpc, log });
  log(`  ${found.length} exist`);

  // Phase 2: does a found lookalike copy official sub-account names (v2.ref-flnance.near)?
  // Only close copies (lookalike letters, separators, fake sub-accounts, the bare name) are worth probing.
  const probes = found
    .filter(({ c }) => [...STRONG_FUZZERS, "bare-stem", "other-tla"].includes(c.fuzzer) && c.fuzzer !== "sub-account-of-lookalike")
    .flatMap(({ c }) => {
      const b = index.byId(c.brand);
      return b ? subAccountProbes(c.id, b, c.imitates) : [];
    })
    .filter((p) => !found.some((f) => f.c.id === p.id));
  log(`phase 2: ${probes.length} sub-account probes`);
  const subFound = await existing(probes, { ...o, rpc, log });
  log(`  ${subFound.length} exist`);
  const all = [...found, ...subFound];

  const toEnrich = all.slice(0, o.maxEnrich ?? all.length);
  log(`phase 3: enriching ${toEnrich.length} accounts`);
  let n = 0;
  const raws = await mapLimit(toEnrich, 3, async ({ c, view }) => {
    const r = await enrich(c.id, c, view, { rpc, fastnear });
    if (++n % 25 === 0) log(`  enriched ${n}/${toEnrich.length}`);
    return r;
  });
  return {
    tool: "mimicwatch-near/0.1",
    scannedAt,
    network: "mainnet",
    brands: index.brands.length,
    candidates: cands.length,
    byFuzzer,
    subAccountProbes: probes.length,
    rpcRequests: rpc.requests,
    indexerRequests: fastnear.requests,
    endpoints: [],
    found: raws,
    errors: raws.flatMap((r) => r.errors.map((e) => `${r.id}: ${e}`)),
  };
}

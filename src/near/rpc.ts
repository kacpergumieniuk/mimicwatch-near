/**
 * Read-only NEAR JSON-RPC over a pool of free public endpoints, with a per-endpoint rate limit and
 * failover on 429/5xx. Mainnet lookups never sign anything.
 */
import { sleep } from "../../engine/src/util/http.ts";

export interface Endpoint {
  url: string;
  /** Requests per second we allow ourselves on this endpoint. */
  rps: number;
}

/** Free mainnet RPCs (docs.near.org/api/rpc/providers), checked 2026-11-01. FastNEAR first. */
export const MAINNET_RPCS: Endpoint[] = [
  { url: "https://rpc.mainnet.fastnear.com", rps: 3 },
  { url: "https://free.rpc.fastnear.com", rps: 3 },
  { url: "https://archival-rpc.mainnet.fastnear.com", rps: 4 },
  { url: "https://near.drpc.org", rps: 8 },
  { url: "https://rpc.shitzuapes.xyz", rps: 4 },
  { url: "https://1rpc.io/near", rps: 2 },
  { url: "https://rpc.intea.rs", rps: 2 },
  { url: "https://rpc.mainnet.near.org", rps: 1 },
];
export const TESTNET_RPCS: Endpoint[] = [
  { url: "https://test.rpc.fastnear.com", rps: 5 },
  { url: "https://rpc.testnet.near.org", rps: 2 },
];

export class RpcError extends Error {
  constructor(
    message: string,
    readonly cause_name?: string,
  ) {
    super(message);
  }
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface Slot {
  ep: Endpoint;
  next: number;
  coolUntil: number;
  fails: number;
}

export interface AccountView {
  amount: string;
  locked: string;
  code_hash: string;
  storage_usage: number;
}

export interface AccessKeyInfo {
  public_key: string;
  access_key: { nonce: number; permission: "FullAccess" | { FunctionCall: { allowance: string | null; receiver_id: string; method_names: string[] } } };
}

/** RPC error causes that describe the request, not the node: never retried. */
const FINAL_CAUSES = new Set([
  "UNKNOWN_ACCOUNT", "UNKNOWN_ACCESS_KEY", "NO_CONTRACT_CODE", "CONTRACT_EXECUTION_ERROR", "INVALID_ACCOUNT", "UNKNOWN_TRANSACTION",
  "PARSE_ERROR", "TOO_LARGE_CONTRACT_STATE",
]);

export const EMPTY_CODE_HASH = "11111111111111111111111111111111";

export class RpcPool {
  private readonly slots: Slot[];
  private readonly fetchImpl: FetchLike;
  private rr = 0;
  requests = 0;

  constructor(endpoints: Endpoint[] = MAINNET_RPCS, fetchImpl: FetchLike = (u, i) => fetch(u, i)) {
    this.slots = endpoints.map((ep) => ({ ep, next: 0, coolUntil: 0, fails: 0 }));
    this.fetchImpl = fetchImpl;
  }

  /** Picks the endpoint that is free soonest and reserves a slot on it. */
  private async acquire(): Promise<Slot> {
    for (;;) {
      const now = Date.now();
      const ready = this.slots
        .map((s, i) => ({ s, i, at: Math.max(s.next, s.coolUntil) }))
        .sort((a, b) => a.at - b.at || ((a.i - this.rr + 99) % this.slots.length) - ((b.i - this.rr + 99) % this.slots.length))[0];
      const wait = ready.at - now;
      if (wait <= 0) {
        ready.s.next = now + 1000 / ready.s.ep.rps;
        this.rr = (ready.i + 1) % this.slots.length;
        return ready.s;
      }
      await sleep(Math.min(wait, 1000));
    }
  }

  async call<T>(method: string, params: unknown, attempts = 6): Promise<T> {
    let lastErr: unknown;
    for (let a = 0; a < attempts; a++) {
      const slot = await this.acquire();
      this.requests++;
      try {
        const res = await this.fetchImpl(slot.ep.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "mw", method, params }),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status === 429 || res.status >= 500) {
          slot.fails++;
          slot.coolUntil = Date.now() + Math.min(60_000, 3_000 * 2 ** Math.min(slot.fails, 4));
          lastErr = new Error(`HTTP ${res.status} from ${slot.ep.url}`);
          continue;
        }
        const body = (await res.json()) as { result?: T; error?: { name?: string; cause?: { name?: string }; data?: string; message?: string } };
        slot.fails = 0;
        if (body.error) {
          const cause = body.error.cause?.name ?? body.error.name ?? "";
          const msg = String(body.error.data ?? body.error.message ?? cause);
          // Answers about the request itself are final; anything else (unsupported method, timeouts,
          // lagging nodes) is retried on another endpoint.
          if (FINAL_CAUSES.has(cause) || /account \S+ does not exist/.test(msg)) throw new RpcError(msg, cause || "UNKNOWN_ACCOUNT");
          lastErr = new RpcError(`${cause}: ${msg} (${slot.ep.url})`, cause);
          slot.coolUntil = Date.now() + 5_000;
          continue;
        }
        // Some providers answer view errors inside result: { error: "..." }.
        const r = body.result as unknown as { error?: string };
        if (r && typeof r === "object" && typeof r.error === "string") {
          if (/account \S+ does not exist/.test(r.error)) throw new RpcError(r.error, "UNKNOWN_ACCOUNT");
          throw new RpcError(r.error, "CONTRACT_ERROR");
        }
        return body.result as T;
      } catch (e) {
        if (e instanceof RpcError && (FINAL_CAUSES.has(e.cause_name ?? "") || e.cause_name === "CONTRACT_ERROR")) throw e;
        slot.fails++;
        slot.coolUntil = Date.now() + 2_000;
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  /** `undefined` when the account does not exist. */
  async viewAccount(accountId: string): Promise<AccountView | undefined> {
    try {
      return await this.call<AccountView>("query", { request_type: "view_account", finality: "final", account_id: accountId });
    } catch (e) {
      if (e instanceof RpcError && e.cause_name === "UNKNOWN_ACCOUNT") return undefined;
      throw e;
    }
  }

  async accessKeys(accountId: string): Promise<AccessKeyInfo[]> {
    const r = await this.call<{ keys: AccessKeyInfo[] }>("query", { request_type: "view_access_key_list", finality: "final", account_id: accountId });
    return r.keys;
  }

  /** Read-only contract view. `undefined` if the method does not exist or panics. */
  async view<T>(accountId: string, method: string, args: unknown = {}): Promise<T | undefined> {
    try {
      const r = await this.call<{ result: number[] }>("query", {
        request_type: "call_function",
        finality: "final",
        account_id: accountId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      });
      return JSON.parse(Buffer.from(r.result).toString("utf8")) as T;
    } catch (e) {
      if (e instanceof RpcError && (FINAL_CAUSES.has(e.cause_name ?? "") || e.cause_name === "CONTRACT_ERROR")) return undefined;
      throw e;
    }
  }

  async chainId(): Promise<string> {
    const r = await this.call<{ chain_id: string }>("status", []);
    return r.chain_id;
  }
}

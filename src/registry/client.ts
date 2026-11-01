/**
 * Registry client. Views are plain JSON-RPC `call_function` (no SDK needed); writes sign with
 * near-api-js. Writes refuse mainnet: this project only publishes to testnet or a local sandbox.
 */
import { Account, actions, JsonRpcProvider, type KeyPairString, teraToGas } from "near-api-js";
import type { ReportInput, RegistryWriter } from "../publish/publisher.ts";

export interface Dispute {
  by: string;
  by_subject: boolean;
  reason: string;
  deposit: string;
  at_ms: number;
}

export interface Entry {
  subject: string;
  kind: "account" | "domain";
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "active" | "disputed";
  brand: string | null;
  evidence_url: string;
  evidence_hash: string;
  note: string | null;
  reporter: string;
  reported_at_ms: number;
  updated_at_ms: number;
  dispute: Dispute | null;
  disputes_rejected: number;
}

export interface Cleared {
  subject: string;
  kind: "account" | "domain";
  by: string;
  reason: string;
  at_ms: number;
}

export interface FlagResult {
  query: string;
  flagged: boolean;
  via: "exact" | "parent-account" | "parent-domain" | null;
  entry: Entry | null;
  cleared: Cleared | null;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Read-only views. Works with any NEAR RPC URL. */
export class RegistryViews {
  constructor(
    readonly contract: string,
    readonly rpcUrl: string,
    private readonly fetchImpl: FetchLike = (u, i) => fetch(u, i),
  ) {}

  async view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    const res = await this.fetchImpl(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "mw",
        method: "query",
        params: { request_type: "call_function", finality: "optimistic", account_id: this.contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`registry RPC HTTP ${res.status}`);
    const body = (await res.json()) as { result?: { result?: number[]; error?: string }; error?: { data?: string; message?: string } };
    if (body.error) throw new Error(`registry view ${method}: ${body.error.data ?? body.error.message}`);
    if (!body.result?.result) throw new Error(`registry view ${method}: ${body.result?.error ?? "no result"}`);
    return JSON.parse(Buffer.from(body.result.result).toString("utf8")) as T;
  }

  isFlagged(id: string) {
    return this.view<FlagResult>("is_flagged", { id });
  }
  checkMany(ids: string[]) {
    return this.view<FlagResult[]>("check_many", { ids });
  }
  listEntries(fromIndex = 0, limit = 100) {
    return this.view<Entry[]>("list_entries", { from_index: fromIndex, limit });
  }
  stats() {
    return this.view<{ entries: number; active: number; disputed: number; cleared: number; reporters: number }>("stats");
  }
  getEntry(subject: string, kind: "account" | "domain") {
    return this.view<Entry | null>("get_entry", { subject, kind });
  }
}

export interface TxOutcome {
  tx: string;
  logs: string[];
  value: unknown;
}

function outcomeOf(o: unknown): TxOutcome {
  const x = o as {
    transaction: { hash: string };
    transaction_outcome: { outcome: { logs: string[] } };
    receipts_outcome: Array<{ outcome: { logs: string[] } }>;
    status: { SuccessValue?: string; Failure?: unknown };
  };
  if (x.status && "Failure" in x.status && x.status.Failure) throw new Error(`transaction failed: ${JSON.stringify(x.status.Failure)}`);
  const v = x.status?.SuccessValue;
  return {
    tx: x.transaction.hash,
    logs: [...x.transaction_outcome.outcome.logs, ...x.receipts_outcome.flatMap((r) => r.outcome.logs)],
    value: v ? JSON.parse(Buffer.from(v, "base64").toString("utf8") || "null") : null,
  };
}

/** Signs registry calls as one account (reporter, owner, or anyone disputing). */
export class RegistrySigner implements RegistryWriter {
  readonly account: Account;
  readonly views: RegistryViews;

  constructor(
    readonly contract: string,
    readonly network: string,
    readonly rpcUrl: string,
    accountId: string,
    key: KeyPairString,
  ) {
    if (network === "mainnet" || /mainnet/.test(rpcUrl)) throw new Error("refusing to sign on mainnet: this project publishes to testnet or a local sandbox only");
    this.account = new Account(accountId, new JsonRpcProvider({ url: rpcUrl }), key);
    this.views = new RegistryViews(contract, rpcUrl);
  }

  async call(method: string, args: Record<string, unknown>, deposit: bigint = 0n): Promise<TxOutcome> {
    const r = await this.account.callFunctionRaw({ contractId: this.contract, methodName: method, args, deposit, gas: teraToGas("150"), waitUntil: "FINAL" });
    return outcomeOf(r);
  }

  async reportBatch(entries: ReportInput[]): Promise<{ tx: string }> {
    const r = await this.call("report_batch", { entries });
    return { tx: r.tx };
  }
  addReporter(accountId: string) {
    return this.call("add_reporter", { account_id: accountId }, 1n);
  }
  dispute(subject: string, kind: "account" | "domain", reason: string, depositYocto: bigint) {
    return this.call("dispute", { subject, kind, reason }, depositYocto);
  }
  resolveDispute(subject: string, kind: "account" | "domain", keep: boolean, note: string) {
    return this.call("resolve_dispute", { subject, kind, keep, note }, 1n);
  }
  remove(subject: string, kind: "account" | "domain", reason: string) {
    return this.call("remove", { subject, kind, reason }, 1n);
  }
}

/** Deploys the registry wasm to `accountId` and initialises it in one transaction. */
export async function deployRegistry(o: { rpcUrl: string; accountId: string; key: KeyPairString; wasm: Uint8Array; owner: string }): Promise<string> {
  if (/mainnet/.test(o.rpcUrl)) throw new Error("refusing to deploy to mainnet");
  const acc = new Account(o.accountId, new JsonRpcProvider({ url: o.rpcUrl }), o.key);
  const r = await acc.signAndSendTransaction({
    receiverId: o.accountId,
    actions: [actions.deployContract(o.wasm), actions.functionCall("new", { owner_id: o.owner }, teraToGas("50"), 0n)],
    waitUntil: "FINAL",
  });
  return outcomeOf(r).tx;
}

/**
 * Free FastNEAR indexers (no key): the transactions API (every transaction that touched an account,
 * from genesis) and the public-key API (which accounts a key controls). Read-only.
 */
import { politeSlot, sleep } from "../../engine/src/util/http.ts";

export const FASTNEAR = {
  tx: "https://tx.main.fastnear.com",
  api: "https://api.fastnear.com",
};

export interface AccountTx {
  transaction_hash: string;
  tx_block_height: number;
  tx_block_timestamp: string;
  is_signer: boolean;
  is_receiver: boolean;
  is_function_call: boolean;
  is_success?: boolean;
  is_predecessor?: boolean;
}

export interface TxAction {
  [kind: string]: unknown;
}

export interface TxDetail {
  hash: string;
  signer_id: string;
  receiver_id: string;
  actions: Array<string | TxAction>;
  block_timestamp?: string;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class FastNear {
  requests = 0;
  constructor(
    private readonly fetchImpl: FetchLike = (u, i) => fetch(u, i),
    private readonly minIntervalMs = 350,
  ) {}

  private async post<T>(base: string, path: string, body: unknown): Promise<T> {
    let last: unknown;
    for (let a = 0; a < 5; a++) {
      await politeSlot(new URL(base).host, this.minIntervalMs);
      this.requests++;
      try {
        const res = await this.fetchImpl(`${base}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        });
        if (res.status === 429 || res.status >= 500) {
          last = new Error(`HTTP ${res.status} ${base}${path}`);
          await sleep(2_000 * 2 ** a);
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} ${base}${path}`);
        return (await res.json()) as T;
      } catch (e) {
        last = e;
        await sleep(1_000 * 2 ** a);
      }
    }
    throw last instanceof Error ? last : new Error(String(last));
  }

  private async get<T>(base: string, path: string): Promise<T> {
    let last: unknown;
    for (let a = 0; a < 5; a++) {
      await politeSlot(new URL(base).host, this.minIntervalMs);
      this.requests++;
      try {
        const res = await this.fetchImpl(`${base}${path}`, { signal: AbortSignal.timeout(20_000) });
        if (res.status === 429 || res.status >= 500) {
          last = new Error(`HTTP ${res.status} ${base}${path}`);
          await sleep(2_000 * 2 ** a);
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} ${base}${path}`);
        return (await res.json()) as T;
      } catch (e) {
        last = e;
        await sleep(1_000 * 2 ** a);
      }
    }
    throw last instanceof Error ? last : new Error(String(last));
  }

  /** Newest transactions (up to 200) plus the total count. */
  async accountTxs(accountId: string, limit = 200): Promise<{ txs_count: number; account_txs: AccountTx[] }> {
    return this.post(FASTNEAR.tx, "/v0/account", { account_id: accountId, limit });
  }

  /** The first transaction that touched the account: its creation. */
  async firstTx(accountId: string): Promise<AccountTx | undefined> {
    const r = await this.post<{ account_txs: AccountTx[] }>(FASTNEAR.tx, "/v0/account", { account_id: accountId, desc: false, limit: 1 });
    return r.account_txs[0];
  }

  async transactions(hashes: string[]): Promise<TxDetail[]> {
    if (hashes.length === 0) return [];
    const out: TxDetail[] = [];
    for (let i = 0; i < hashes.length; i += 20) {
      const r = await this.post<{ transactions: Array<{ transaction: TxDetail; execution_outcome?: { block_timestamp?: string | number } }> }>(
        FASTNEAR.tx,
        "/v0/transactions",
        { tx_hashes: hashes.slice(i, i + 20) },
      );
      for (const t of r.transactions) {
        if (!t?.transaction) continue;
        out.push({
          hash: t.transaction.hash,
          signer_id: t.transaction.signer_id,
          receiver_id: t.transaction.receiver_id,
          actions: t.transaction.actions,
          block_timestamp: t.execution_outcome?.block_timestamp === undefined ? undefined : String(t.execution_outcome.block_timestamp),
        });
      }
    }
    return out;
  }

  /** Accounts that hold this public key (full-access keys only, as indexed by FastNEAR). */
  async accountsForKey(publicKey: string): Promise<string[]> {
    const r = await this.get<{ account_ids: string[] }>(FASTNEAR.api, `/v0/public_key/${encodeURIComponent(publicKey)}`);
    return r.account_ids ?? [];
  }

  /** Fungible tokens the account has interacted with. */
  async ftContracts(accountId: string): Promise<string[]> {
    const r = await this.get<{ contract_ids: string[] }>(FASTNEAR.api, `/v0/account/${encodeURIComponent(accountId)}/ft`);
    return r.contract_ids ?? [];
  }
}

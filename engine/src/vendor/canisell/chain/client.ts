// Adapted from canisell/api/src/chain/client.ts: takes plain URLs instead of the API Config type.
import { createPublicClient, http, type PublicClient } from "viem";
import { base } from "viem/chains";

export interface Clients {
  /** Reads and eth_call with state overrides. */
  rpc: PublicClient;
  /** Archive eth_getCode (token age search). */
  archive: PublicClient;
  /** eth_getLogs only. */
  logs: PublicClient;
}

export function makeClients(cfg: { rpcUrl: string; logsRpcUrl: string; archiveRpcUrl: string }): Clients {
  const mk = (url: string) =>
    createPublicClient({
      chain: base,
      transport: http(url, { batch: { batchSize: 25, wait: 4 }, timeout: 8_000, retryCount: 3, retryDelay: 250 }),
    }) as PublicClient;
  return { rpc: mk(cfg.rpcUrl), archive: mk(cfg.archiveRpcUrl), logs: mk(cfg.logsRpcUrl) };
}

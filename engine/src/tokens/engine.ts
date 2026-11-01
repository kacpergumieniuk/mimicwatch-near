/** Thin wrapper around the vendored Canisell engine (Base only). */
import type { Address } from "viem";
import { makeClients, type Clients } from "../vendor/canisell/chain/client.ts";
import { checkToken, type VerdictResponse } from "../vendor/canisell/risk/verdict.ts";

export interface EngineResult {
  verdict: "SAFE" | "CAUTION" | "DANGER";
  score: number;
  summary: string;
  liquidityUsd: number | null;
  launchpad: string | null;
  canSell?: boolean;
  creator?: string;
  ageSeconds?: number;
  reasons: string[];
}

export type EngineFn = (address: Address) => Promise<EngineResult>;

export function summarise(v: VerdictResponse): EngineResult {
  return {
    verdict: v.verdict,
    score: v.score,
    summary: v.summary,
    liquidityUsd: v.flags.liquidity.totalDepthUsd,
    launchpad: v.launchpad,
    canSell: v.flags.trading.canSell,
    creator: v.flags.creator.address,
    ageSeconds: v.flags.age.ageSeconds,
    reasons: v.reasons.slice(0, 6),
  };
}

export function baseEngine(clients?: Clients): EngineFn {
  const c =
    clients ??
    makeClients({
      rpcUrl: process.env.BASE_RPC_URL ?? "https://base-rpc.publicnode.com",
      logsRpcUrl: process.env.BASE_LOGS_RPC_URL ?? "https://base-rpc.publicnode.com",
      archiveRpcUrl: process.env.BASE_ARCHIVE_RPC_URL ?? "https://mainnet.base.org",
    });
  return async (address) => summarise(await checkToken(c, address, { simUsd: 20 }));
}

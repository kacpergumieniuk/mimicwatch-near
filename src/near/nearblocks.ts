/** NearBlocks free API (no key, about 6 calls a minute): only used for token holder counts. Read-only. */
import { politeSlot } from "../../engine/src/util/http.ts";

export const NEARBLOCKS = "https://api.nearblocks.io";

export async function ftHolders(tokenId: string, fetchImpl: typeof fetch = fetch): Promise<number | undefined> {
  await politeSlot("api.nearblocks.io", 11_000);
  try {
    const r = await fetchImpl(`${NEARBLOCKS}/v1/fts/${encodeURIComponent(tokenId)}/holders/count`, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return undefined;
    const j = (await r.json()) as { holders?: Array<{ count: string }> };
    const n = Number(j.holders?.[0]?.count);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

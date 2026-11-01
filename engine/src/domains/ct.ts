/**
 * Certificate Transparency via crt.sh's public JSON endpoint (free, no key). Polite: one request at a time,
 * >= 5 s apart, long timeout (crt.sh is slow and sometimes returns 502/empty bodies).
 *
 * Observed 2026-11-01: prefix queries (`uniswap%`) return the full set (~2.5k certs for "uniswap"); queries with a
 * leading wildcard (`%uniswap%`) are truncated by crt.sh to a few dozen rows. We run several and merge.
 */
import { domainToUnicode } from "node:url";
import { httpGet, sleep, type FetchLike } from "../util/http.ts";
import { foldConfusables } from "../util/text.ts";

export interface CtRow {
  id: number;
  issuer_name: string;
  common_name: string | null;
  name_value: string;
  not_before: string;
  not_after: string;
}

export interface CtHit {
  host: string;
  firstSeen: string;
  lastSeen: string;
  issuer: string;
  certIds: number[];
}

export const CRT_SH = "https://crt.sh/";

/**
 * crt.sh caps big result sets and returns a different subset per call (same query, minutes apart: 81 vs 142 hosts
 * for "aerodrome%"). Narrower prefixes are less likely to hit the cap, so we add them and merge.
 */
export function ctQueries(keyword: string): string[] {
  return [`${keyword}%`, `${keyword}.%`, `${keyword}-%`, `%${keyword}%`];
}

/** Turns crt.sh rows into one hit per hostname that contains the keyword, issued on/after `since`. */
export function parseCtRows(rows: CtRow[], keyword: string, since: Date): CtHit[] {
  const kw = keyword.toLowerCase();
  const byHost = new Map<string, CtHit>();
  for (const r of rows) {
    const nb = new Date(`${r.not_before}Z`);
    if (Number.isNaN(nb.getTime()) || nb < since) continue;
    for (const raw of r.name_value.split("\n")) {
      const host = raw.trim().toLowerCase().replace(/^\*\./, "");
      if (!host || host.includes(" ") || !host.includes(".")) continue;
      if (!foldConfusables(domainToUnicode(host) || host).includes(kw)) continue;
      const h = byHost.get(host);
      const issuer = /CN=([^,]+)/.exec(r.issuer_name)?.[1] ?? r.issuer_name;
      if (!h) byHost.set(host, { host, firstSeen: r.not_before, lastSeen: r.not_before, issuer, certIds: [r.id] });
      else {
        if (r.not_before < h.firstSeen) h.firstSeen = r.not_before;
        if (r.not_before > h.lastSeen) h.lastSeen = r.not_before;
        if (!h.certIds.includes(r.id) && h.certIds.length < 5) h.certIds.push(r.id);
      }
    }
  }
  return [...byHost.values()];
}

export interface CtResult {
  hits: CtHit[];
  queries: Array<{ q: string; rows: number; error?: string }>;
}

export async function searchCt(
  keywords: string[],
  since: Date,
  fetchImpl?: FetchLike,
  retries404 = 2,
  retryDelayMs = 15_000,
): Promise<CtResult> {
  const hits = new Map<string, CtHit>();
  const queries: CtResult["queries"] = [];
  for (const kw of keywords) {
    for (const q of ctQueries(kw)) {
      const url = `${CRT_SH}?q=${encodeURIComponent(q)}&output=json&exclude=expired`;
      try {
        // crt.sh answers 404 / 5xx when its database is busy; the same query usually works a little later.
        let res = await httpGet(url, { timeoutMs: 120_000, retries: 2, minIntervalMs: 5_000, fetchImpl });
        for (let i = 0; i < retries404 && res.status === 404; i++) {
          await sleep(retryDelayMs);
          res = await httpGet(url, { timeoutMs: 120_000, retries: 2, minIntervalMs: 5_000, fetchImpl });
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const rows = (text.trim() ? JSON.parse(text) : []) as CtRow[];
        queries.push({ q, rows: rows.length });
        for (const h of parseCtRows(rows, kw, since)) {
          const prev = hits.get(h.host);
          if (!prev || h.firstSeen < prev.firstSeen) hits.set(h.host, { ...h, certIds: [...new Set([...(prev?.certIds ?? []), ...h.certIds])].slice(0, 5) });
        }
      } catch (e) {
        queries.push({ q, rows: 0, error: (e as Error).message.slice(0, 160) });
      }
    }
  }
  return { hits: [...hits.values()], queries };
}

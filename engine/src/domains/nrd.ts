/**
 * Newly registered domains from WhoisDS's free daily list (https://www.whoisds.com/newly-registered-domains).
 * Checked 2026-11-01: daily zips for at least the last 5 days download without an account; each holds a single
 * domain-names.txt capped at 70,000 names (a sample of the day, not the full zone churn). Treat as a bonus source.
 */
import { inflateRawSync } from "node:zlib";
import { parse } from "tldts";
import { httpGet, type FetchLike } from "../util/http.ts";
import { foldConfusables, leetForms, levenshtein } from "../util/text.ts";

export interface NrdHit {
  domain: string;
  registeredOn: string;
  match: "contains" | "fuzzy";
}

export function whoisdsUrl(day: string): string {
  return `https://www.whoisds.com//whois-database/newly-registered-domains/${Buffer.from(`${day}.zip`).toString("base64")}/nrd`;
}

/** Extracts the first file of a zip (stored or deflated) using the central directory. */
export function unzipFirst(buf: Buffer): Buffer {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("not a zip (no end of central directory)");
  const cd = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error("bad central directory");
  const method = buf.readUInt16LE(cd + 10);
  const compSize = buf.readUInt32LE(cd + 20);
  const local = buf.readUInt32LE(cd + 42);
  if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error("bad local header");
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(start, start + compSize);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return inflateRawSync(data);
  throw new Error(`unsupported zip method ${method}`);
}

/** Brand matches in a list of domains: keyword contained in the label (after folding), or label within edit distance 1. */
export function matchNrd(domains: string[], keywords: string[], day: string): NrdHit[] {
  const out: NrdHit[] = [];
  for (const raw of domains) {
    const d = raw.trim().toLowerCase();
    if (!d) continue;
    const label = parse(d).domainWithoutSuffix ?? d.split(".")[0];
    const forms = leetForms(label);
    const folded = forms[0];
    for (const kw of keywords) {
      if (foldConfusables(label).includes(kw) || forms.some((f) => f.includes(kw))) {
        out.push({ domain: d, registeredOn: day, match: "contains" });
        break;
      }
      if (kw.length >= 5 && Math.abs(label.length - kw.length) <= 1 && levenshtein(folded, kw) === 1) {
        out.push({ domain: d, registeredOn: day, match: "fuzzy" });
        break;
      }
    }
  }
  return out;
}

export interface NrdResult {
  hits: NrdHit[];
  days: Array<{ day: string; domains: number; error?: string }>;
}

export async function searchNrd(keywords: string[], days: number, now = new Date(), fetchImpl?: FetchLike): Promise<NrdResult> {
  const res: NrdResult = { hits: [], days: [] };
  for (let i = 1; i <= days; i++) {
    const day = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    try {
      const r = await httpGet(whoisdsUrl(day), { timeoutMs: 60_000, retries: 1, minIntervalMs: 3_000, fetchImpl });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const txt = unzipFirst(Buffer.from(await r.arrayBuffer())).toString("utf8");
      const list = txt.split(/\r?\n/).filter(Boolean);
      res.days.push({ day, domains: list.length });
      res.hits.push(...matchNrd(list, keywords, day));
    } catch (e) {
      res.days.push({ day, domains: 0, error: (e as Error).message.slice(0, 120) });
    }
  }
  return res;
}

/** fetch with a timeout, retries on 429/5xx, and a per-host minimum interval so free services are not hammered. */

export const TOOL_UA = "brandwatch/0.1 (brand-protection research; read-only)";
/** Suspect pages often cloak for obvious bots, so page fetches use an ordinary desktop browser UA. */
export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const lastHit = new Map<string, number>();
const chains = new Map<string, Promise<void>>();

/** Serialises calls per host and keeps `minIntervalMs` between them. */
export async function politeSlot(host: string, minIntervalMs: number): Promise<void> {
  const prev = chains.get(host) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  chains.set(host, prev.then(() => mine));
  await prev;
  const wait = (lastHit.get(host) ?? 0) + minIntervalMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
  release();
}

export interface HttpOptions {
  timeoutMs?: number;
  retries?: number;
  minIntervalMs?: number;
  headers?: Record<string, string>;
  fetchImpl?: FetchLike;
  redirect?: RequestRedirect;
}

export async function httpGet(url: string, o: HttpOptions = {}): Promise<Response> {
  const f = o.fetchImpl ?? (globalThis.fetch as FetchLike);
  const host = new URL(url).host;
  const retries = o.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (o.minIntervalMs) await politeSlot(host, o.minIntervalMs);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), o.timeoutMs ?? 15_000);
    try {
      const res = await f(url, {
        headers: { "user-agent": TOOL_UA, accept: "*/*", ...o.headers },
        signal: ctl.signal,
        redirect: o.redirect ?? "follow",
      });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const ra = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) * 1000 : 2_000 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(1_000 * 2 ** attempt);
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function httpJson<T>(url: string, o: HttpOptions = {}): Promise<T> {
  const res = await httpGet(url, { ...o, headers: { accept: "application/json", ...o.headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

/** Runs `fn` over items with at most `n` in flight. Keeps input order. */
export async function mapLimit<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

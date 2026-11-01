/**
 * Read-only page capture for suspects. GET requests only: no clicks, no form input, no wallet (the headless
 * browser has no wallet extension, so nothing can be connected or signed). Bodies are size-capped.
 */
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { BROWSER_UA, httpGet, type FetchLike } from "../util/http.ts";
import {
  brandStats,
  detectSignals,
  extractFaviconHref,
  extractScriptSrcs,
  extractText,
  extractTitle,
  type Fingerprint,
} from "./fingerprint.ts";

const MAX_HTML = 2_000_000;
const MAX_SCRIPT = 1_500_000;
const MAX_SCRIPTS = 6;
const SKIP_SCRIPT_HOSTS = /googletagmanager|google-analytics|cloudflareinsights|static\.cloudflareinsights|hotjar|clarity\.ms|doubleclick/i;

/** Reads at most `cap` bytes and gives up after `ms` (the fetch timeout stops at headers; tarpits drip bodies). */
export async function readCapped(res: Response, cap: number, ms = 15_000): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  const deadline = Date.now() + ms;
  try {
    while (n < cap) {
      const left = deadline - Date.now();
      if (left <= 0) break;
      let t: ReturnType<typeof setTimeout> | undefined;
      const next = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value?: undefined }>((r) => (t = setTimeout(() => r({ done: true }), left))),
      ]).finally(() => clearTimeout(t));
      if (next.done) break;
      chunks.push(next.value);
      n += next.value.byteLength;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).subarray(0, cap);
}

export interface FetchOptions {
  fetchImpl?: FetchLike;
  keywords: string[];
  timeoutMs?: number;
}

const pageHeaders = { "user-agent": BROWSER_UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" };

export async function faviconHash(href: string, fetchImpl?: FetchLike): Promise<string | undefined> {
  try {
    const r = await httpGet(href, { timeoutMs: 8_000, retries: 0, headers: pageHeaders, fetchImpl });
    if (!r.ok) return undefined;
    const buf = await readCapped(r, 500_000);
    if (buf.length === 0 || /^\s*</.test(buf.subarray(0, 64).toString("utf8"))) return undefined; // HTML error page, not an icon
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return undefined;
  }
}

/** Plain HTTP fingerprint: HTML, favicon hash, and up to 6 script bodies for drainer signals. */
export async function httpFingerprint(url: string, o: FetchOptions): Promise<Fingerprint> {
  const fp: Fingerprint = {
    url,
    finalUrl: url,
    status: 0,
    title: "",
    text: "",
    scriptUrls: [],
    signals: { walletPrompt: [], seedPhrase: [], secretForm: false, lure: [], drainerJs: [], parked: [], cryptoContext: [], interstitial: [], challenge: [] },
    brandMentions: 0,
    brandInTitle: false,
    bytes: 0,
    renderedWith: "http",
  };
  try {
    const res = await httpGet(url, { timeoutMs: o.timeoutMs ?? 15_000, retries: 0, headers: pageHeaders, fetchImpl: o.fetchImpl });
    fp.status = res.status;
    fp.finalUrl = res.url || url;
    const html = (await readCapped(res, MAX_HTML)).toString("utf8");
    fp.bytes = html.length;
    fp.title = extractTitle(html);
    fp.text = extractText(html);
    const base = fp.finalUrl;
    const abs = (h: string) => {
      try {
        return new URL(h, base).toString();
      } catch {
        return undefined;
      }
    };
    fp.faviconUrl = abs(extractFaviconHref(html) ?? "/favicon.ico");
    fp.scriptUrls = extractScriptSrcs(html)
      .map(abs)
      .filter((u): u is string => !!u && /^https?:/.test(u) && !SKIP_SCRIPT_HOSTS.test(u))
      .slice(0, MAX_SCRIPTS);
    const [fav, ...scripts] = await Promise.all([
      fp.faviconUrl ? faviconHash(fp.faviconUrl, o.fetchImpl) : Promise.resolve(undefined),
      ...fp.scriptUrls.map(async (s) => {
        try {
          const r = await httpGet(s, { timeoutMs: 10_000, retries: 0, headers: pageHeaders, fetchImpl: o.fetchImpl });
          return r.ok ? (await readCapped(r, MAX_SCRIPT)).toString("utf8") : "";
        } catch {
          return "";
        }
      }),
    ]);
    fp.faviconSha256 = fav;
    fp.signals = detectSignals(html, scripts);
    Object.assign(fp, brandStats(fp.title, fp.text, new URL(fp.finalUrl).host, o.keywords));
  } catch (e) {
    fp.error = ((e as Error).cause as Error)?.message ?? (e as Error).message;
  }
  return fp;
}

/** Fetches https://host first, then http://host. */
export async function fingerprintHost(host: string, o: FetchOptions): Promise<Fingerprint> {
  const a = await httpFingerprint(`https://${host}/`, o);
  if (!a.error) return a;
  const b = await httpFingerprint(`http://${host}/`, o);
  return b.error ? { ...a, error: `${a.error}; http: ${b.error}` } : b;
}

// ---------------------------------------------------------------- Playwright (optional, local only)

type Browser = import("playwright").Browser;

export class Renderer {
  private browser?: Browser;
  constructor(private shotsDir: string) {}

  async start(): Promise<boolean> {
    try {
      const { chromium } = await import("playwright");
      this.browser = await chromium.launch({ headless: true });
      await mkdir(this.shotsDir, { recursive: true });
      return true;
    } catch (e) {
      console.warn(`[pages] Playwright unavailable (${(e as Error).message.split("\n")[0]}); using HTTP fingerprints only`);
      return false;
    }
  }

  /**
   * Renders the page (JS on, so single-page apps show their real UI), takes a viewport screenshot, and
   * merges rendered title/text and loaded script bodies into an HTTP fingerprint. No interaction.
   */
  async render(fp: Fingerprint, keywords: string[], name: string): Promise<Fingerprint> {
    if (!this.browser) return fp;
    const ctx = await this.browser.newContext({
      userAgent: BROWSER_UA,
      viewport: { width: 1280, height: 800 },
      acceptDownloads: false,
      serviceWorkers: "block",
      permissions: [],
    });
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
    const scripts: string[] = [];
    page.on("response", async (r) => {
      if (scripts.length >= 10 || r.request().resourceType() !== "script") return;
      try {
        const b = await r.body();
        if (b.length <= MAX_SCRIPT) scripts.push(b.toString("utf8"));
      } catch {}
    });
    try {
      await page.goto(fp.finalUrl || fp.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForTimeout(2_500);
      const html = await page.content();
      const file = join(this.shotsDir, `${name.replace(/[^a-z0-9.-]/gi, "_")}.jpg`);
      await page.screenshot({ path: file, timeout: 10_000, type: "jpeg", quality: 60 });
      const title = (await page.title()) || fp.title;
      const text = extractText(html);
      const sig = detectSignals(html, scripts);
      const merge = (a: string[], b: string[]) => [...new Set([...a, ...b])];
      const finalUrl = page.url();
      const bestText = text.length > fp.text.length ? text : fp.text;
      const bs = brandStats(title, bestText, new URL(finalUrl).host, keywords);
      return {
        ...fp,
        finalUrl,
        title,
        text: bestText,
        signals: {
          walletPrompt: merge(fp.signals.walletPrompt, sig.walletPrompt),
          seedPhrase: merge(fp.signals.seedPhrase, sig.seedPhrase),
          secretForm: fp.signals.secretForm || sig.secretForm,
          lure: merge(fp.signals.lure, sig.lure),
          drainerJs: merge(fp.signals.drainerJs, sig.drainerJs),
          parked: merge(fp.signals.parked, sig.parked),
          cryptoContext: merge(fp.signals.cryptoContext, sig.cryptoContext),
          interstitial: merge(fp.signals.interstitial, sig.interstitial),
          // the rendered page is what a visitor sees: if rendering got past the stub, drop the HTTP-only challenge
          challenge: sig.challenge,
        },
        brandMentions: Math.max(fp.brandMentions, bs.brandMentions),
        brandInTitle: fp.brandInTitle || bs.brandInTitle,
        screenshot: file,
        renderedWith: "playwright",
      };
    } catch (e) {
      return { ...fp, error: fp.error ?? `render: ${(e as Error).message.split("\n")[0]}` };
    } finally {
      await ctx.close().catch(() => {});
    }
  }

  async pdf(htmlFile: string, pdfFile: string): Promise<boolean> {
    if (!this.browser) return false;
    const ctx = await this.browser.newContext();
    try {
      const page = await ctx.newPage();
      await page.goto(`file://${htmlFile}`, { waitUntil: "load" });
      await page.pdf({ path: pdfFile, format: "A4", printBackground: true, margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" } });
      return true;
    } finally {
      await ctx.close();
    }
  }

  async stop() {
    await this.browser?.close().catch(() => {});
  }
}

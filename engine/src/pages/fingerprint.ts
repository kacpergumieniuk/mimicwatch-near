/** Pure HTML -> fingerprint extraction and similarity scoring. No I/O (fetching lives in fetch.ts). */
import { foldConfusables, textSimilarity, titleSimilarity } from "../util/text.ts";

export interface PageSignals {
  /** "Connect wallet" UI or wallet-library markers (WalletConnect, Reown/AppKit, RainbowKit, window.ethereum). */
  walletPrompt: string[];
  /** Mentions a seed / recovery phrase or private key. */
  seedPhrase: string[];
  /** The page has a textarea or several text/password inputs: together with seedPhrase, a secret-collection form. */
  secretForm: boolean;
  /** Claim / airdrop / migration / compensation lures. */
  lure: string[];
  /** JS patterns common in wallet drainer kits (blanket approvals, Permit2 / typed-data signing, heavy obfuscation). */
  drainerJs: string[];
  /** Parked or for-sale page. */
  parked: string[];
  /** Crypto vocabulary on the page. A brand word without it is often an unrelated business ("aerodrome" = airfield). */
  cryptoContext: string[];
  /** The host or a browser already shows a phishing warning instead of the site (e.g. Cloudflare's interstitial). */
  interstitial: string[];
  /** Bot challenge or JS-redirect stub: the real content was not visible to us. */
  challenge: string[];
}

export interface Fingerprint {
  url: string;
  finalUrl: string;
  status: number;
  title: string;
  text: string;
  faviconUrl?: string;
  faviconSha256?: string;
  scriptUrls: string[];
  signals: PageSignals;
  /** Keyword mentions in title + text, not counting the page's own hostname. */
  brandMentions: number;
  brandInTitle: boolean;
  bytes: number;
  screenshot?: string;
  renderedWith: "http" | "playwright";
  error?: string;
}

export function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return decodeEntities((m?.[1] ?? "").replace(/\s+/g, " ").trim()).slice(0, 300);
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Visible-ish text: drops script/style/noscript/svg, strips tags, collapses whitespace. */
export function extractText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|title)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20_000);
}

export function extractFaviconHref(html: string): string | undefined {
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const l of links) {
    if (!/rel\s*=\s*["']?[^"'>]*icon/i.test(l)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(l)?.[1];
    if (href) return href;
  }
  return undefined;
}

export function extractScriptSrcs(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) out.push(m[1]);
  return out;
}

const RX = {
  walletPrompt: [
    /connect(?:\s|-|_)*(?:your\s+)?wallet/i,
    /walletconnect/i,
    /web3modal/i,
    /@reown\/appkit|reown\.com|appkit/i,
    /rainbowkit/i,
    /eth_requestAccounts/,
    /window\.ethereum/,
  ],
  seedPhrase: [/seed\s*phrase/i, /recovery\s*phrase/i, /secret\s+recovery/i, /\bmnemonic\b/i, /private\s*key/i, /\b(12|24)[\s-]word/i],
  lure: [/\bclaim\b/i, /airdrop/i, /eligib(le|ility)/i, /\brewards?\b/i, /migrat(e|ion)/i, /compensation/i, /\brefund\b/i, /giveaway/i],
  drainerJs: [
    /setApprovalForAll/,
    /increaseAllowance/,
    /eth_signTypedData_v4/,
    /0x000000000022d473030f116ddee9f6b43ac78ba3/i,
    /\bseaport\b/i,
    /drainer/i,
  ],
  parked: [
    /domain\s+(?:name\s+)?(?:is|may\s+be)\s+for\s+sale/i,
    /buy\s+this\s+domain/i,
    /\bparked\b/i,
    /sedoparking|sedo\.com|dan\.com|afternic|hugedomains|bodis|parkingcrew/i,
    /\bfor sale\b/i, /na sprzeda[żz]/i, /zasoby i informacje/i, /related searches/i, /(?:your )?domain (?:is|has) expired/i,
    /this\s+domain\s+(?:name\s+)?(?:has\s+been\s+|is\s+)registered/i,
  ],
  cryptoContext: [
    /crypto/i, /\bdefi\b/i, /\btokens?\b/i, /\bswap\b/i, /liquidity/i, /\bwallet\b/i, /airdrop/i, /staking|\bstake\b/i,
    /web3/i, /blockchain/i, /\bdex\b/i, /\bnft\b/i, /ethereum|\beth\b/i, /\busdc\b/i, /\bveaero\b|\bvotes?\b.*\bepoch\b/i, /bridge/i,
  ],
  challenge: [
    /just a moment\.\.\./i, /verify (?:that )?you are (?:a )?human/i, /attention required/i, /checking (?:if the site connection is secure|your browser)/i,
    /ddos-guard/i, /^\s*access denied/i, /^\s*403 forbidden/i, /restricted domain/i, /домен не прикреплен|domain (?:is )?not (?:attached|configured)/i,
    /^\s*redirecting/i, /^\s*go\.\.\.\s*$/i, /enable javascript and cookies to continue/i,
  ],
  interstitial: [/suspected\s+phishing\s*\|\s*cloudflare/i, /deceptive\s+site\s+ahead/i, /warning:\s*suspected\s+phishing/i, /this\s+(?:website|site)\s+has\s+been\s+(?:reported|flagged)\s+(?:as|for)\s+phishing/i],
};

function hits(list: RegExp[], s: string): string[] {
  const out: string[] = [];
  for (const r of list) {
    const m = r.exec(s);
    if (m) out.push(m[0].slice(0, 40));
  }
  return out;
}

/** Signals from page HTML plus any fetched script bodies. */
export function detectSignals(html: string, scripts: string[] = []): PageSignals {
  const text = extractText(html);
  const all = `${html}\n${scripts.join("\n")}`;
  const drainerJs = hits(RX.drainerJs, all);
  const obf = (all.match(/_0x[0-9a-f]{4,6}/gi) ?? []).length;
  if (obf >= 200) drainerJs.push(`obfuscated-js(${obf} _0x identifiers)`);
  const inputs = (html.match(/<input\b[^>]*type\s*=\s*["']?(?:text|password)\b/gi) ?? []).length;
  return {
    secretForm: /<textarea\b/i.test(html) || inputs >= 3,
    walletPrompt: hits(RX.walletPrompt, all),
    seedPhrase: hits(RX.seedPhrase, text),
    lure: hits(RX.lure, `${extractTitle(html)} ${text}`),
    drainerJs,
    parked: hits(RX.parked, `${extractTitle(html)} ${text}`),
    cryptoContext: hits(RX.cryptoContext, `${extractTitle(html)} ${text}`),
    interstitial: hits(RX.interstitial, `${extractTitle(html)} ${text.slice(0, 2000)}`),
    challenge: [...new Set([...hits(RX.challenge, extractTitle(html)), ...hits(RX.challenge.slice(0, 4), text.slice(0, 500))])],
  };
}

/** Removes the page's own hostname (and www. form) so "aerodrome.co.za" in its own title is not a brand mention. */
export function stripHost(s: string, host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  const esc = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return s.replace(new RegExp(`(?:https?://)?(?:www\\.)?${esc}`, "gi"), " ");
}

export function brandStats(title: string, text: string, host: string, keywords: string[]): { brandMentions: number; brandInTitle: boolean } {
  const t = stripHost(title, host);
  return { brandMentions: countMentions(`${t} ${stripHost(text, host)}`, keywords), brandInTitle: countMentions(t, keywords) > 0 };
}

export function countMentions(s: string, keywords: string[]): number {
  const f = foldConfusables(s);
  let n = 0;
  for (const k of keywords) n += f.split(k).length - 1;
  return n;
}

export interface Similarity {
  title: number;
  text: number;
  favicon: boolean;
  /** 0..1 combined visual/content similarity to the official site. */
  overall: number;
}

export function compare(suspect: Fingerprint, official: Fingerprint | undefined): Similarity {
  if (!official) return { title: 0, text: 0, favicon: false, overall: 0 };
  const title = suspect.title && official.title ? titleSimilarity(suspect.title, official.title) : 0;
  const text = suspect.text && official.text ? textSimilarity(suspect.text, official.text) : 0;
  const favicon = !!suspect.faviconSha256 && suspect.faviconSha256 === official.faviconSha256;
  const overall = Math.min(1, 0.35 * title + 0.35 * Math.min(1, text * 2) + (favicon ? 0.3 : 0));
  return { title: round(title), text: round(text), favicon, overall: round(overall) };
}

const round = (x: number) => Math.round(x * 100) / 100;

/**
 * dnstwist-style lookalike domain generator, written from scratch in TypeScript.
 * The fuzzer set mirrors dnstwist (https://github.com/elceef/dnstwist, Apache-2.0): addition, bitsquatting,
 * homoglyph, hyphenation, insertion, omission, repetition, replacement, transposition, vowel-swap, plural,
 * dictionary and tld-swap. Crypto-specific additions: lure words ("claim", "airdrop", "migrate", ...) and
 * leetspeak digits.
 */
import { domainToASCII } from "node:url";
import { parse } from "tldts";

export type Fuzzer =
  | "addition"
  | "bitsquatting"
  | "homoglyph"
  | "hyphenation"
  | "insertion"
  | "omission"
  | "repetition"
  | "replacement"
  | "transposition"
  | "vowel-swap"
  | "plural"
  | "dictionary"
  | "tld-swap";

export interface Permutation {
  /** ASCII (punycode) form used for DNS. */
  domain: string;
  /** Display form; differs from `domain` for IDN homoglyphs. */
  unicode: string;
  fuzzer: Fuzzer;
  /** Official domain this was derived from. */
  base: string;
}

/** Lure words seen in crypto phishing domains. Combined as word-brand, brand-word and brandword. */
export const LURE_WORDS = [
  "claim", "claims", "airdrop", "drop", "rewards", "reward", "migrate", "migration", "support", "help",
  "connect", "wallet", "app", "dapp", "official", "verify", "validate", "sync", "restore", "recovery",
  "bridge", "swap", "stake", "staking", "unlock", "refund", "compensation", "portal", "v2", "v3", "v4",
  "web3", "dao", "gov", "token", "presale", "giveaway", "secure", "login", "event",
];

/** TLDs used for tld-swap. Popular with crypto phishing plus the big generics. */
export const SWAP_TLDS = [
  "com", "org", "net", "io", "xyz", "app", "co", "finance", "network", "pro", "live", "site", "online", "top",
  "cc", "info", "us", "me", "fi", "dev", "tech", "club", "vip", "link", "icu", "cloud", "world", "foundation",
  "exchange", "global", "digital", "space", "website", "store", "fun", "claims", "gift", "biz", "ai", "gg",
];
/** TLDs combined with dictionary permutations (kept small: dictionary x TLD grows fast). */
export const DICTIONARY_TLDS = ["com", "xyz", "app", "io", "net", "org"];

const QWERTY: Record<string, string> = {
  "1": "2q", "2": "3wq1", "3": "4ew2", "4": "5re3", "5": "6tr4", "6": "7yt5", "7": "8uy6", "8": "9iu7", "9": "0oi8", "0": "po9",
  q: "12wa", w: "3esaq2", e: "4rdsw3", r: "5tfde4", t: "6ygfr5", y: "7uhgt6", u: "8ijhy7", i: "9okju8", o: "0plki9", p: "lo0",
  a: "qwsz", s: "edxzaw", d: "rfcxse", f: "tgvcdr", g: "yhbvft", h: "ujnbgy", j: "ikmnhu", k: "olmji", l: "kop",
  z: "asx", x: "zsdc", c: "xdfv", v: "cfgb", b: "vghn", n: "bhjm", m: "njk",
};

/** Latin letter -> lookalikes. Unicode entries become IDN (xn--) domains. */
export const HOMOGLYPHS: Record<string, string[]> = {
  a: ["à", "á", "â", "ã", "ä", "å", "ɑ", "а", "ạ", "ą"],
  b: ["d", "lb", "ʙ", "ь", "ḃ"],
  c: ["e", "ϲ", "с", "ç", "ć"],
  d: ["b", "cl", "dl", "ԁ", "ď"],
  e: ["c", "é", "è", "ê", "ë", "ē", "ė", "ę", "е"],
  g: ["q", "ɡ", "ġ", "ğ"],
  h: ["lh", "һ", "ḥ"],
  i: ["1", "l", "í", "ì", "ï", "ı", "і"],
  j: ["ј"],
  k: ["lk", "ik", "lc", "κ", "к"],
  l: ["1", "i", "ɫ", "ł", "ӏ"],
  m: ["n", "nn", "rn", "rr", "м"],
  n: ["m", "r", "ń", "ñ", "ո"],
  o: ["0", "ο", "о", "ó", "ò", "ö", "ø", "ō", "օ"],
  p: ["ρ", "р"],
  q: ["g", "ԛ"],
  r: ["ʀ", "г"],
  s: ["ѕ", "ś", "š", "ş"],
  t: ["τ", "т", "ţ"],
  u: ["μ", "υ", "ս", "ú", "ù", "ü", "ū"],
  v: ["ν", "ѵ"],
  w: ["vv", "ѡ", "ԝ", "ŵ"],
  x: ["х", "χ"],
  y: ["ʏ", "γ", "у", "ý"],
  z: ["ʐ", "ż", "ź"],
};
/** Multi-character ASCII lookalikes, applied as substring swaps. */
const ASCII_GLYPH_SWAPS: Array<[string, string]> = [["rn", "m"], ["m", "rn"], ["vv", "w"], ["w", "vv"], ["cl", "d"], ["d", "cl"], ["nn", "m"]];
/** Whole-label Cyrillic swap: every letter that has a Cyrillic twin is replaced. */
const CYRILLIC: Record<string, string> = { a: "а", c: "с", e: "е", h: "һ", i: "і", j: "ј", k: "к", o: "о", p: "р", s: "ѕ", x: "х", y: "у" };

const VOWELS = "aeiou";
const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export function isValidLabel(label: string): boolean {
  return LABEL_RE.test(label) && !(label.slice(2, 4) === "--" && !label.startsWith("xn--"));
}

export function labelFuzz(label: string): Map<string, Fuzzer> {
  const out = new Map<string, Fuzzer>();
  const add = (s: string, f: Fuzzer) => {
    if (s !== label && s.length > 0 && !out.has(s)) out.set(s, f);
  };
  const n = label.length;

  for (const ch of "abcdefghijklmnopqrstuvwxyz0123456789") add(label + ch, "addition");

  for (let i = 0; i < n; i++) {
    const c = label.charCodeAt(i);
    for (let b = 0; b < 8; b++) {
      const flipped = String.fromCharCode(c ^ (1 << b));
      if (/^[a-z0-9-]$/.test(flipped)) add(label.slice(0, i) + flipped + label.slice(i + 1), "bitsquatting");
    }
  }

  for (let i = 0; i < n; i++) for (const g of HOMOGLYPHS[label[i]] ?? []) add(label.slice(0, i) + g + label.slice(i + 1), "homoglyph");
  for (const [from, to] of ASCII_GLYPH_SWAPS) {
    let idx = label.indexOf(from);
    while (idx !== -1) {
      add(label.slice(0, idx) + to + label.slice(idx + from.length), "homoglyph");
      idx = label.indexOf(from, idx + 1);
    }
  }
  const cyr = [...label].map((ch) => CYRILLIC[ch] ?? ch).join("");
  add(cyr, "homoglyph");

  for (let i = 1; i < n; i++) if (label[i - 1] !== "-" && label[i] !== "-") add(`${label.slice(0, i)}-${label.slice(i)}`, "hyphenation");

  for (let i = 0; i < n; i++)
    for (const k of QWERTY[label[i]] ?? []) {
      add(label.slice(0, i) + k + label.slice(i), "insertion");
      add(label.slice(0, i + 1) + k + label.slice(i + 1), "insertion");
    }

  for (let i = 0; i < n; i++) add(label.slice(0, i) + label.slice(i + 1), "omission");
  for (let i = 0; i < n; i++) if (/[a-z0-9]/.test(label[i])) add(label.slice(0, i) + label[i] + label.slice(i), "repetition");
  for (let i = 0; i < n; i++) for (const k of QWERTY[label[i]] ?? []) add(label.slice(0, i) + k + label.slice(i + 1), "replacement");
  for (let i = 0; i < n - 1; i++) if (label[i] !== label[i + 1]) add(label.slice(0, i) + label[i + 1] + label[i] + label.slice(i + 2), "transposition");
  for (let i = 0; i < n; i++)
    if (VOWELS.includes(label[i])) for (const v of VOWELS) if (v !== label[i]) add(label.slice(0, i) + v + label.slice(i + 1), "vowel-swap");
  add(`${label}s`, "plural");
  add(`${label}es`, "plural");
  return out;
}

/** Converts a possibly-Unicode domain to ASCII; returns "" if it is not a valid hostname. */
export function toAscii(domain: string): string {
  const a = domainToASCII(domain);
  if (!a) return "";
  return a.split(".").every(isValidLabel) ? a : "";
}

export interface PermuteOptions {
  tlds?: string[];
  dictionary?: string[];
  dictionaryTlds?: string[];
  /** Skip fuzzers (e.g. bitsquatting) to save DNS queries. */
  skip?: Fuzzer[];
}

/** All permutations of one official domain, deduplicated, excluding the domain itself. */
export function permute(officialDomain: string, o: PermuteOptions = {}): Permutation[] {
  const p = parse(officialDomain.toLowerCase());
  if (!p.domain || !p.domainWithoutSuffix || !p.publicSuffix) throw new Error(`Not a registrable domain: ${officialDomain}`);
  const label = p.domainWithoutSuffix.includes(".") ? p.domainWithoutSuffix.split(".").pop()! : p.domainWithoutSuffix;
  const suffix = p.publicSuffix;
  const base = p.domain;
  const skip = new Set(o.skip ?? []);
  const out = new Map<string, Permutation>();
  const push = (unicodeLabel: string, tld: string, fuzzer: Fuzzer) => {
    if (skip.has(fuzzer)) return;
    const unicode = `${unicodeLabel}.${tld}`;
    const ascii = toAscii(unicode);
    if (!ascii || ascii === base || out.has(ascii)) return;
    out.set(ascii, { domain: ascii, unicode, fuzzer, base });
  };

  for (const [l, f] of labelFuzz(label)) push(l, suffix, f);
  for (const tld of o.tlds ?? SWAP_TLDS) if (tld !== suffix) push(label, tld, "tld-swap");
  for (const w of o.dictionary ?? LURE_WORDS)
    for (const tld of new Set([suffix, ...(o.dictionaryTlds ?? DICTIONARY_TLDS)])) {
      push(`${label}-${w}`, tld, "dictionary");
      push(`${w}-${label}`, tld, "dictionary");
      push(`${label}${w}`, tld, "dictionary");
      push(`${w}${label}`, tld, "dictionary");
    }
  return [...out.values()];
}

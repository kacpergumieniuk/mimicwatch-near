/** Small string helpers shared by the domain, page and token matchers. No I/O. */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 = identical, 0 = nothing in common (normalised edit distance). */
export function ratio(a: string, b: string): number {
  const m = Math.max(a.length, b.length);
  return m === 0 ? 1 : 1 - levenshtein(a, b) / m;
}

/**
 * Characters that render like Latin letters or digits. Used to fold lookalikes back ("uniswаp" with a
 * Cyrillic а -> "uniswap") before matching. Not the full Unicode confusables table, just the ones seen in
 * crypto phishing plus leetspeak digits.
 */
export const CONFUSABLE_TO_LATIN: Record<string, string> = {
  а: "a", ɑ: "a", à: "a", á: "a", â: "a", ã: "a", ä: "a", å: "a", ą: "a", ā: "a", α: "a",
  в: "b", ь: "b", ḃ: "b",
  с: "c", ç: "c", ć: "c", č: "c", ϲ: "c",
  ԁ: "d", ď: "d", đ: "d",
  е: "e", è: "e", é: "e", ê: "e", ë: "e", ę: "e", ē: "e", ė: "e", ε: "e",
  ġ: "g", ğ: "g", ɡ: "g",
  һ: "h", ḥ: "h",
  і: "i", í: "i", ì: "i", î: "i", ï: "i", ı: "i", ι: "i", ӏ: "l",
  ј: "j",
  κ: "k", к: "k",
  ł: "l", ḷ: "l",
  м: "m",
  ո: "n", ñ: "n", ń: "n", п: "n",
  о: "o", ο: "o", ò: "o", ó: "o", ô: "o", õ: "o", ö: "o", ø: "o", ō: "o", օ: "o",
  р: "p", ρ: "p",
  ԛ: "q",
  г: "r",
  ѕ: "s", ś: "s", š: "s", ş: "s",
  т: "t", ţ: "t", ť: "t",
  υ: "u", ս: "u", ù: "u", ú: "u", û: "u", ü: "u", ū: "u", ů: "u",
  ν: "v", ѵ: "v",
  ԝ: "w", ŵ: "w", ẁ: "w",
  х: "x", χ: "x",
  у: "y", ý: "y", ÿ: "y",
  ź: "z", ż: "z", ž: "z",
};
const DIGIT_TO_LATIN: Record<string, string> = { "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g" };

/** Lowercase, NFKC, fold confusables. Keeps digits unless `leet` is set. */
export function foldConfusables(s: string, leet = false): string {
  let out = "";
  for (const ch of s.normalize("NFKC").toLowerCase()) out += CONFUSABLE_TO_LATIN[ch] ?? (leet ? (DIGIT_TO_LATIN[ch] ?? ch) : ch);
  return out;
}

/** Leet "1" reads as either "i" or "l": both folded forms, so "un1swap" matches "uniswap" and "1edger" matches "ledger". */
export function leetForms(s: string): string[] {
  const l = foldConfusables(s, true);
  const i = foldConfusables(s.replace(/1/g, "i"), true);
  return l === i ? [l] : [l, i];
}

/** Fold and strip everything except a-z0-9: "U.N.I-Swap" -> "uniswap". */
export function squash(s: string, leet = false): string {
  return foldConfusables(s, leet).replace(/[^a-z0-9]/g, "");
}

export function words(s: string): string[] {
  return foldConfusables(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1);
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Word 3-shingles, the usual near-duplicate text measure. Falls back to words for short texts. */
export function shingles(text: string, k = 3): Set<string> {
  const w = words(text);
  if (w.length < k) return new Set(w);
  const out = new Set<string>();
  for (let i = 0; i + k <= w.length; i++) out.add(w.slice(i, i + k).join(" "));
  return out;
}

export function textSimilarity(a: string, b: string): number {
  return jaccard(shingles(a), shingles(b));
}

/** Title similarity: word-set Jaccard, or edit ratio for very short titles. */
export function titleSimilarity(a: string, b: string): number {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  // "Aerodrome Finance - Fast & Secure DeFi" contains every word of the official "Aerodrome Finance".
  if (wb.size > 0 && [...wb].every((w) => wa.has(w))) return Math.max(0.8, jaccard(wa, wb));
  if (wa.size <= 2 || wb.size <= 2) return Math.max(jaccard(wa, wb), ratio(squash(a), squash(b)));
  return jaccard(wa, wb);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** "evil.com" -> "evil[.]com" so report text pasted into chats is not clickable. */
export function defang(s: string): string {
  return s.replace(/\./g, "[.]").replace(/^http/i, "hxxp");
}

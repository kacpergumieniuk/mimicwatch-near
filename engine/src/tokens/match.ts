/** Does a token's name/symbol imitate the brand? Pure function, unit-tested. */
import type { BrandProfile } from "../brand.ts";
import { foldConfusables, leetForms, levenshtein, squash } from "../util/text.ts";

export type TokenMatchKind = "clone" | "brand-name" | "same-symbol" | "lookalike-name" | "symbol-variant";

export interface TokenMatch {
  kind: TokenMatchKind;
  /** 0..100 impersonation strength from the name/symbol alone. */
  score: number;
  homoglyph: boolean;
  why: string;
}

const KIND_SCORE: Record<TokenMatchKind, number> = {
  clone: 95,
  "brand-name": 80,
  "same-symbol": 60,
  "lookalike-name": 55,
  "symbol-variant": 35,
};

const hasNonAscii = (s: string) => /[^\x00-\x7f]/.test(s);

export function matchToken(brand: BrandProfile, name: string | undefined, symbol: string | undefined): TokenMatch | null {
  const n = squash(name ?? "", true);
  const s = squash(symbol ?? "", true);
  const nPlain = squash(name ?? "");
  const sPlain = squash(symbol ?? "");
  if (!n && !s) return null;
  const keywords = brand.keywords.map((k) => squash(k));
  const officialSyms = [...new Set(brand.officialTokens.map((t) => squash(t.symbol)))];
  const nAlt = leetForms(name ?? "").map((x) => x.replace(/[^a-z0-9]/g, ""));
  const kwHit = keywords.find((k) => n.includes(k) || s.includes(k) || nPlain.includes(k) || sPlain.includes(k) || nAlt.some((x) => x.includes(k)));
  const symHit = officialSyms.find((o) => o === s || o === sPlain);
  // Confusables were needed to make the match: the raw text was not ASCII but folds to the brand.
  const homoglyph =
    (hasNonAscii(name ?? "") || hasNonAscii(symbol ?? "")) &&
    (!!kwHit || !!symHit) &&
    !keywords.some((k) => (name ?? "").toLowerCase().includes(k) || (symbol ?? "").toLowerCase().includes(k));

  let kind: TokenMatchKind | undefined;
  let why = "";
  if (symHit && kwHit) {
    kind = "clone";
    why = `symbol ${symbol} and brand word "${kwHit}" in the name`;
  } else if (kwHit) {
    kind = "brand-name";
    why = `brand word "${kwHit}" in name/symbol`;
  } else if (symHit) {
    kind = "same-symbol";
    why = `same symbol as the official token (${symbol})`;
  } else {
    const fuzzy = keywords.find((k) => k.length >= 5 && [n, s].some((x) => x.length >= 4 && Math.abs(x.length - k.length) <= 1 && levenshtein(x, k) === 1));
    if (fuzzy) {
      kind = "lookalike-name";
      why = `name/symbol one character away from "${fuzzy}"`;
    } else {
      const variant = officialSyms.find(
        (o) => o.length >= 4 && s !== o && s.length <= o.length + 3 && (s.startsWith(o) || s.endsWith(o)),
      );
      if (variant) {
        kind = "symbol-variant";
        why = `symbol ${symbol} extends the official symbol ${variant.toUpperCase()}`;
      }
    }
  }
  if (!kind) return null;
  return { kind, score: Math.min(100, KIND_SCORE[kind] + (homoglyph ? 10 : 0)), homoglyph, why: homoglyph ? `${why} (uses lookalike characters)` : why };
}

/** Exposed for tests: the folded forms the matcher compares. */
export const _folded = (s: string) => ({ squash: squash(s, true), fold: foldConfusables(s) });

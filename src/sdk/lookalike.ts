/**
 * Offline lookalike test against the NEAR brand list: catches lookalikes that are not (yet) in the
 * registry. Pure function, no network.
 */
import { levenshtein } from "../../engine/src/util/text.ts";
import type { BrandIndex, NearBrand } from "../brands.ts";
import { stripTopLevel } from "../near/account-id.ts";
import { LURE_RE } from "../near/permute.ts";

/** Folds ASCII confusables to one canonical form: 1/l/i -> l, 0 -> o, rn -> m, vv -> w, ... */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/cl/g, "d")
    .replace(/[1i|]/g, "l")
    .replace(/0/g, "o")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/9/g, "g")
    .replace(/8/g, "b")
    .replace(/2/g, "z")
    .replace(/[-_.]/g, "");
}

export interface LookalikeHit {
  brand: NearBrand;
  imitates: string;
  how: "confusable" | "typo" | "brand-bait" | "fake-sub-account";
}

/** Is `id` a lookalike of an official account? `undefined` for official accounts and non-matches. */
export function lookalikeOf(id: string, index: BrandIndex): LookalikeHit | undefined {
  const name = id.toLowerCase();
  if (index.ownerOfAccount(name)) return undefined;
  const body = stripTopLevel(name);
  const f = fold(body);
  const tla = name.slice(name.lastIndexOf(".") + 1);
  for (const { id: official, brand } of index.officialNames()) {
    // Flattened official id under another parent: v2-ref-finance.near for v2.ref-finance.near, token-sweat.near for token.sweat.
    if (official.includes(".") && f === fold(official)) return { brand, imitates: official, how: "fake-sub-account" };
    // Body comparisons only within the same top-level account (token.near is not a copy of token.sweat).
    const otla = official.slice(official.lastIndexOf(".") + 1);
    if (otla !== tla && !(otla === "near" && tla === "tg")) continue;
    const ob = stripTopLevel(official);
    const of = fold(ob);
    if (of.length < 4) continue;
    if (f === of) return { brand, imitates: official, how: ob.includes(".") && !body.includes(".") ? "fake-sub-account" : "confusable" };
    if (of.length >= 7 && Math.abs(f.length - of.length) <= 1 && levenshtein(f, of) === 1) return { brand, imitates: official, how: "typo" };
  }
  for (const brand of index.brands) {
    for (const stem of brand.nameStems) {
      const s = fold(stem);
      if (s.length >= 4 && f.includes(s) && f !== s && LURE_RE.test(body)) return { brand, imitates: brand.officialAccounts[0]?.id ?? stem, how: "brand-bait" };
    }
  }
  return undefined;
}

/**
 * Lookalike generator for NEAR named accounts.
 *
 * NEAR account ids are ASCII only (a-z, 0-9, - _ .), so Unicode homoglyphs cannot exist on NEAR. The
 * lookalikes that can exist are ASCII confusables (l/1/i, o/0, rn/m, vv/w, cl/d), typos, separator
 * games, lure words, and names that pretend to be sub-accounts (`v2-ref-finance.near` for
 * `v2.ref-finance.near`). Character-level typo fuzzers come from the pre-existing Mimicwatch engine
 * (`engine/src/domains/permute.ts`, dnstwist-style); everything NEAR-specific is here.
 */
import { labelFuzz } from "../../engine/src/domains/permute.ts";
import type { BrandIndex, NearBrand } from "../brands.ts";
import { isValidAccountId, stripTopLevel, topLevelOf } from "./account-id.ts";

export type NearFuzzer =
  | "homoglyph"
  | "digit-swap"
  | "omission"
  | "repetition"
  | "transposition"
  | "insertion"
  | "replacement"
  | "addition"
  | "vowel-swap"
  | "hyphenation"
  | "plural"
  | "separator"
  | "swapped-segments"
  | "lure-suffix"
  | "lure-prefix"
  | "fake-sub-account"
  | "brand-near"
  | "other-tla"
  | "bare-stem"
  | "sub-account-of-lookalike";

/** Fuzzers that imitate the name closely enough to fool a reader. Used by scoring. */
export const STRONG_FUZZERS: NearFuzzer[] = ["homoglyph", "digit-swap", "fake-sub-account", "sub-account-of-lookalike", "separator", "swapped-segments"];
export const LURE_FUZZERS: NearFuzzer[] = ["lure-suffix", "lure-prefix"];
/** Keyboard-typo fuzzers: catch typo traffic, but often collide with unrelated real names. */
export const TYPO_FUZZERS: NearFuzzer[] = ["omission", "repetition", "transposition", "insertion", "replacement", "addition", "vowel-swap", "hyphenation", "plural"];

export interface NearCandidate {
  id: string;
  fuzzer: NearFuzzer;
  /** The official name being imitated (an account id, or a stem + TLA). */
  imitates: string;
  brand: string;
}

/** Words scammers attach to a brand name. */
export const LURE_WORDS = [
  "official", "support", "help", "helpdesk", "claim", "claims", "airdrop", "drop", "reward", "rewards", "bonus", "gift",
  "app", "dapp", "wallet", "verify", "validate", "sync", "restore", "recovery", "refund", "migrate", "migration", "team",
  "admin", "foundation", "dao", "labs", "finance", "swap", "bridge", "stake", "staking", "unlock", "portal", "v2", "v3",
  "near", "io", "org", "token", "presale", "giveaway", "secure", "event", "connect", "login",
];
export const LURE_RE = /official|support|help|claim|airdrop|drop|reward|bonus|gift|verify|validat|sync|restore|recover|refund|migrat|admin|unlock|presale|giveaway|secure|connect|login|portal/;

/** ASCII digits that pass for letters in a wallet's send field. */
const DIGIT_SWAPS: Record<string, string[]> = { o: ["0"], i: ["1"], l: ["1"], e: ["3"], a: ["4"], s: ["5"], t: ["7"], g: ["9"], b: ["8"], z: ["2"] };

/** Top-level accounts where anyone can register a name (`.near` registrar; HOT's `.tg`). */
export const OPEN_TLAS = ["near", "tg"];

// "insertion" (a keyboard neighbour typed twice) is left out: it is the largest set and the least deceptive.
const ENGINE_FUZZERS = new Set(["addition", "homoglyph", "hyphenation", "omission", "repetition", "replacement", "transposition", "vowel-swap", "plural"]);

export interface PermuteOptions {
  /** Skip keyboard-typo fuzzers (addition, insertion, replacement, vowel-swap): fewer RPC calls. */
  noTypos?: boolean;
  /** Stems shorter than this only get homoglyph, digit, separator and lure forms. Default 5. */
  minTypoLength?: number;
  /** Secondary stems (a brand's 3rd and later spellings) get only the strong forms: no typos, no lure words. */
  secondary?: boolean;
}

/** Variants of one stem ("ref-finance") under one top-level account ("near"). */
export function permuteStem(stem: string, tla: string, brand: string, o: PermuteOptions = {}): NearCandidate[] {
  const out = new Map<string, NearCandidate>();
  const imitates = `${stem}.${tla}`;
  const add = (label: string, fuzzer: NearFuzzer) => {
    const id = `${label}.${tla}`;
    if (label !== stem && isValidAccountId(id) && !out.has(id)) out.set(id, { id, fuzzer, imitates, brand });
  };
  const typos = !o.noTypos && !o.secondary && stem.replace(/[-_.]/g, "").length >= (o.minTypoLength ?? 5);

  const engine = [...labelFuzz(stem)].filter(([label, f]) => ENGINE_FUZZERS.has(f) && /^[a-z0-9_-]+$/.test(label));
  // Lookalike letters first (they win over keyboard typos that produce the same string).
  for (const [label, f] of engine) if (f === "homoglyph") add(label, "homoglyph");
  // Digit swaps (one position at a time, then all at once).
  for (let i = 0; i < stem.length; i++) for (const d of DIGIT_SWAPS[stem[i]] ?? []) add(stem.slice(0, i) + d + stem.slice(i + 1), "digit-swap");
  add([...stem].map((c) => DIGIT_SWAPS[c]?.[0] ?? c).join(""), "digit-swap");
  // Separators: ref-finance -> reffinance, ref_finance, ref.finance (a sub-account of finance.near).
  if (/[-_]/.test(stem)) {
    add(stem.replace(/[-_]/g, ""), "separator");
    add(stem.replace(/-/g, "_"), "separator");
    add(stem.replace(/_/g, "-"), "separator");
    add(stem.replace(/[-_]/g, "."), "separator");
    const parts = stem.split(/[-_]/);
    if (parts.length === 2) {
      add(`${parts[1]}-${parts[0]}`, "swapped-segments");
      add(`${parts[1]}${parts[0]}`, "swapped-segments");
    } else if (parts.length === 3) {
      add([parts[0], parts[2], parts[1]].join("-"), "swapped-segments");
      add([parts[1], parts[0], parts[2]].join("-"), "swapped-segments");
    }
  }
  // Character-level typo fuzzers from the engine, ASCII results only.
  if (typos) for (const [label, f] of engine) if (f !== "homoglyph") add(label, f as NearFuzzer);
  // Lure words.
  if (!o.secondary)
    for (const w of LURE_WORDS) {
      if (stem.includes(w)) continue;
      add(`${stem}-${w}`, "lure-suffix");
      add(`${stem}${w}`, "lure-suffix");
      add(`${w}-${stem}`, "lure-prefix");
    }
  return [...out.values()];
}

/**
 * Names that pretend to be an official sub-account or carry ".near" in the name:
 * v2.ref-finance.near -> v2-ref-finance.near, v2ref-finance.near; token.sweat -> token-sweat.near;
 * wrap.near -> wrap-near.near, wrapnear.near.
 */
export function fakeSubAccounts(officialId: string, brand: string): NearCandidate[] {
  const out = new Map<string, NearCandidate>();
  const add = (id: string, fuzzer: NearFuzzer) => {
    if (id !== officialId && isValidAccountId(id) && !out.has(id)) out.set(id, { id, fuzzer, imitates: officialId, brand });
  };
  const tla = topLevelOf(officialId);
  const body = stripTopLevel(officialId);
  if (body.includes(".")) {
    for (const t of OPEN_TLAS) {
      add(`${body.replace(/\./g, "-")}.${t}`, "fake-sub-account");
      add(`${body.replace(/\./g, "")}.${t}`, "fake-sub-account");
      add(`${body.replace(/\./g, "_")}.${t}`, "fake-sub-account");
    }
  }
  // The whole id flattened, including its top-level name: token.sweat -> token-sweat.near
  if (tla !== "near" && officialId.includes(".")) for (const t of OPEN_TLAS) add(`${officialId.replace(/\./g, "-")}.${t}`, "fake-sub-account");
  if (!officialId.includes(".") && tla !== "near") {
    // A top-level official account (e.g. "aurora"): aurora.near, aurora.tg are lookalikes.
    for (const t of OPEN_TLAS) add(`${officialId}.${t}`, "other-tla");
  }
  for (const t of OPEN_TLAS) {
    add(`${body.replace(/\./g, "-")}-near.${t}`, "brand-near");
    add(`${body.replace(/\./g, "")}near.${t}`, "brand-near");
    add(`near-${body.replace(/\./g, "-")}.${t}`, "brand-near");
  }
  return [...out.values()];
}

/** After a lookalike root is found, check whether it copies official sub-account names: v2.ref-flnance.near. */
export function subAccountProbes(lookalikeId: string, brand: NearBrand, imitates: string): NearCandidate[] {
  const labels = new Set<string>(["app", "claim", "airdrop", "token", "v2", "contract", "main", "support", "pool", "staking"]);
  for (const a of brand.officialAccounts) {
    const root = brand.accountRoots.find((r) => a.id.endsWith(`.${r}`));
    if (root) labels.add(a.id.slice(0, -root.length - 1));
  }
  return [...labels]
    .map((l) => `${l}.${lookalikeId}`)
    .filter(isValidAccountId)
    .map((id) => ({ id, fuzzer: "sub-account-of-lookalike" as const, imitates, brand: brand.id }));
}

/** Every candidate for every brand, minus official names. One entry per id (first brand wins). */
export function allCandidates(index: BrandIndex, o: PermuteOptions = {}): NearCandidate[] {
  const out = new Map<string, NearCandidate>();
  const push = (c: NearCandidate) => {
    if (index.ownerOfAccount(c.id) || out.has(c.id)) return;
    out.set(c.id, c);
  };
  // Fake sub-accounts first, so "v2-ref-finance.near" is labelled as one (not as "v2" + brand).
  for (const b of index.brands) for (const a of b.officialAccounts) fakeSubAccounts(a.id, b.id).forEach(push);
  for (const b of index.brands) {
    for (const [si, stem] of b.nameStems.entries()) for (const tla of OPEN_TLAS) {
      const so = { ...o, secondary: si >= 2 };
      // .tg gets only the exact stem and lure forms: typo squats there are rare and cost RPC calls.
      if (tla === "near") permuteStem(stem, tla, b.id, so).forEach(push);
      else {
        push({ id: `${stem}.${tla}`, fuzzer: "other-tla", imitates: `${stem}.near`, brand: b.id });
        permuteStem(stem, tla, b.id, { ...so, noTypos: true }).filter((c) => c.fuzzer.startsWith("lure")).forEach(push);
      }
      if (tla === "near" && isValidAccountId(`${stem}.near`)) {
        // The bare stem itself, if the brand does not own it (e.g. "rhea.near" when the brand uses rhealab.near).
        push({ id: `${stem}.near`, fuzzer: "bare-stem", imitates: b.officialAccounts[0]?.id ?? `${stem}.near`, brand: b.id });
      }
    }
  }
  return [...out.values()];
}

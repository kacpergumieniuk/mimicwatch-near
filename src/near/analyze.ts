/**
 * Scores lookalike NEAR accounts from recorded raw facts (`collect.ts`). Pure and deterministic:
 * the same raw.json always gives the same findings. Thresholds are heuristics; a person reviews
 * everything before anything is published (see src/review).
 */
import type { BrandIndex } from "../brands.ts";
import type { AccountRaw, RawScan, TxSummary } from "./collect.ts";
import { LURE_FUZZERS, LURE_RE, STRONG_FUZZERS, TYPO_FUZZERS, type NearFuzzer } from "./permute.ts";
import { EMPTY_CODE_HASH } from "./rpc.ts";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

export type AccountLabel =
  | "fake-token"
  | "impersonation-likely"
  | "lookalike-active"
  | "lookalike-dormant"
  | "brand-owned"
  | "likely-unrelated";

export interface AccountFacts {
  createdAt?: string;
  ageDays?: number;
  creator?: string;
  creationTx?: string;
  txsCount: number;
  lastActivity?: string;
  daysSinceActivity?: number;
  isContract: boolean;
  codeHash: string;
  balanceNear: number;
  ft?: { name?: string; symbol?: string; decimals?: number } | null;
  fullAccessKeys: number;
  /** Inbound NEAR transfers signed by others, in the inspected transactions. */
  inboundTransfers: number;
  inboundNear: number;
  distinctSenders: number;
  /** Inbound transfers below 0.01 NEAR (dust). */
  dustTransfers: number;
  /** A large inbound transfer forwarded out again within an hour. */
  forwarded?: { inNear: number; outNear: number; minutes: number; to: string };
  /** How many other accounts this account's full-access keys control. */
  keyControls: number;
  outboundTransfers: number;
  /** Other lookalikes in this scan that share a full-access key with this one. */
  sameOperator: string[];
  /** Official accounts that share a full-access key with this one. */
  sharesKeyWithOfficial: string[];
}

export interface AccountFinding {
  id: string;
  kind: "account";
  brand: string;
  brandName: string;
  imitates: string;
  fuzzer: NearFuzzer;
  label: AccountLabel;
  severity: Severity;
  score: number;
  signals: string[];
  evidence: string[];
  facts: AccountFacts;
  links: { explorer: string };
}

const NS_PER_DAY = 86_400e9;
const yocto = (s?: string) => (s ? Number(BigInt(s) / 10n ** 18n) / 1e6 : 0);
const day = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n)).toISOString().slice(0, 10);

/** Transfers below this are dust (often address poisoning aimed at the account's owner), not payments. */
export const DUST_NEAR = 0.01;
const transferNear = (d: TxSummary) => d.actions.reduce((x, a) => x + (a.kind === "Transfer" ? yocto(a.deposit) : 0), 0);

function transfersIn(details: TxSummary[], id: string) {
  const all = details.filter((d) => d.receiver === id && d.signer !== id && d.actions.some((a) => a.kind === "Transfer" && a.deposit));
  const ins = all.filter((d) => transferNear(d) >= DUST_NEAR);
  const near = ins.reduce((s, d) => s + transferNear(d), 0);
  return { count: ins.length, near, senders: new Set(ins.map((d) => d.signer)).size, dust: all.length - ins.length };
}

/** Largest inbound transfer that left again within an hour (>= 90% of it). */
function forwardedQuickly(details: TxSummary[], id: string): { inNear: number; outNear: number; minutes: number; to: string } | undefined {
  const sorted = [...details].sort((a, b) => a.timestampNs.localeCompare(b.timestampNs, "en", { numeric: true }));
  let best: { inNear: number; outNear: number; minutes: number; to: string } | undefined;
  for (const d of sorted) {
    if (d.receiver !== id || d.signer === id) continue;
    const inNear = transferNear(d);
    if (inNear < 1) continue;
    const t0 = BigInt(d.timestampNs);
    const out = sorted.find((o) => o.signer === id && o.receiver !== id && BigInt(o.timestampNs) > t0 && BigInt(o.timestampNs) - t0 <= 3_600n * 10n ** 9n && transferNear(o) >= 0.9 * inNear);
    if (out && (!best || inNear > best.inNear))
      best = { inNear, outNear: transferNear(out), minutes: Math.max(1, Math.round(Number(BigInt(out.timestampNs) - t0) / 60e9)), to: out.receiver };
  }
  return best;
}

/** Facts derived from raw data. `nowMs` is the scan time, never the wall clock. */
export function factsOf(r: AccountRaw, nowMs: number, index: BrandIndex, foundIds: Map<string, string[]>): AccountFacts {
  const nowNs = BigInt(nowMs) * 1_000_000n;
  const created = r.creation?.timestampNs ?? r.recent.at(-1)?.ts;
  const last = r.recent[0]?.ts;
  const tin = transfersIn(r.details, r.id);
  const out = r.details.filter((d) => d.signer === r.id && d.actions.some((a) => a.kind === "Transfer")).length;
  const keyAccounts = Object.values(r.keyAccounts).flat();
  const sameOperator = [...new Set(keyAccounts.filter((a) => foundIds.has(a) && a !== r.id))].sort();
  const sharesKeyWithOfficial = [...new Set(keyAccounts.filter((a) => index.ownerOfAccount(a)))].sort();
  return {
    createdAt: created && created !== "0" ? day(created) : undefined,
    ageDays: created && created !== "0" ? Math.floor(Number(nowNs - BigInt(created)) / NS_PER_DAY) : undefined,
    creator: r.creation?.signer,
    creationTx: r.creation?.hash,
    txsCount: r.txsCount,
    lastActivity: last ? day(last) : undefined,
    daysSinceActivity: last ? Math.floor(Number(nowNs - BigInt(last)) / NS_PER_DAY) : undefined,
    isContract: r.view.code_hash !== EMPTY_CODE_HASH,
    codeHash: r.view.code_hash,
    balanceNear: yocto(r.view.amount),
    ft: r.ft ? { name: r.ft.name, symbol: r.ft.symbol, decimals: r.ft.decimals } : r.ft,
    fullAccessKeys: r.keys.filter((k) => k.fullAccess).length,
    inboundTransfers: tin.count,
    inboundNear: Math.round(tin.near * 1000) / 1000,
    distinctSenders: tin.senders,
    dustTransfers: tin.dust,
    forwarded: forwardedQuickly(r.details, r.id),
    keyControls: new Set(keyAccounts).size,
    outboundTransfers: out,
    sameOperator,
    sharesKeyWithOfficial,
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const severityRank = (s: Severity) => SEVERITIES.indexOf(s);

export function analyzeAccount(r: AccountRaw, nowMs: number, index: BrandIndex, foundIds: Map<string, string[]>): AccountFinding {
  const f = factsOf(r, nowMs, index, foundIds);
  const brand = index.byId(r.candidate.brand);
  const fz = r.candidate.fuzzer;
  const signals: string[] = [];
  const evidence: string[] = [];
  let score = 0;

  const name = r.id.replace(/\.(near|tg)$/, "");
  const lureWord = LURE_RE.exec(name)?.[0];
  if (STRONG_FUZZERS.includes(fz)) {
    score += 30;
    signals.push("CLOSE_LOOKALIKE");
  } else if (LURE_FUZZERS.includes(fz)) {
    score += lureWord ? 35 : 15;
    signals.push(lureWord ? "LURE_WORD" : "BRAND_PLUS_WORD");
  } else if (TYPO_FUZZERS.includes(fz)) {
    score += 15;
    signals.push("TYPO");
  } else {
    score += 20;
    signals.push("BRAND_NAME");
  }
  evidence.push(`Name: ${fuzzerText(fz)} of ${r.candidate.imitates}${lureWord ? ` with the lure word "${lureWord}"` : ""}.`);

  // Brand-owned: created by the brand, or shares a full-access key with an official account.
  const creatorBrand = f.creator ? index.ownerOfAccount(f.creator) : undefined;
  if (creatorBrand || f.sharesKeyWithOfficial.length) {
    const why = creatorBrand ? `created by ${f.creator} (${creatorBrand.name})` : `shares a full-access key with ${f.sharesKeyWithOfficial.join(", ")}`;
    return finding(r, brand?.name ?? r.candidate.brand, f, "brand-owned", "info", 0, ["BRAND_OWNED"], [...evidence, `Defensive or official: ${why}.`]);
  }
  if (f.createdAt) evidence.push(`Created ${f.createdAt}${f.creator ? ` by ${f.creator}` : ""} (${f.ageDays} days before the scan).`);
  evidence.push(`${f.txsCount} transactions${f.lastActivity ? `, last on ${f.lastActivity}` : ""}; balance ${f.balanceNear.toFixed(3)} NEAR; ${f.fullAccessKeys} full-access key(s).`);

  if (f.ageDays !== undefined && f.ageDays <= 90) {
    score += 15;
    signals.push("NEW_ACCOUNT");
  } else if (f.ageDays !== undefined && f.ageDays <= 365) {
    score += 5;
    signals.push("RECENT_ACCOUNT");
  }
  let fakeToken = false;
  if (f.isContract) {
    score += 15;
    signals.push("HAS_CONTRACT");
    evidence.push(`A contract is deployed (code hash ${f.codeHash}).`);
    if (f.ft && brand) {
      const words = [brand.name, ...brand.nameStems, ...brand.keywords].map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).filter((w) => w.length >= 3);
      const meta = `${f.ft.name ?? ""} ${f.ft.symbol ?? ""}`.toLowerCase().replace(/[^a-z0-9 ]/g, "");
      if (words.some((w) => meta.replace(/ /g, "").includes(w))) {
        fakeToken = true;
        score += 35;
        signals.push("FT_COPIES_BRAND");
        evidence.push(`It is a NEP-141 token named "${f.ft.name}" (${f.ft.symbol}), using the ${brand.name} name.`);
      } else if (f.ft) {
        evidence.push(`It answers ft_metadata: "${f.ft.name}" (${f.ft.symbol}).`);
      }
    }
  }
  if (f.distinctSenders >= 3) {
    score += 15;
    signals.push("RECEIVES_FROM_MANY");
  } else if (f.distinctSenders >= 1) {
    score += 5;
  }
  if (f.inboundTransfers) evidence.push(`Inbound NEAR transfers signed by others (in the ${r.details.length} transactions inspected): ${f.inboundTransfers} from ${f.distinctSenders} sender(s), ${f.inboundNear} NEAR in total.`);
  if (f.dustTransfers) evidence.push(`${f.dustTransfers} dust transfer(s) under ${DUST_NEAR} NEAR from others (typical of address poisoning aimed at this account's owner; not counted as payments).`);
  if (f.forwarded) {
    score += 10;
    signals.push("FORWARDED_QUICKLY");
    evidence.push(`Received ${round(f.forwarded.inNear)} NEAR and sent ${round(f.forwarded.outNear)} NEAR on to ${f.forwarded.to} within ${f.forwarded.minutes} minute(s): a collection pattern, or the owner's own pass-through.`);
  }
  if (f.keyControls >= 10) {
    signals.push("KEY_CONTROLS_MANY");
    const others = Object.values(r.keyAccounts).flat();
    evidence.push(`Its full-access key also controls ${f.keyControls >= 50 ? "50+" : f.keyControls} other accounts (e.g. ${others.slice(0, 6).join(", ")}): a name collector.`);
  }
  if (f.sameOperator.length) {
    score += 20;
    signals.push("SAME_OPERATOR");
    evidence.push(`Shares a full-access key with other lookalikes found in this scan: ${f.sameOperator.join(", ")}.`);
  }
  // No full-access key and no contract: nobody can move funds out of the account.
  const locked = f.fullAccessKeys === 0 && !f.isContract && !r.errors.some((e) => e.startsWith("keys"));
  if (locked) {
    signals.push("LOCKED");
    evidence.push("No full-access key and no contract: nobody can move funds out of this account.");
  }
  const dormant = f.daysSinceActivity === undefined || f.daysSinceActivity > 365;
  if (dormant) signals.push("DORMANT");
  // An old account with a long unrelated history is most likely someone's own name.
  const established = (f.ageDays ?? 0) > 730 && f.txsCount > 300;
  if (established) signals.push("ESTABLISHED_HISTORY");

  score = Math.min(100, score);
  let label: AccountLabel;
  let severity: Severity;
  const strongName = STRONG_FUZZERS.includes(fz) || !!lureWord;
  if (fakeToken) {
    label = "fake-token";
    severity = (f.ageDays ?? 9999) <= 365 || f.distinctSenders >= 2 ? "critical" : "high";
  } else if (locked) {
    label = dormant ? "lookalike-dormant" : "lookalike-active";
    severity = "info";
  } else if (strongName && !dormant && !established && (f.isContract || f.distinctSenders >= 2 || f.sameOperator.length > 0 || (f.ageDays ?? 9999) <= 90)) {
    label = "impersonation-likely";
    severity = score >= 75 ? "critical" : "high";
  } else if (established && !strongName) {
    label = "likely-unrelated";
    severity = "low";
  } else if (dormant) {
    label = "lookalike-dormant";
    // A dormant close copy that once collected money from others still deserves a look.
    severity = strongName && (f.forwarded || f.distinctSenders >= 2) ? "medium" : strongName ? "low" : "info";
  } else {
    label = "lookalike-active";
    severity = strongName ? "medium" : "low";
  }
  return finding(r, brand?.name ?? r.candidate.brand, f, label, severity, score, signals, evidence);
}

function finding(r: AccountRaw, brandName: string, facts: AccountFacts, label: AccountLabel, severity: Severity, score: number, signals: string[], evidence: string[]): AccountFinding {
  return {
    id: r.id,
    kind: "account",
    brand: r.candidate.brand,
    brandName,
    imitates: r.candidate.imitates,
    fuzzer: r.candidate.fuzzer,
    label,
    severity,
    score,
    signals,
    evidence,
    facts,
    links: { explorer: `https://nearblocks.io/address/${r.id}` },
  };
}

export function fuzzerText(f: NearFuzzer): string {
  const t: Record<NearFuzzer, string> = {
    homoglyph: "a lookalike-letter copy",
    "digit-swap": "a digit-for-letter copy",
    omission: "a one-letter-missing copy",
    repetition: "a doubled-letter copy",
    transposition: "a swapped-letters copy",
    insertion: "a one-extra-letter copy",
    replacement: "a keyboard-typo copy",
    addition: "an extra-trailing-character copy",
    "vowel-swap": "a changed-vowel copy",
    hyphenation: "a hyphenated copy",
    plural: "a plural copy",
    separator: "a different-separator copy",
    "swapped-segments": "a swapped-words copy",
    "lure-suffix": "the brand name plus a word",
    "lure-prefix": "a word plus the brand name",
    "fake-sub-account": "a fake sub-account (dots replaced)",
    "brand-near": "the brand name plus \"near\"",
    "other-tla": "the brand name under another top-level account",
    "bare-stem": "the bare brand name",
    "sub-account-of-lookalike": "an official sub-account name under a lookalike",
  };
  return t[f];
}

export interface AccountReport {
  scannedAt: string;
  candidates: number;
  found: number;
  findings: AccountFinding[];
  counts: Record<AccountLabel, number>;
}

/** Scores every found account; sorted by severity, then score. */
export function analyzeScan(scan: RawScan, index: BrandIndex): AccountReport {
  const nowMs = Date.parse(scan.scannedAt);
  const foundIds = new Map(scan.found.map((r) => [r.id, Object.keys(r.keyAccounts)]));
  // A lookalike nested under an already-found lookalike inherits nothing; it is scored on its own facts.
  const findings = scan.found
    .filter((r) => !index.ownerOfAccount(r.id))
    .map((r) => analyzeAccount(r, nowMs, index, foundIds))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.score - a.score || a.id.localeCompare(b.id));
  const counts = Object.fromEntries(
    (["fake-token", "impersonation-likely", "lookalike-active", "lookalike-dormant", "brand-owned", "likely-unrelated"] as AccountLabel[]).map((l) => [
      l,
      findings.filter((f) => f.label === l).length,
    ]),
  ) as Record<AccountLabel, number>;
  return { scannedAt: scan.scannedAt, candidates: scan.candidates + scan.subAccountProbes, found: scan.found.length, findings, counts };
}

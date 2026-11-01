/**
 * "Check before you send": the call a wallet or an agent makes before sending funds to a NEAR account
 * or opening a link. Returns ALLOW, WARN or BLOCK with reasons.
 *
 *   BLOCK  the registry has an active entry for it (or for its parent account / parent domain)
 *   WARN   the entry is disputed; or it looks like an official account or domain but is not one and is
 *          not in the registry yet; or the registry could not be reached (fail closed to a human)
 *   ALLOW  an official account or domain from the brand list; or nothing matched
 *
 * Wallet integration needs only `registryViews.isFlagged(id)`: one JSON-RPC view call, no SDK, no key.
 */
import { parse } from "tldts";
import type { BrandIndex } from "../brands.ts";
import { isImplicit, isValidAccountId } from "../near/account-id.ts";
import { LURE_RE } from "../near/permute.ts";
import { RegistryViews, type FlagResult } from "../registry/client.ts";
import { fold, lookalikeOf } from "./lookalike.ts";
import { levenshtein } from "../../engine/src/util/text.ts";

export type Verdict = "ALLOW" | "WARN" | "BLOCK";

export interface Reason {
  code: string;
  message: string;
}

export interface CheckResult {
  verdict: Verdict;
  input: string;
  subject: string;
  kind: "account" | "domain";
  reasons: Reason[];
  registry?: FlagResult;
  checkedAt: string;
}

/** Testnet registry deployed by this project (see README "Live testnet deployment"). */
export const DEFAULT_REGISTRY = process.env.MIMICWATCH_REGISTRY ?? "";
export const DEFAULT_RPC = process.env.MIMICWATCH_RPC ?? "https://test.rpc.fastnear.com";

const ACCOUNT_TLAS = new Set(["near", "tg", "testnet", "sweat", "aurora", "kaiching", "sandbox"]);

export function classify(input: string): { subject: string; kind: "account" | "domain" } {
  let s = input.trim().toLowerCase();
  const isUrl = /^[a-z][a-z0-9+.-]*:\/\//.test(s) || s.includes("/");
  if (isUrl) {
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split(/[/?#]/)[0].replace(/^.*@/, "").replace(/:\d+$/, "");
    return { subject: s.replace(/\.$/, ""), kind: "domain" };
  }
  const tla = s.slice(s.lastIndexOf(".") + 1);
  if (isImplicit(s) || (isValidAccountId(s) && (ACCOUNT_TLAS.has(tla) || !s.includes(".")))) return { subject: s, kind: "account" };
  return { subject: s.replace(/\.$/, ""), kind: "domain" };
}

function domainLookalike(host: string, index: BrandIndex): Reason | undefined {
  const p = parse(host);
  const label = p.domainWithoutSuffix;
  if (!label) return undefined;
  for (const b of index.brands) {
    for (const d of [...b.officialDomains, ...(b.legacyDomains ?? [])]) {
      const ol = parse(d).domainWithoutSuffix;
      if (!ol || ol.length < 4) continue;
      const f = fold(label);
      const of = fold(ol);
      const official = `${ol}.${parse(d).publicSuffix}`;
      if (f === of) return { code: "LOOKALIKE_DOMAIN", message: `looks like ${official} (${b.name}) but is not an official domain` };
      if (of.length >= 6 && levenshtein(f, of) === 1) return { code: "LOOKALIKE_DOMAIN", message: `one character away from ${official} (${b.name})` };
      if (of.length >= 4 && f.includes(of) && LURE_RE.test(host)) return { code: "BRAND_BAIT_DOMAIN", message: `uses the ${b.name} name with a lure word; official domains: ${b.officialDomains.join(", ")}` };
    }
    // Official domain embedded in a longer host: rhea.finance.claim-now.xyz
    for (const d of b.officialDomains) if (host.includes(`${d}.`) && !host.endsWith(d)) return { code: "OFFICIAL_DOMAIN_EMBEDDED", message: `contains ${d} but is hosted on ${p.domain}` };
  }
  return undefined;
}

export interface CheckOptions {
  /** Registry contract account; empty = skip the on-chain lookup (heuristics only). */
  registry?: string;
  rpcUrl?: string;
  /** Brand list for the offline lookalike test and the official allowlist; `false` to skip. */
  brands?: BrandIndex | false;
  views?: Pick<RegistryViews, "isFlagged">;
  now?: () => Date;
}

export async function checkNearRecipient(input: string, o: CheckOptions = {}): Promise<CheckResult> {
  const { subject, kind } = classify(input);
  const reasons: Reason[] = [];
  const res: CheckResult = { verdict: "ALLOW", input, subject, kind, reasons, checkedAt: (o.now?.() ?? new Date()).toISOString() };
  const registry = o.registry ?? DEFAULT_REGISTRY;
  const views = o.views ?? (registry ? new RegistryViews(registry, o.rpcUrl ?? DEFAULT_RPC) : undefined);
  let worst: Verdict = "ALLOW";
  const raise = (v: Verdict) => {
    if (v === "BLOCK" || (v === "WARN" && worst === "ALLOW")) worst = v;
  };

  if (views) {
    try {
      const f = await views.isFlagged(subject);
      res.registry = f;
      if (f.flagged && f.entry) {
        const e = f.entry;
        const where = f.via === "exact" ? "" : ` (via its parent ${e.subject})`;
        if (e.status === "active") {
          raise("BLOCK");
          reasons.push({ code: "REGISTRY_FLAGGED", message: `Mimicwatch registry: ${e.severity} ${e.category}${e.brand ? ` imitating ${e.brand}` : ""}${where}. Evidence: ${e.evidence_url}` });
        } else {
          raise("WARN");
          reasons.push({ code: "REGISTRY_DISPUTED", message: `flagged as ${e.severity} ${e.category}${where}, but disputed${e.dispute?.by_subject ? " by the account itself" : ""}: "${e.dispute?.reason ?? ""}". Ask a human.` });
        }
      } else if (f.cleared) {
        reasons.push({ code: "CLEARED", message: `was flagged earlier and cleared by the registry owner: ${f.cleared.reason}` });
      }
    } catch (e) {
      raise("WARN");
      reasons.push({ code: "REGISTRY_UNAVAILABLE", message: `could not reach the registry (${(e as Error).message}); ask a human before sending` });
    }
  }

  if (o.brands) {
    const owner = kind === "account" ? o.brands.ownerOfAccount(subject) : o.brands.ownerOfHost(subject);
    if (owner) {
      reasons.push({ code: kind === "account" ? "OFFICIAL_ACCOUNT" : "OFFICIAL_DOMAIN", message: `official ${kind} of ${owner.name}` });
    } else if (kind === "account") {
      const hit = lookalikeOf(subject, o.brands);
      if (hit && !(res.registry?.flagged)) {
        raise("WARN");
        reasons.push({ code: "LOOKALIKE_ACCOUNT", message: `${hit.how} lookalike of ${hit.imitates} (${hit.brand.name}); not in the registry yet` });
      }
    } else {
      const hit = domainLookalike(subject, o.brands);
      if (hit && !(res.registry?.flagged)) {
        raise("WARN");
        reasons.push({ ...hit, message: `${hit.message}; not in the registry yet` });
      }
    }
  }
  if (reasons.length === 0) reasons.push({ code: "NO_MATCH", message: "not in the registry and not a lookalike of a listed NEAR brand" });
  res.verdict = worst;
  return res;
}

import { readFile } from "node:fs/promises";
import { getAddress, isAddress } from "viem";

export type Chain = "base" | "ethereum";
export const CHAINS: Chain[] = ["base", "ethereum"];

export interface OfficialToken {
  chain: Chain;
  address: string;
  symbol: string;
  name?: string;
}

/** What a client tells us about their brand. Everything we flag is compared against this. */
export interface BrandProfile {
  /** Display name, e.g. "Uniswap". */
  name: string;
  /** Registrable domains the brand owns, e.g. ["uniswap.org"]. Subdomains are implied. */
  officialDomains: string[];
  /** Main site used as the visual/text reference for page similarity. Defaults to https://<officialDomains[0]>. */
  referenceUrl?: string;
  officialTokens: OfficialToken[];
  /** Handles keyed by platform, e.g. { x: "Uniswap", telegram: "uniswap" }. Used in reports. */
  officialSocials: Record<string, string>;
  /** Lowercase brand words to look for in domains, certificates and token names, e.g. ["uniswap"]. */
  keywords: string[];
  /** Extra domains to never flag (partners, old brand domains, known fan sites). */
  allowlist?: string[];
  /** Chains to watch for copycat tokens. Defaults to the chains of officialTokens, else ["base"]. */
  tokenChains?: Chain[];
  /** Contact shown in drafts as the reporter, e.g. "security@client.xyz". Placeholder if empty. */
  reporterContact?: string;
}

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/;

export class BrandError extends Error {}

/** Validates and normalises a profile. Throws BrandError with every problem found. */
export function parseBrand(input: unknown): BrandProfile {
  const errs: string[] = [];
  const o = (input ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => typeof v === "string" && v.trim().length > 0;

  if (!str(o.name)) errs.push("name: required string");
  const domains = Array.isArray(o.officialDomains) ? o.officialDomains.map((d) => String(d).trim().toLowerCase()) : [];
  if (domains.length === 0) errs.push("officialDomains: at least one domain required");
  for (const d of domains) if (!DOMAIN_RE.test(d)) errs.push(`officialDomains: invalid domain "${d}"`);

  const tokens: OfficialToken[] = [];
  if (o.officialTokens !== undefined && !Array.isArray(o.officialTokens)) errs.push("officialTokens: must be an array");
  for (const [i, t] of ((o.officialTokens as unknown[]) ?? []).entries()) {
    const tt = (t ?? {}) as Record<string, unknown>;
    if (tt.chain !== "base" && tt.chain !== "ethereum") errs.push(`officialTokens[${i}].chain: "base" or "ethereum"`);
    if (!str(tt.address) || !isAddress(String(tt.address), { strict: false }))
      errs.push(`officialTokens[${i}].address: invalid EVM address`);
    if (!str(tt.symbol)) errs.push(`officialTokens[${i}].symbol: required`);
    if (errs.length === 0)
      tokens.push({
        chain: tt.chain as Chain,
        address: getAddress(String(tt.address)),
        symbol: String(tt.symbol),
        name: str(tt.name) ? String(tt.name) : undefined,
      });
  }

  const keywords = Array.isArray(o.keywords) ? o.keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean) : [];
  if (keywords.length === 0) errs.push("keywords: at least one keyword required");
  for (const k of keywords) if (k.length < 3) errs.push(`keywords: "${k}" is too short (min 3 chars, too many false positives)`);

  const socials = (o.officialSocials ?? {}) as Record<string, unknown>;
  if (typeof socials !== "object" || Array.isArray(socials)) errs.push("officialSocials: must be an object");

  const tokenChains = Array.isArray(o.tokenChains) ? (o.tokenChains as Chain[]) : undefined;
  for (const c of tokenChains ?? []) if (c !== "base" && c !== "ethereum") errs.push(`tokenChains: unsupported chain "${c}"`);

  if (errs.length) throw new BrandError(`Invalid brand profile:\n- ${errs.join("\n- ")}`);

  return {
    name: String(o.name).trim(),
    officialDomains: domains,
    referenceUrl: str(o.referenceUrl) ? String(o.referenceUrl) : `https://${domains[0]}`,
    officialTokens: tokens,
    officialSocials: Object.fromEntries(Object.entries(socials).map(([k, v]) => [k, String(v)])),
    keywords: [...new Set(keywords)],
    allowlist: Array.isArray(o.allowlist) ? o.allowlist.map((d) => String(d).toLowerCase()) : [],
    tokenChains: tokenChains ?? (tokens.length ? [...new Set(tokens.map((t) => t.chain))] : ["base"]),
    reporterContact: str(o.reporterContact) ? String(o.reporterContact) : undefined,
  };
}

export async function loadBrand(path: string): Promise<BrandProfile> {
  return parseBrand(JSON.parse(await readFile(path, "utf8")));
}

/** True when host is an official domain, one of its subdomains, or allowlisted. */
export function isOfficialHost(brand: BrandProfile, host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return [...brand.officialDomains, ...(brand.allowlist ?? [])].some((d) => h === d || h.endsWith(`.${d}`));
}

export function isOfficialToken(brand: BrandProfile, chain: Chain, address: string): boolean {
  return brand.officialTokens.some((t) => t.chain === chain && t.address.toLowerCase() === address.toLowerCase());
}

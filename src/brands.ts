/** The NEAR brand list (brands/near-brands.json): official domains and named accounts of ecosystem dApps. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isUnder } from "./near/account-id.ts";

export const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

export interface OfficialAccount {
  id: string;
  role: string;
  contract?: boolean;
  source?: string;
}

export interface NearBrand {
  id: string;
  name: string;
  formerly?: string[];
  category: string;
  status: "active" | "legacy" | "deprecated";
  officialDomains: string[];
  legacyDomains?: string[];
  referenceUrl?: string;
  officialAccounts: OfficialAccount[];
  /** Named accounts whose sub-accounts all belong to the brand. */
  accountRoots: string[];
  /** Distinctive strings an impersonator would copy in a .near name. */
  nameStems: string[];
  keywords: string[];
  officialSocials?: Record<string, string>;
  sources: string[];
  notes?: string;
}

export interface BrandList {
  verifiedAt: string;
  method: string;
  brands: NearBrand[];
}

export function loadBrands(path = process.env.MW_BRANDS ?? join(ROOT, "brands/near-brands.json")): BrandList {
  return JSON.parse(readFileSync(path, "utf8")) as BrandList;
}

/** Fast lookups over the brand list. */
export class BrandIndex {
  readonly brands: NearBrand[];
  private readonly exact = new Map<string, NearBrand>();
  private readonly roots: Array<[string, NearBrand]> = [];
  private readonly domains: Array<[string, NearBrand]> = [];

  constructor(list: BrandList | NearBrand[]) {
    this.brands = Array.isArray(list) ? list : list.brands;
    for (const b of this.brands) {
      for (const a of b.officialAccounts) this.exact.set(a.id, b);
      for (const r of b.accountRoots) this.roots.push([r, b]);
      for (const d of [...b.officialDomains, ...(b.legacyDomains ?? [])]) this.domains.push([d, b]);
    }
  }

  /** The brand that owns this account: an official account, or anything under an official root. */
  ownerOfAccount(id: string): NearBrand | undefined {
    const hit = this.exact.get(id);
    if (hit) return hit;
    return this.roots.find(([r]) => isUnder(id, r))?.[1];
  }

  /** The brand that owns this host (an official domain or a subdomain of one). */
  ownerOfHost(host: string): NearBrand | undefined {
    const h = host.toLowerCase().replace(/\.$/, "");
    return this.domains.find(([d]) => h === d || h.endsWith(`.${d}`))?.[1];
  }

  /** Every official account id and root, for exclusion and comparisons. */
  officialNames(): Array<{ id: string; brand: NearBrand }> {
    const out = new Map<string, NearBrand>();
    for (const b of this.brands) {
      for (const a of b.officialAccounts) out.set(a.id, b);
      for (const r of b.accountRoots) out.set(r, b);
    }
    return [...out].map(([id, brand]) => ({ id, brand }));
  }

  byId(id: string): NearBrand | undefined {
    return this.brands.find((b) => b.id === id);
  }
}

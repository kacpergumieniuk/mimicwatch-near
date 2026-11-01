import { BrandIndex, type NearBrand } from "../src/brands.ts";
import type { AccountRaw, TxSummary } from "../src/near/collect.ts";
import type { NearCandidate } from "../src/near/permute.ts";

export const BRANDS: NearBrand[] = [
  {
    id: "rhea",
    name: "Rhea Finance",
    category: "dex",
    status: "active",
    officialDomains: ["rhea.finance", "ref.finance"],
    officialAccounts: [
      { id: "v2.ref-finance.near", role: "AMM contract", contract: true },
      { id: "token.rhealab.near", role: "RHEA token", contract: true },
    ],
    accountRoots: ["ref-finance.near", "rhealab.near"],
    nameStems: ["ref-finance", "rhealab"],
    keywords: ["rhea", "ref-finance"],
    sources: [],
  },
  {
    id: "sweat",
    name: "Sweat Economy",
    category: "token",
    status: "active",
    officialDomains: ["sweateconomy.com"],
    officialAccounts: [{ id: "token.sweat", role: "SWEAT token", contract: true }],
    accountRoots: ["sweat"],
    nameStems: ["sweat"],
    keywords: ["sweatcoin"],
    sources: [],
  },
];

export const index = () => new BrandIndex(BRANDS);

export const NOW = Date.parse("2026-11-02T00:00:00Z");
const NS = (iso: string) => String(BigInt(Date.parse(iso)) * 1_000_000n);
export const yoctoOf = (near: number) => (BigInt(Math.round(near * 1000)) * 10n ** 21n).toString();

export function tx(signer: string, receiver: string, iso: string, near?: number, kind = "Transfer"): TxSummary {
  return { hash: `${signer}-${receiver}-${iso}`, signer, receiver, timestampNs: NS(iso), actions: [{ kind, ...(near !== undefined ? { deposit: yoctoOf(near) } : {}) }] };
}

export function raw(id: string, cand: Partial<NearCandidate>, o: Partial<AccountRaw> & { created?: string; creator?: string } = {}): AccountRaw {
  const created = o.created ?? "2026-10-20T00:00:00Z";
  const creation = tx(o.creator ?? "somebody.near", "near", created, undefined, "FunctionCall");
  const details = o.details ?? [creation];
  return {
    id,
    candidate: { id, fuzzer: "homoglyph", imitates: "ref-finance.near", brand: "rhea", ...cand },
    view: { amount: yoctoOf(1), locked: "0", code_hash: "11111111111111111111111111111111", storage_usage: 182, ...(o.view ?? {}) },
    keys: o.keys ?? [{ publicKey: "ed25519:K1", fullAccess: true }],
    txsCount: o.txsCount ?? details.length,
    recent: o.recent ?? [...details].sort((a, b) => b.timestampNs.localeCompare(a.timestampNs)).map((d) => ({ hash: d.hash, ts: d.timestampNs, signer: d.signer === id, receiver: d.receiver === id, fn: false })),
    creation,
    details,
    ft: o.ft,
    keyAccounts: o.keyAccounts ?? {},
    errors: o.errors ?? [],
  };
}

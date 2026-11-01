/**
 * Turns the pre-existing engine's per-brand domain findings into this project's common finding shape
 * (the same one NEAR account findings use), so both go through one review queue and one publisher.
 */
import type { DomainFinding, Severity } from "../../engine/src/scoring.ts";
import type { NearBrand } from "../brands.ts";
import type { Candidate, RegistryCategory } from "../review/queue.ts";

export interface EngineScan {
  brand: { name: string; officialDomains: string[] };
  startedAt: string;
  finishedAt: string;
  stats: Record<string, unknown>;
  domains: DomainFinding[];
  errors: string[];
}

export function categoryOf(d: Pick<DomainFinding, "label" | "page">): RegistryCategory {
  if (d.label === "phishing-likely") return d.page?.signals?.drainerJs?.length ? "drainer" : "phishing";
  return "impersonation";
}

export interface DomainReport {
  findings: Candidate[];
  counts: Record<string, number>;
}

const squash = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

/** How specifically a host names a brand: the longest of its stems, keywords or official labels inside the host. */
export function specificity(host: string, b: NearBrand | undefined): number {
  if (!b) return 0;
  const h = squash(host);
  const words = [...b.nameStems, ...b.keywords, ...b.officialDomains.map((d) => d.split(".")[0])].map(squash).filter((w) => w.length >= 4);
  return Math.max(0, ...words.filter((w) => h.includes(w)).map((w) => w.length)) + (b.id === "near" ? 0.5 : 0);
}

/**
 * Keeps medium and above for the review queue; lower ones stay in the per-brand engine reports. A host found by
 * several brand scans (near-token.com by both near.org and near.ai) is attributed to the most specific brand,
 * with NEAR Protocol winning ties.
 */
export function domainCandidates(scans: EngineScan[], brands: NearBrand[], minSeverity: Severity[] = ["critical", "high", "medium"]): DomainReport {
  const byName = new Map(brands.map((b) => [b.name, b]));
  const seen = new Map<string, Candidate>();
  const counts: Record<string, number> = {};
  for (const s of scans) {
    const b = byName.get(s.brand.name);
    for (const d of s.domains) {
      counts[d.label] = (counts[d.label] ?? 0) + 1;
      if (!minSeverity.includes(d.severity)) continue;
      const prev = seen.get(d.host);
      if (prev) {
        const better = d.score > prev.score || (d.score === prev.score && specificity(d.host, b) > specificity(d.host, byName.get(prev.brandName)));
        if (!better) continue;
      }
      seen.set(d.host, {
        subject: d.host,
        kind: "domain",
        brand: b?.id ?? s.brand.name.toLowerCase(),
        brandName: s.brand.name,
        label: d.label,
        severity: d.severity,
        score: d.score,
        category: categoryOf(d),
        evidence: d.evidence,
        facts: {
          sources: d.sources,
          fuzzer: d.fuzzer,
          ctFirstSeen: d.ctFirstSeen,
          nrdDate: d.nrdDate,
          dns: d.dns ? { a: d.dns.a, ns: d.dns.ns, mx: d.dns.mx } : undefined,
          page: d.page ? { status: d.page.status, finalUrl: d.page.finalUrl, title: d.page.title, signals: d.page.signals } : undefined,
          similarity: d.similarity,
          listedOn: d.listedOn,
          alreadyBlocked: d.alreadyBlocked,
          platform: d.platform,
          registrar: d.rdap?.registrar,
          registered: d.rdap?.registered,
        },
        links: { defanged: d.host.replace(/\./g, "[.]") },
      });
    }
  }
  // A host that only shares the generic word "near" with a brand (nearswap.io via near.social) is about NEAR
  // itself; other generic 4-letter matches ("meme") are kept but marked as a weak brand link for the reviewer.
  const near = brands.find((b) => b.id === "near");
  for (const c of seen.values()) {
    const b = brands.find((x) => x.id === c.brand);
    const spec = specificity(c.subject, b);
    if (near && b && b.id !== "near" && Math.floor(spec) <= 4 && specificity(c.subject, near) >= 4) {
      c.brand = near.id;
      c.brandName = near.name;
    } else if (spec > 0 && Math.floor(spec) <= 4 && c.facts.fuzzer === "dictionary" && ((c.facts.similarity as { title?: number } | undefined)?.title ?? 0) < 0.5) {
      c.facts.brandLink = "weak: the host shares only a short generic word with the brand, and the page does not copy its title";
    }
  }
  const order: Severity[] = ["critical", "high", "medium", "low", "info"];
  const findings = [...seen.values()].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || b.score - a.score || a.subject.localeCompare(b.subject));
  return { findings, counts };
}

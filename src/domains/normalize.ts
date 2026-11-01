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

/** Keeps medium and above for the review queue; lower ones stay in the per-brand engine reports. */
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
      if (prev && prev.score >= d.score) continue;
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
  const order: Severity[] = ["critical", "high", "medium", "low", "info"];
  const findings = [...seen.values()].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || b.score - a.score || a.subject.localeCompare(b.subject));
  return { findings, counts };
}

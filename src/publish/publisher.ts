/**
 * Publisher: queue -> registry. It publishes an item only when ALL of these hold:
 *   1. a person approved it (`review.decision === "approve"` with a reviewer name);
 *   2. its reviewed severity is high or critical (the contract refuses anything lower, too);
 *   3. its label is not one that means "not a threat" (brand-owned, likely-unrelated, likely-false-positive, ...);
 *   4. it has evidence;
 *   5. it is not already published with the same evidence and severity.
 * Pending, rejected and watched items are never published, whatever their score.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { effectiveCategory, effectiveSeverity, type QueueItem, type Queue, type RegistryCategory } from "../review/queue.ts";
import type { Severity } from "../near/analyze.ts";

export const PUBLISHABLE: Severity[] = ["critical", "high"];
/** Labels that mean the scan itself thinks it is not a threat. Never published, even if approved. */
export const NEVER_PUBLISH_LABELS = ["brand-owned", "likely-unrelated", "likely-false-positive", "brand-owned-redirect", "parked", "not-live"];

export interface ReportInput {
  subject: string;
  kind: "account" | "domain";
  category: RegistryCategory;
  severity: "high" | "critical";
  evidence_url: string;
  evidence_hash: string;
  brand: string;
  note: string;
}

export interface Selection {
  publish: Array<{ item: QueueItem; input: ReportInput; evidence: EvidenceDoc }>;
  skipped: Array<{ key: string; reason: string }>;
}

/** The document whose sha256 goes on chain. Stable key order, no volatile fields. */
export interface EvidenceDoc {
  schema: "mimicwatch-near/evidence/v1";
  subject: string;
  kind: "account" | "domain";
  brand: { id: string; name: string };
  label: string;
  severity: Severity;
  category: RegistryCategory;
  evidence: string[];
  facts: Record<string, unknown>;
  links: Record<string, string>;
  scans: string[];
  firstSeen: string;
  review: { reviewer: string; at: string; note?: string };
}

/** JSON with keys sorted at every level, so the hash does not depend on key order. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function evidenceDoc(i: QueueItem): EvidenceDoc {
  return {
    schema: "mimicwatch-near/evidence/v1",
    subject: i.subject,
    kind: i.kind,
    brand: { id: i.brand, name: i.brandName },
    label: i.label,
    severity: effectiveSeverity(i),
    category: effectiveCategory(i),
    evidence: i.evidence,
    facts: i.facts,
    links: i.links,
    scans: i.scans,
    firstSeen: i.firstSeen,
    review: { reviewer: i.review.reviewer!, at: i.review.at!, note: i.review.note },
  };
}

export const evidencePath = (i: Pick<QueueItem, "kind" | "subject">) => `evidence/${i.kind}/${i.subject}.json`;

export function whyNot(i: QueueItem): string | undefined {
  if (i.review.decision !== "approve") return `review is "${i.review.decision}"`;
  if (!i.review.reviewer?.trim()) return "approved without a reviewer name";
  const sev = effectiveSeverity(i);
  if (!PUBLISHABLE.includes(sev)) return `severity ${sev} (only high and critical are published)`;
  if (NEVER_PUBLISH_LABELS.includes(i.label)) return `label ${i.label} means not a threat`;
  if (i.evidence.length === 0) return "no evidence";
  return undefined;
}

export function selectForPublish(q: Queue, o: { evidenceBaseUrl: string; network: string; contract: string }): Selection {
  const sel: Selection = { publish: [], skipped: [] };
  for (const i of q.items) {
    const reason = whyNot(i);
    if (reason) {
      sel.skipped.push({ key: i.key, reason });
      continue;
    }
    const doc = evidenceDoc(i);
    const hash = sha256(canonicalJson(doc));
    const p = i.published;
    if (p && p.network === o.network && p.contract === o.contract && p.evidenceHash === hash && p.severity === effectiveSeverity(i)) {
      sel.skipped.push({ key: i.key, reason: "already published with this evidence" });
      continue;
    }
    const brandWord = i.brandName.length <= 40 ? i.brandName : i.brand;
    sel.publish.push({
      item: i,
      evidence: doc,
      input: {
        subject: i.subject,
        kind: i.kind,
        category: effectiveCategory(i),
        severity: effectiveSeverity(i) as "high" | "critical",
        evidence_url: `${o.evidenceBaseUrl.replace(/\/$/, "")}/${evidencePath(i)}`,
        evidence_hash: hash,
        brand: i.brand,
        note: `${i.label}: imitates ${brandWord}`.slice(0, 280),
      },
    });
  }
  return sel;
}

/** Anything that can write to a registry: the testnet contract, a local sandbox, or a test double. */
export interface RegistryWriter {
  network: string;
  contract: string;
  reportBatch(entries: ReportInput[]): Promise<{ tx: string }>;
}

export interface PublishResult {
  published: Array<{ key: string; tx: string; evidenceHash: string }>;
  skipped: Array<{ key: string; reason: string }>;
}

/** Writes evidence files, sends report_batch in chunks of 20, records `published` on each item. */
export async function publish(q: Queue, w: RegistryWriter, o: { root: string; evidenceBaseUrl: string; at: string; dryRun?: boolean; log?: (s: string) => void }): Promise<PublishResult> {
  const sel = selectForPublish(q, { evidenceBaseUrl: o.evidenceBaseUrl, network: w.network, contract: w.contract });
  const res: PublishResult = { published: [], skipped: sel.skipped };
  for (const s of sel.publish) {
    const path = join(o.root, evidencePath(s.item));
    mkdirSync(dirname(path), { recursive: true });
    // No trailing newline: `shasum -a 256 <file>` equals the on-chain evidence_hash.
    writeFileSync(path, canonicalJson(s.evidence));
  }
  if (o.dryRun) return { published: sel.publish.map((s) => ({ key: s.item.key, tx: "(dry run)", evidenceHash: s.input.evidence_hash })), skipped: sel.skipped };
  for (let i = 0; i < sel.publish.length; i += 20) {
    const chunk = sel.publish.slice(i, i + 20);
    const { tx } = await w.reportBatch(chunk.map((c) => c.input));
    o.log?.(`report_batch(${chunk.length}) -> ${tx}`);
    for (const c of chunk) {
      c.item.published = {
        network: w.network,
        contract: w.contract,
        tx,
        at: o.at,
        evidenceHash: c.input.evidence_hash,
        evidenceUrl: c.input.evidence_url,
        severity: c.input.severity,
      };
      res.published.push({ key: c.item.key, tx, evidenceHash: c.input.evidence_hash });
    }
  }
  return res;
}

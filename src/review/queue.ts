/**
 * The manual-review queue (review/queue.json). Scans add findings as `pending`; a person approves,
 * rejects or keeps watching each one. Only the publisher reads approvals, and it re-checks them.
 *
 * Safety rules, all tested:
 * - New findings always start as `pending`, whatever their score.
 * - If an approved finding comes back from a later scan with a different severity or label, its
 *   approval is reset to `pending` (the evidence changed, so the decision must be made again).
 * - Rejections stick: a rejected subject stays rejected on later scans (false positives do not come back).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Severity } from "../near/analyze.ts";

export type Kind = "account" | "domain";
export type Decision = "pending" | "approve" | "reject" | "watch";
export type RegistryCategory = "impersonation" | "phishing" | "drainer" | "fake-token" | "scam";

/** One finding in a scan, in the queue's common shape (accounts and domains). */
export interface Candidate {
  subject: string;
  kind: Kind;
  brand: string;
  brandName: string;
  label: string;
  severity: Severity;
  score: number;
  category: RegistryCategory;
  evidence: string[];
  facts: Record<string, unknown>;
  links: Record<string, string>;
}

export interface Review {
  decision: Decision;
  reviewer?: string;
  at?: string;
  note?: string;
  /** Severity the reviewer settled on (defaults to the scan's). */
  severity?: Severity;
  category?: RegistryCategory;
}

export interface Published {
  network: string;
  contract: string;
  tx: string;
  at: string;
  evidenceHash: string;
  evidenceUrl: string;
  severity: Severity;
}

export interface QueueItem extends Candidate {
  key: string;
  firstSeen: string;
  lastSeen: string;
  scans: string[];
  review: Review;
  published?: Published;
  /** Set when a scan changed severity or label after the last decision. */
  changed?: string;
}

export interface Queue {
  version: 1;
  updatedAt: string;
  items: QueueItem[];
}

export const keyOf = (kind: Kind, subject: string) => `${kind}:${subject}`;

export function emptyQueue(): Queue {
  return { version: 1, updatedAt: new Date(0).toISOString(), items: [] };
}

export function loadQueue(path: string): Queue {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Queue) : emptyQueue();
}

export function saveQueue(path: string, q: Queue): void {
  q.items.sort((a, b) => a.key.localeCompare(b.key));
  writeFileSync(path, JSON.stringify(q, null, 2) + "\n");
}

export interface SyncResult {
  added: string[];
  updated: string[];
  reset: string[];
}

/** Merges a scan's candidates into the queue. `scanId` is e.g. "2026-11-02/accounts". */
export function syncQueue(q: Queue, cands: Candidate[], scanId: string, at: string): SyncResult {
  const res: SyncResult = { added: [], updated: [], reset: [] };
  const byKey = new Map(q.items.map((i) => [i.key, i]));
  for (const c of cands) {
    const key = keyOf(c.kind, c.subject);
    const old = byKey.get(key);
    if (!old) {
      const item: QueueItem = { ...c, key, firstSeen: at, lastSeen: at, scans: [scanId], review: { decision: "pending" } };
      q.items.push(item);
      byKey.set(key, item);
      res.added.push(key);
      continue;
    }
    const changed = old.severity !== c.severity || old.label !== c.label;
    const prevDecision = old.review.decision;
    Object.assign(old, c, { key, firstSeen: old.firstSeen, lastSeen: at, scans: [...new Set([...old.scans, scanId])] });
    if (changed && prevDecision === "approve") {
      old.changed = `scan ${scanId} changed it to ${c.label}/${c.severity}; the earlier approval was reset`;
      old.review = { decision: "pending", note: old.review.note };
      res.reset.push(key);
    } else if (changed) {
      old.changed = `scan ${scanId} changed it to ${c.label}/${c.severity}`;
    }
    res.updated.push(key);
  }
  q.updatedAt = at;
  return res;
}

export class ReviewError extends Error {}

/** Records a decision. Approving needs a reviewer name; approval below high is allowed but never published. */
export function decide(q: Queue, subject: string, decision: Decision, o: { reviewer?: string; note?: string; severity?: Severity; category?: RegistryCategory; at: string; kind?: Kind }): QueueItem {
  const matches = q.items.filter((i) => i.subject === subject && (!o.kind || i.kind === o.kind));
  if (matches.length === 0) throw new ReviewError(`not in the queue: ${subject}`);
  if (matches.length > 1) throw new ReviewError(`${subject} is both an account and a domain; pass --kind`);
  const item = matches[0];
  if (decision === "approve" && !o.reviewer?.trim()) throw new ReviewError("approving needs --reviewer <name>");
  item.review = { decision, reviewer: o.reviewer?.trim(), at: o.at, note: o.note, severity: o.severity, category: o.category };
  delete item.changed;
  return item;
}

export const effectiveSeverity = (i: QueueItem): Severity => i.review.severity ?? i.severity;
export const effectiveCategory = (i: QueueItem): RegistryCategory => i.review.category ?? i.category;

/** Account findings (src/near/analyze.ts) in the queue's shape. Only medium and above enter the queue. */
export function accountCandidates(
  findings: Array<{ id: string; brand: string; brandName: string; label: string; severity: Severity; score: number; evidence: string[]; facts: object; links: Record<string, string>; imitates: string; fuzzer: string; signals: string[] }>,
  minSeverity: Severity[] = ["critical", "high", "medium"],
): Candidate[] {
  return findings
    .filter((f) => minSeverity.includes(f.severity))
    .map((f) => ({
      subject: f.id,
      kind: "account" as const,
      brand: f.brand,
      brandName: f.brandName,
      label: f.label,
      severity: f.severity,
      score: f.score,
      category: (f.label === "fake-token" ? "fake-token" : "impersonation") as RegistryCategory,
      evidence: f.evidence,
      facts: { ...(f.facts as Record<string, unknown>), imitates: f.imitates, fuzzer: f.fuzzer, signals: f.signals },
      links: f.links,
    }));
}

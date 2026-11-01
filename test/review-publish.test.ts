import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson, publish, selectForPublish, sha256, whyNot, type RegistryWriter, type ReportInput } from "../src/publish/publisher.ts";
import { decide, emptyQueue, syncQueue, type Candidate } from "../src/review/queue.ts";

const cand = (subject: string, severity: Candidate["severity"], label = "impersonation-likely", kind: Candidate["kind"] = "account"): Candidate => ({
  subject, kind, brand: "rhea", brandName: "Rhea Finance", label, severity, score: 80, category: "impersonation",
  evidence: [`${subject} is a lookalike`], facts: { a: 1 }, links: { explorer: `https://nearblocks.io/address/${subject}` },
});
const T = "2026-11-02T00:00:00.000Z";
const opts = { evidenceBaseUrl: "https://example.org/repo/blob/main", network: "sandbox", contract: "registry.sandbox" };

class FakeWriter implements RegistryWriter {
  network = "sandbox";
  contract = "registry.sandbox";
  calls: ReportInput[][] = [];
  async reportBatch(entries: ReportInput[]) {
    this.calls.push(entries);
    return { tx: `tx${this.calls.length}` };
  }
}

describe("review queue", () => {
  it("new findings always start as pending, whatever the score", () => {
    const q = emptyQueue();
    const r = syncQueue(q, [cand("ref-flnance.near", "critical"), cand("rhea-claim.xyz", "high", "phishing-likely", "domain")], "2026-11-02", T);
    expect(r.added).toHaveLength(2);
    expect(q.items.every((i) => i.review.decision === "pending")).toBe(true);
  });
  it("approval needs a reviewer name", () => {
    const q = emptyQueue();
    syncQueue(q, [cand("ref-flnance.near", "high")], "s1", T);
    expect(() => decide(q, "ref-flnance.near", "approve", { at: T })).toThrow(/reviewer/);
    expect(() => decide(q, "nope.near", "approve", { at: T, reviewer: "k" })).toThrow(/not in the queue/);
  });
  it("an approval is reset when a later scan changes severity or label", () => {
    const q = emptyQueue();
    syncQueue(q, [cand("ref-flnance.near", "high")], "s1", T);
    decide(q, "ref-flnance.near", "approve", { at: T, reviewer: "kacper" });
    const r = syncQueue(q, [cand("ref-flnance.near", "critical")], "s2", T);
    expect(r.reset).toEqual(["account:ref-flnance.near"]);
    expect(q.items[0].review.decision).toBe("pending");
    expect(q.items[0].changed).toMatch(/approval was reset/);
    expect(q.items[0].scans).toEqual(["s1", "s2"]);
  });
  it("a rejection sticks across scans", () => {
    const q = emptyQueue();
    syncQueue(q, [cand("ref-flnance.near", "high")], "s1", T);
    decide(q, "ref-flnance.near", "reject", { at: T, reviewer: "kacper", note: "personal account" });
    syncQueue(q, [cand("ref-flnance.near", "critical")], "s2", T);
    expect(q.items[0].review.decision).toBe("reject");
  });
});

describe("publisher: false positives never auto-publish", () => {
  const build = () => {
    const q = emptyQueue();
    syncQueue(q, [
      cand("approved-high.near", "high"),
      cand("approved-critical.xyz", "critical", "phishing-likely", "domain"),
      cand("pending-critical.near", "critical"),
      cand("rejected-critical.near", "critical"),
      cand("watched-high.near", "high"),
      cand("approved-medium.near", "medium"),
      cand("approved-owned.near", "high", "brand-owned"),
      cand("approved-fp.xyz", "high", "likely-false-positive", "domain"),
    ], "s1", T);
    decide(q, "approved-high.near", "approve", { at: T, reviewer: "k" });
    decide(q, "approved-critical.xyz", "approve", { at: T, reviewer: "k", category: "phishing" });
    decide(q, "rejected-critical.near", "reject", { at: T, reviewer: "k", note: "fp" });
    decide(q, "watched-high.near", "watch", { at: T, reviewer: "k" });
    decide(q, "approved-medium.near", "approve", { at: T, reviewer: "k" });
    decide(q, "approved-owned.near", "approve", { at: T, reviewer: "k" });
    decide(q, "approved-fp.xyz", "approve", { at: T, reviewer: "k" });
    return q;
  };

  it("selects only approved high/critical threats", () => {
    const sel = selectForPublish(build(), opts);
    expect(sel.publish.map((p) => p.input.subject).sort()).toEqual(["approved-critical.xyz", "approved-high.near"]);
    const why = Object.fromEntries(sel.skipped.map((s) => [s.key, s.reason]));
    expect(why["account:pending-critical.near"]).toMatch(/pending/);
    expect(why["account:rejected-critical.near"]).toMatch(/reject/);
    expect(why["account:watched-high.near"]).toMatch(/watch/);
    expect(why["account:approved-medium.near"]).toMatch(/severity medium/);
    expect(why["account:approved-owned.near"]).toMatch(/brand-owned/);
    expect(why["domain:approved-fp.xyz"]).toMatch(/false-positive/);
  });

  it("a reviewer can raise severity to make it publishable, or lower it to stop it", () => {
    const q = build();
    decide(q, "approved-medium.near", "approve", { at: T, reviewer: "k", severity: "high" });
    decide(q, "approved-high.near", "approve", { at: T, reviewer: "k", severity: "medium" });
    const subjects = selectForPublish(q, opts).publish.map((p) => p.input.subject).sort();
    expect(subjects).toEqual(["approved-critical.xyz", "approved-medium.near"]);
  });

  it("writes evidence whose sha256 is the on-chain hash, sends one batch, and is idempotent", async () => {
    const q = build();
    const root = mkdtempSync(join(tmpdir(), "mw-"));
    const w = new FakeWriter();
    const r = await publish(q, w, { root, evidenceBaseUrl: opts.evidenceBaseUrl, at: T });
    expect(r.published).toHaveLength(2);
    expect(w.calls).toHaveLength(1);
    const input = w.calls[0].find((i) => i.subject === "approved-critical.xyz")!;
    expect(input.category).toBe("phishing");
    expect(input.evidence_url).toBe("https://example.org/repo/blob/main/evidence/domain/approved-critical.xyz.json");
    const file = readFileSync(join(root, "evidence/domain/approved-critical.xyz.json"), "utf8");
    expect(sha256(file)).toBe(input.evidence_hash);
    expect(JSON.parse(file).review.reviewer).toBe("k");
    // Second run: nothing new.
    const again = await publish(q, w, { root, evidenceBaseUrl: opts.evidenceBaseUrl, at: T });
    expect(again.published).toHaveLength(0);
    expect(w.calls).toHaveLength(1);
    expect(again.skipped.filter((s) => s.reason.startsWith("already published"))).toHaveLength(2);
  });

  it("dry run sends nothing", async () => {
    const w = new FakeWriter();
    const r = await publish(build(), w, { root: mkdtempSync(join(tmpdir(), "mw-")), evidenceBaseUrl: opts.evidenceBaseUrl, at: T, dryRun: true });
    expect(r.published).toHaveLength(2);
    expect(w.calls).toHaveLength(0);
  });

  it("batches in chunks of 20 (the contract limit)", async () => {
    const q = emptyQueue();
    const many = Array.from({ length: 45 }, (_, i) => cand(`fake${i}.near`, "high"));
    syncQueue(q, many, "s1", T);
    for (const c of many) decide(q, c.subject, "approve", { at: T, reviewer: "k" });
    const w = new FakeWriter();
    await publish(q, w, { root: mkdtempSync(join(tmpdir(), "mw-")), evidenceBaseUrl: opts.evidenceBaseUrl, at: T });
    expect(w.calls.map((c) => c.length)).toEqual([20, 20, 5]);
  });

  it("canonical JSON does not depend on key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: undefined } })).toBe('{"a":{"d":[2,{"x":2,"y":1}]},"b":1}');
    const q = build();
    expect(whyNot(q.items.find((i) => i.subject === "approved-high.near")!)).toBeUndefined();
  });
});

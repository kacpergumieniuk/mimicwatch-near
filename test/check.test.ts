import { describe, expect, it } from "vitest";
import type { FlagResult } from "../src/registry/client.ts";
import { checkNearRecipient, classify } from "../src/sdk/check.ts";
import { fold, lookalikeOf } from "../src/sdk/lookalike.ts";
import { index } from "./fixtures.ts";

const entry = (subject: string, status: "active" | "disputed" = "active"): FlagResult => ({
  query: subject, flagged: true, via: "exact", cleared: null,
  entry: { subject, kind: "account", category: "impersonation", severity: "high", status, brand: "rhea", evidence_url: "https://e/x.json", evidence_hash: "a".repeat(64), note: null, reporter: "r.testnet", reported_at_ms: 1, updated_at_ms: 1, dispute: status === "disputed" ? { by: subject, by_subject: true, reason: "mine", deposit: "1", at_ms: 1 } : null, disputes_rejected: 0 },
});
const views = (m: Record<string, FlagResult>) => ({
  isFlagged: async (id: string) => m[id] ?? { query: id, flagged: false, via: null, entry: null, cleared: null },
});
const down = { isFlagged: async () => { throw new Error("ECONNREFUSED"); } };

describe("check before you send", () => {
  it("classifies accounts, domains and URLs", () => {
    expect(classify("Ref-Flnance.near")).toEqual({ subject: "ref-flnance.near", kind: "account" });
    expect(classify("https://app.rhea-claim.xyz/connect?x=1")).toEqual({ subject: "app.rhea-claim.xyz", kind: "domain" });
    expect(classify("rhea-claim.xyz")).toEqual({ subject: "rhea-claim.xyz", kind: "domain" });
    expect(classify("hot-wallet.tg").kind).toBe("account");
    expect(classify("a".repeat(64)).kind).toBe("account");
  });
  it("BLOCKs an active registry entry, with evidence", async () => {
    const r = await checkNearRecipient("ref-flnance.near", { views: views({ "ref-flnance.near": entry("ref-flnance.near") }), brands: index() });
    expect(r.verdict).toBe("BLOCK");
    expect(r.reasons[0].code).toBe("REGISTRY_FLAGGED");
    expect(r.reasons[0].message).toContain("https://e/x.json");
  });
  it("WARNs on a disputed entry", async () => {
    const r = await checkNearRecipient("ref-flnance.near", { views: views({ "ref-flnance.near": entry("ref-flnance.near", "disputed") }), brands: index() });
    expect(r.verdict).toBe("WARN");
    expect(r.reasons[0].code).toBe("REGISTRY_DISPUTED");
    expect(r.reasons[0].message).toContain("by the account itself");
  });
  it("ALLOWs an official account", async () => {
    const r = await checkNearRecipient("v2.ref-finance.near", { views: views({}), brands: index() });
    expect(r.verdict).toBe("ALLOW");
    expect(r.reasons[0].code).toBe("OFFICIAL_ACCOUNT");
  });
  it("WARNs on a lookalike that is not in the registry yet", async () => {
    for (const id of ["ref-f1nance.near", "reffinance.near", "v2-ref-finance.near", "ref-finance-airdrop.near", "token-sweat.near"]) {
      const r = await checkNearRecipient(id, { views: views({}), brands: index() });
      expect(r.verdict, id).toBe("WARN");
      expect(r.reasons[0].code, id).toBe("LOOKALIKE_ACCOUNT");
    }
  });
  it("WARNs on lookalike domains, ALLOWs official ones", async () => {
    expect((await checkNearRecipient("https://rhea-finance.claims", { views: views({}), brands: index() })).verdict).toBe("WARN");
    expect((await checkNearRecipient("https://app.rhea.finance/swap", { views: views({}), brands: index() })).verdict).toBe("ALLOW");
    expect((await checkNearRecipient("rhea.finance.connect-wallet.xyz", { views: views({}), brands: index() })).reasons[0].code).toBe("OFFICIAL_DOMAIN_EMBEDDED");
  });
  it("ALLOWs an unrelated account", async () => {
    const r = await checkNearRecipient("alice.near", { views: views({}), brands: index() });
    expect(r.verdict).toBe("ALLOW");
    expect(r.reasons[0].code).toBe("NO_MATCH");
  });
  it("fails closed to a human when the registry is unreachable", async () => {
    const r = await checkNearRecipient("alice.near", { views: down, brands: index() });
    expect(r.verdict).toBe("WARN");
    expect(r.reasons[0].code).toBe("REGISTRY_UNAVAILABLE");
  });
  it("folds ASCII confusables", () => {
    expect(fold("ref-f1nance")).toBe(fold("ref-finance"));
    expect(fold("rnetapool")).toBe(fold("metapool"));
    expect(lookalikeOf("v2.ref-finance.near", index())).toBeUndefined();
    expect(lookalikeOf("ref-flnance.near", index())?.how).toBe("confusable");
  });
});

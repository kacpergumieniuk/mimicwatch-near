import { describe, expect, it } from "vitest";
import { analyzeAccount, analyzeScan } from "../src/near/analyze.ts";
import type { RawScan } from "../src/near/collect.ts";
import { index, NOW, raw, tx } from "./fixtures.ts";

const score = (r: ReturnType<typeof raw>, found = new Map<string, string[]>()) => analyzeAccount(r, NOW, index(), found);

describe("account scoring", () => {
  it("a new close lookalike that collects money from several people is impersonation-likely", () => {
    const id = "ref-flnance.near";
    const r = raw(id, {}, {
      created: "2026-10-01T00:00:00Z",
      details: [
        tx("somebody.near", "near", "2026-10-01T00:00:00Z", undefined, "FunctionCall"),
        tx("alice.near", id, "2026-10-02T00:00:00Z", 50),
        tx("bob.near", id, "2026-10-03T00:00:00Z", 20),
        tx("carol.near", id, "2026-10-04T00:00:00Z", 5),
      ],
    });
    const f = score(r);
    expect(f.label).toBe("impersonation-likely");
    expect(["high", "critical"]).toContain(f.severity);
    expect(f.signals).toContain("RECEIVES_FROM_MANY");
    expect(f.facts.distinctSenders).toBe(3);
    expect(f.facts.inboundNear).toBe(75);
  });

  it("a token that copies the brand name is fake-token, critical when recent", () => {
    const r = raw("rhea-airdrop.near", { fuzzer: "lure-suffix" }, { view: { amount: "0", locked: "0", code_hash: "ABC", storage_usage: 1 }, ft: { name: "Rhea Airdrop", symbol: "RHEA", decimals: 18 } });
    const f = score(r);
    expect(f.label).toBe("fake-token");
    expect(f.severity).toBe("critical");
    expect(f.signals).toContain("FT_COPIES_BRAND");
  });

  it("an account created by the brand is brand-owned (info), never a threat", () => {
    const f = score(raw("ref-flnance.near", {}, { creator: "ref-finance.near" }));
    expect(f.label).toBe("brand-owned");
    expect(f.severity).toBe("info");
  });

  it("an account sharing a full-access key with an official account is brand-owned", () => {
    const f = score(raw("ref-flnance.near", {}, { keyAccounts: { "ed25519:K1": ["v2.ref-finance.near"] } }));
    expect(f.label).toBe("brand-owned");
  });

  it("dust transfers (address poisoning) do not count as victims", () => {
    const id = "v2-ref-finance.near";
    const r = raw(id, { fuzzer: "fake-sub-account" }, {
      created: "2024-11-28T00:00:00Z",
      details: [
        tx("x.near", "near", "2024-11-28T00:00:00Z", undefined, "FunctionCall"),
        tx("e589a.near", id, "2024-11-28T01:00:00Z", 980),
        tx("e589b.near", id, "2024-11-28T02:00:00Z", 0.001),
        tx("cbacb.near", id, "2024-11-30T02:00:00Z", 0.001),
      ],
    });
    const f = score(r);
    expect(f.facts.distinctSenders).toBe(1);
    expect(f.facts.dustTransfers).toBe(2);
    expect(f.signals).not.toContain("RECEIVES_FROM_MANY");
    expect(f.evidence.join(" ")).toMatch(/address poisoning/);
  });

  it("flags money that was forwarded on within minutes", () => {
    const id = "ref-flnance.near";
    const r = raw(id, {}, {
      created: "2024-02-08T13:06:00Z",
      details: [
        tx("meteor-gastank.near", "near", "2024-02-08T13:06:00Z", undefined, "FunctionCall"),
        tx("memiko.near", id, "2024-02-08T13:13:00Z", 629),
        tx(id, "cea9.near", "2024-02-08T13:14:00Z", 628.9),
      ],
    });
    const f = score(r);
    expect(f.facts.forwarded).toEqual({ inNear: 629, outNear: 628.9, minutes: 1, to: "cea9.near" });
    expect(f.signals).toContain("FORWARDED_QUICKLY");
    expect(f.label).toBe("lookalike-dormant");
    expect(f.severity).toBe("medium");
  });

  it("an account without keys or contract is locked and harmless", () => {
    const f = score(raw("reffinance.near", { fuzzer: "separator" }, { keys: [] }));
    expect(f.signals).toContain("LOCKED");
    expect(f.severity).toBe("info");
  });

  it("an old typo account with a long unrelated history is likely unrelated", () => {
    const f = score(raw("ref-financx.near", { fuzzer: "replacement" }, { created: "2021-01-01T00:00:00Z", txsCount: 2000, recent: [{ hash: "h", ts: String(BigInt(NOW - 86_400_000) * 1_000_000n), signer: true, receiver: false, fn: true }] }));
    expect(f.label).toBe("likely-unrelated");
    expect(f.severity).toBe("low");
  });

  it("same-operator clusters raise the score", () => {
    const a = raw("ref-flnance.near", {}, { keyAccounts: { "ed25519:K1": ["rhealab-claim.near"] } });
    const found = new Map([["ref-flnance.near", ["ed25519:K1"]], ["rhealab-claim.near", ["ed25519:K1"]]]);
    const f = score(a, found);
    expect(f.facts.sameOperator).toEqual(["rhealab-claim.near"]);
    expect(f.signals).toContain("SAME_OPERATOR");
    expect(f.label).toBe("impersonation-likely");
  });

  it("is deterministic and sorted by severity", () => {
    const scan: RawScan = {
      tool: "t", scannedAt: new Date(NOW).toISOString(), network: "mainnet", brands: 1, candidates: 10, byFuzzer: {}, subAccountProbes: 0, rpcRequests: 0, indexerRequests: 0, endpoints: [], errors: [],
      found: [raw("reffinance.near", { fuzzer: "separator" }, { keys: [] }), raw("rhea-airdrop.near", { fuzzer: "lure-suffix" }, { view: { amount: "0", locked: "0", code_hash: "ABC", storage_usage: 1 }, ft: { name: "RHEA", symbol: "RHEA" } }), raw("v2.ref-finance.near", {})],
    };
    const a = analyzeScan(scan, index());
    const b = analyzeScan(JSON.parse(JSON.stringify(scan)), index());
    expect(a).toEqual(b);
    expect(a.findings.map((f) => f.id)).toEqual(["rhea-airdrop.near", "reffinance.near"]);
    expect(a.counts["fake-token"]).toBe(1);
  });
});

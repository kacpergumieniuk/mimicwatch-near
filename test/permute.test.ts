import { describe, expect, it } from "vitest";
import { isValidAccountId } from "../src/near/account-id.ts";
import { allCandidates, fakeSubAccounts, permuteStem, subAccountProbes } from "../src/near/permute.ts";
import { BRANDS, index } from "./fixtures.ts";

describe("NEAR lookalike generator", () => {
  const c = permuteStem("ref-finance", "near", "rhea");
  const ids = new Map(c.map((x) => [x.id, x.fuzzer]));

  it("only produces valid NEAR account ids (ASCII, no Unicode homoglyphs)", () => {
    expect(c.length).toBeGreaterThan(200);
    for (const x of c) {
      expect(isValidAccountId(x.id), x.id).toBe(true);
      expect(x.id).toMatch(/^[a-z0-9._-]+$/);
    }
  });
  it("covers the expected tricks", () => {
    expect(ids.get("ref-flnance.near")).toBe("homoglyph");
    expect(ids.get("ref-f1nance.near")).toBe("homoglyph");
    expect(ids.get("ref-financ3.near")).toBe("digit-swap");
    expect(ids.get("ref-fnance.near")).toBe("omission");
    expect(ids.get("ref-finnance.near")).toBe("repetition");
    expect(ids.get("ref-fniance.near")).toBe("transposition");
    expect(ids.get("reffinance.near")).toBe("separator");
    expect(ids.get("ref_finance.near")).toBe("separator");
    expect(ids.get("ref.finance.near")).toBe("separator");
    expect(ids.get("finance-ref.near")).toBe("swapped-segments");
    expect(ids.get("ref-finance-official.near")).toBe("lure-suffix");
    expect(ids.get("ref-finance-support.near")).toBe("lure-suffix");
    expect(ids.get("ref-finance-claim.near")).toBe("lure-suffix");
    expect(ids.get("ref-finance-airdrop.near")).toBe("lure-suffix");
    expect(ids.get("claim-ref-finance.near")).toBe("lure-prefix");
    expect(ids.has("ref-finance.near")).toBe(false);
  });
  it("keeps short stems to the strong forms", () => {
    const short = permuteStem("rhea", "near", "rhea");
    expect(short.some((x) => x.fuzzer === "replacement" || x.fuzzer === "insertion")).toBe(false);
    expect(short.some((x) => x.id === "rhea-airdrop.near")).toBe(true);
  });
  it("noTypos drops keyboard typos", () => {
    const n = permuteStem("ref-finance", "near", "rhea", { noTypos: true });
    expect(n.some((x) => ["replacement", "insertion", "addition"].includes(x.fuzzer))).toBe(false);
    expect(n.length).toBeLessThan(c.length);
  });
  it("builds fake sub-accounts", () => {
    const f = fakeSubAccounts("v2.ref-finance.near", "rhea").map((x) => x.id);
    expect(f).toContain("v2-ref-finance.near");
    expect(f).toContain("v2ref-finance.near");
    expect(f).toContain("v2-ref-finance.tg");
    const t = fakeSubAccounts("token.sweat", "sweat").map((x) => x.id);
    expect(t).toContain("token-sweat.near");
  });
  it("probes official sub-account names under a found lookalike", () => {
    const p = subAccountProbes("ref-flnance.near", BRANDS[0], "ref-finance.near").map((x) => x.id);
    expect(p).toContain("v2.ref-flnance.near");
    expect(p).toContain("claim.ref-flnance.near");
  });
  it("never proposes an official account or anything under an official root", () => {
    const all = allCandidates(index());
    const idx = index();
    expect(all.length).toBeGreaterThan(500);
    for (const x of all) expect(idx.ownerOfAccount(x.id), x.id).toBeUndefined();
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
    expect(all.find((x) => x.id === "v2-ref-finance.near")?.fuzzer).toBe("fake-sub-account");
  });
});

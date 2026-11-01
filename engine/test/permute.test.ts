import { describe, expect, it } from "vitest";
import { isValidLabel, labelFuzz, permute, toAscii } from "../src/domains/permute.ts";

describe("permute", () => {
  const perms = permute("uniswap.org");
  const byDomain = new Map(perms.map((p) => [p.domain, p]));

  it("never returns the official domain and never duplicates", () => {
    expect(byDomain.has("uniswap.org")).toBe(false);
    expect(new Set(perms.map((p) => p.domain)).size).toBe(perms.length);
  });

  it("only returns valid ASCII hostnames", () => {
    for (const p of perms) {
      expect(p.domain).toMatch(/^[a-z0-9.-]+$/);
      for (const l of p.domain.split(".")) expect(isValidLabel(l)).toBe(true);
    }
  });

  it.each([
    ["uinswap.org", "transposition"],
    ["unswap.org", "omission"],
    ["uniiswap.org", "repetition"],
    ["uni-swap.org", "hyphenation"],
    ["uniswap.xyz", "tld-swap"],
    ["uniswap-claim.com", "dictionary"],
    ["airdrop-uniswap.xyz", "dictionary"],
    ["uniswaps.org", "addition"],
    ["unlswap.org", "homoglyph"],
    ["uniswop.org", "vowel-swap"],
  ])("generates %s (%s)", (domain, fuzzer) => {
    expect(byDomain.get(domain)?.fuzzer).toBe(fuzzer);
  });

  it("generates IDN homoglyphs as punycode with the Unicode form kept for display", () => {
    const cyr = perms.find((p) => p.unicode === "uniswаp.org"); // Cyrillic а
    expect(cyr?.domain.startsWith("xn--")).toBe(true);
    expect(cyr?.fuzzer).toBe("homoglyph");
    const full = perms.find((p) => p.unicode === "unіѕwар.org"); // whole-label Cyrillic swap
    expect(full?.domain).toBe(toAscii("unіѕwар.org"));
  });

  it("does ASCII multi-char glyph swaps (m -> rn)", () => {
    const m = permute("metamask.io");
    expect(m.some((p) => p.domain === "rnetamask.io")).toBe(true);
  });

  it("produces bitsquats that differ by one bit", () => {
    const bits = [...labelFuzz("aero").entries()].filter(([, f]) => f === "bitsquatting").map(([l]) => l);
    expect(bits).toContain("cero"); // a (0x61) ^ 0x02 = c (0x63)
    for (const b of bits) expect(b).toMatch(/^[a-z0-9-]+$/);
  });

  it("can skip fuzzers and works on multi-part suffixes", () => {
    const p = permute("example.co.uk", { skip: ["bitsquatting", "dictionary"] });
    expect(p.some((x) => x.fuzzer === "bitsquatting" || x.fuzzer === "dictionary")).toBe(false);
    expect(p.some((x) => x.domain === "exmaple.co.uk")).toBe(true);
    expect(p.every((x) => x.base === "example.co.uk")).toBe(true);
  });

  it("rejects non-registrable input", () => {
    expect(() => permute("localhost")).toThrow();
  });

  it("validates labels", () => {
    expect(isValidLabel("uni-swap")).toBe(true);
    expect(isValidLabel("-uni")).toBe(false);
    expect(isValidLabel("uni-")).toBe(false);
    expect(isValidLabel("ab--c")).toBe(false);
    expect(isValidLabel("xn--80ak6aa92e")).toBe(true);
  });
});

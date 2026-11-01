import { readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { BrandError, isOfficialHost, isOfficialToken, loadBrand, parseBrand } from "../src/brand.ts";
import { UNISWAP } from "./helpers.ts";

describe("brand profile", () => {
  it("normalises and defaults", () => {
    const b = parseBrand({ name: " X ", officialDomains: ["X-Proj.xyz"], keywords: ["XProj"], officialSocials: {} });
    expect(b.officialDomains).toEqual(["x-proj.xyz"]);
    expect(b.keywords).toEqual(["xproj"]);
    expect(b.referenceUrl).toBe("https://x-proj.xyz");
    expect(b.tokenChains).toEqual(["base"]);
  });

  it("reports every problem at once", () => {
    try {
      parseBrand({ officialDomains: ["not a domain"], keywords: ["ab"], officialTokens: [{ chain: "solana", address: "x" }] });
      throw new Error("should fail");
    } catch (e) {
      expect(e).toBeInstanceOf(BrandError);
      const m = (e as Error).message;
      for (const s of ["name", "invalid domain", "too short", "chain", "address", "symbol"]) expect(m).toContain(s);
    }
  });

  it("recognises official hosts and tokens", () => {
    expect(isOfficialHost(UNISWAP, "app.uniswap.org")).toBe(true);
    expect(isOfficialHost(UNISWAP, "uniswap.org.evil.com")).toBe(false);
    expect(isOfficialToken(UNISWAP, "base", "0xc3de830ea07524a0761646a6a4e4be0e114a3c83")).toBe(true);
    expect(isOfficialToken(UNISWAP, "ethereum", "0xc3de830ea07524a0761646a6a4e4be0e114a3c83")).toBe(false);
  });

  it("all shipped brand files are valid", async () => {
    for (const f of await readdir("brands")) if (f.endsWith(".json")) await expect(loadBrand(`brands/${f}`)).resolves.toBeTruthy();
  });
});

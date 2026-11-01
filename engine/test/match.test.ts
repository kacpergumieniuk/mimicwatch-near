import { describe, expect, it } from "vitest";
import { matchToken } from "../src/tokens/match.ts";
import { AERO, UNISWAP } from "./helpers.ts";

describe("matchToken", () => {
  it.each([
    ["Uniswap", "UNI", "clone"],
    ["Uniswap V4 Airdrop", "UNIV4", "brand-name"],
    ["Some Coin", "UNISWAP", "brand-name"],
    ["Unicorn Fart", "UNI", "same-symbol"],
    ["Unlswap", "ULS", "lookalike-name"],
    ["Uniswapp", "X", "brand-name"],
  ])("%s / %s -> %s", (name, symbol, kind) => {
    expect(matchToken(UNISWAP, name, symbol)?.kind).toBe(kind);
  });

  it("does not match unrelated tokens or the short 'uni' substring", () => {
    expect(matchToken(UNISWAP, "Unicorn", "CORN")).toBeNull();
    expect(matchToken(UNISWAP, "Community", "UNITY")).toBeNull();
    expect(matchToken(UNISWAP, undefined, undefined)).toBeNull();
  });

  it("catches homoglyph names and boosts them", () => {
    const m = matchToken(UNISWAP, "Uniswаp", "UNI"); // Cyrillic а
    expect(m?.kind).toBe("clone");
    expect(m?.homoglyph).toBe(true);
    expect(m?.score).toBe(100);
  });

  it("symbol variants only for official symbols of 4+ chars", () => {
    expect(matchToken(AERO, "Turbo", "AEROX")?.kind).toBe("symbol-variant");
    expect(matchToken(UNISWAP, "Turbo", "UNIX")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { defang, escapeHtml, foldConfusables, leetForms, levenshtein, ratio, squash, textSimilarity, titleSimilarity } from "../src/util/text.ts";

describe("text helpers", () => {
  it("levenshtein and ratio", () => {
    expect(levenshtein("uniswap", "unlswap")).toBe(1);
    expect(levenshtein("", "abc")).toBe(3);
    expect(ratio("abc", "abc")).toBe(1);
  });

  it("folds confusables (real title seen on aerodrom.finance)", () => {
    expect(foldConfusables("Аеrоdrоmе Fіnаnсе")).toBe("aerodrome finance");
    expect(squash("U.N.I-Swap")).toBe("uniswap");
    expect(squash("UN1SWAP", true)).toBe("unlswap");
    expect(squash("UN1SWAP")).toBe("un1swap");
    expect(leetForms("un1swap")).toEqual(["unlswap", "uniswap"]);
  });

  it("title similarity treats 'official title + slogan' as a strong match", () => {
    expect(titleSimilarity("Aerodrome Finance - The Future of DeFi", "Aerodrome Finance")).toBeGreaterThanOrEqual(0.8);
    expect(titleSimilarity("Aero AI Aviation Platform", "Aerodrome Finance")).toBeLessThan(0.4);
  });

  it("text similarity via shingles", () => {
    const a = "swap tokens instantly on the most liquid exchange on base with low fees";
    expect(textSimilarity(a, a)).toBe(1);
    expect(textSimilarity(a, "buy shoes online with free delivery to your door today")).toBe(0);
  });

  it("escapes HTML and defangs URLs", () => {
    expect(escapeHtml(`<img src=x onerror="a">`)).toBe("&lt;img src=x onerror=&quot;a&quot;&gt;");
    expect(defang("https://evil.com/x")).toBe("hxxps://evil[.]com/x");
  });
});

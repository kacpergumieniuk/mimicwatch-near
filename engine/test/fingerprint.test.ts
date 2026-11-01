import { describe, expect, it } from "vitest";
import { httpFingerprint } from "../src/pages/fetch.ts";
import {
  brandStats,
  compare,
  detectSignals,
  extractFaviconHref,
  extractScriptSrcs,
  extractText,
  extractTitle,
  type Fingerprint,
} from "../src/pages/fingerprint.ts";
import { mockFetch } from "./helpers.ts";

const PHISH = `<!doctype html><html><head><title>Uniswap Interface | Claim UNI</title>
<link rel="shortcut icon" href="/static/fav.png"><script src="/js/app.js"></script><script src="https://www.googletagmanager.com/gtag.js"></script>
<style>.x{color:red}</style></head><body><h1>Claim your Uniswap airdrop</h1><p>You are eligible! Connect Wallet to continue.</p>
<p>Or enter your 12-word recovery phrase to restore access.</p><script>window.ethereum.request({method:"eth_requestAccounts"})</script></body></html>`;

describe("fingerprint extraction", () => {
  it("extracts title, text, favicon and scripts", () => {
    expect(extractTitle(PHISH)).toBe("Uniswap Interface | Claim UNI");
    expect(extractText(PHISH)).toContain("Claim your Uniswap airdrop");
    expect(extractText(PHISH)).not.toContain("color:red");
    expect(extractText(PHISH)).not.toContain("eth_requestAccounts");
    expect(extractFaviconHref(PHISH)).toBe("/static/fav.png");
    expect(extractScriptSrcs(PHISH)).toEqual(["/js/app.js", "https://www.googletagmanager.com/gtag.js"]);
  });

  it("detects wallet prompts, seed-phrase requests and lures", () => {
    const s = detectSignals(PHISH);
    expect(s.walletPrompt.length).toBeGreaterThan(0);
    expect(s.seedPhrase.join(" ")).toMatch(/recovery phrase|12-word/i);
    expect(s.secretForm).toBe(false);
    expect(detectSignals('<textarea name="mnemonic"></textarea>').secretForm).toBe(true);
    expect(s.lure.join(" ")).toMatch(/claim|airdrop|eligib/i);
    expect(s.cryptoContext.length).toBeGreaterThan(0);
  });

  it("detects drainer JS in fetched scripts, parked pages and phishing interstitials", () => {
    expect(detectSignals("<p>hi</p>", ["contract.setApprovalForAll(attacker,true)"]).drainerJs).toContain("setApprovalForAll");
    expect(detectSignals("<title>x</title><p>This domain is for sale! Buy this domain</p>").parked.length).toBeGreaterThan(0);
    expect(detectSignals("<title>Suspected Phishing | Cloudflare</title>").interstitial.length).toBe(1);
    expect(detectSignals("<p>Airport transfer services at the aerodrome</p>").cryptoContext).toEqual([]);
  });

  it("does not count the page's own hostname as a brand mention", () => {
    expect(brandStats("aerodrome.co.za", "Welcome to aerodrome.co.za", "aerodrome.co.za", ["aerodrome"])).toEqual({ brandMentions: 0, brandInTitle: false });
    expect(brandStats("Aerodrome Finance", "", "x.pages.dev", ["aerodrome"]).brandInTitle).toBe(true);
  });

  it("compares to the official fingerprint", () => {
    const base = { url: "", finalUrl: "", status: 200, scriptUrls: [], bytes: 0, brandMentions: 0, brandInTitle: false, renderedWith: "http" as const };
    const sig = detectSignals("");
    const off: Fingerprint = { ...base, title: "Uniswap Interface", text: "swap anytime anywhere the largest onchain marketplace", faviconSha256: "aa", signals: sig };
    const same = compare({ ...off }, off);
    expect(same.favicon).toBe(true);
    expect(same.overall).toBe(1);
    const other = compare({ ...off, title: "Bakery", text: "fresh bread daily", faviconSha256: "bb" }, off);
    expect(other.overall).toBeLessThan(0.1);
    expect(compare(off, undefined).overall).toBe(0);
  });
});

describe("httpFingerprint (mocked network)", () => {
  it("fetches the page, the favicon and same-page scripts, skipping analytics", async () => {
    const f = mockFetch({
      "https://uniswap-claim.xyz/": { body: PHISH, headers: { "content-type": "text/html" } },
      "https://uniswap-claim.xyz/static/fav.png": { body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) },
      "https://uniswap-claim.xyz/js/app.js": { body: "signer._signTypedData(domain,types,permit) // 0x000000000022D473030F116dDEE9F6B43aC78BA3" },
    });
    const fp = await httpFingerprint("https://uniswap-claim.xyz/", { keywords: ["uniswap"], fetchImpl: f.fetch });
    expect(fp.error).toBeUndefined();
    expect(fp.title).toBe("Uniswap Interface | Claim UNI");
    expect(fp.faviconSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fp.signals.drainerJs.join(" ")).toMatch(/0x000000000022d473030f116ddee9f6b43a/i);
    expect(fp.brandMentions).toBe(2);
    expect(f.calls.some((u) => u.includes("googletagmanager"))).toBe(false);
  });

  it("reports network errors instead of throwing", async () => {
    const f = mockFetch({});
    const fp = await httpFingerprint("https://down.example/", { keywords: ["x"], fetchImpl: f.fetch });
    expect(fp.error).toBeTruthy();
  });
});

describe("readCapped", () => {
  it("stops reading a body that drips forever", async () => {
    const { readCapped } = await import("../src/pages/fetch.ts");
    const stream = new ReadableStream<Uint8Array>({
      async pull(c) {
        await new Promise((r) => setTimeout(r, 50));
        c.enqueue(new Uint8Array([65]));
      },
    });
    const t0 = Date.now();
    const buf = await readCapped(new Response(stream), 1_000_000, 300);
    expect(Date.now() - t0).toBeLessThan(1_500);
    expect(buf.length).toBeGreaterThan(0);
  });
  it("caps the size", async () => {
    const { readCapped } = await import("../src/pages/fetch.ts");
    expect((await readCapped(new Response("x".repeat(5000)), 100)).length).toBe(100);
  });
});

import { describe, expect, it } from "vitest";
import { detectSignals, type Fingerprint } from "../src/pages/fingerprint.ts";
import { scoreDomain, scoreTokenFinding, severityOf, type DomainFacts } from "../src/scoring.ts";
import type { EngineResult } from "../src/tokens/engine.ts";
import { matchToken } from "../src/tokens/match.ts";
import { AERO, UNISWAP } from "./helpers.ts";

function page(html: string, over: Partial<Fingerprint> = {}): Fingerprint {
  const title = /<title>(.*?)<\/title>/.exec(html)?.[1] ?? "";
  return {
    url: "https://x/",
    finalUrl: "https://x/",
    status: 200,
    title,
    text: html.replace(/<[^>]+>/g, " "),
    scriptUrls: [],
    signals: detectSignals(html),
    brandMentions: (html.match(/uniswap|aerodrome/gi) ?? []).length,
    brandInTitle: /uniswap|aerodrome/i.test(title),
    bytes: html.length,
    renderedWith: "http",
    ...over,
  };
}

const facts = (over: Partial<DomainFacts>): DomainFacts => ({
  host: "uniswap-claim.xyz",
  fuzzer: "dictionary",
  sources: ["permutation"],
  live: true,
  registered: true,
  listedOn: [],
  redirectsToOfficial: false,
  brandName: "Uniswap",
  ...over,
});

describe("scoreDomain", () => {
  it("flags a brand page asking for a seed phrase as phishing (critical)", () => {
    const p = page("<title>Uniswap Claim</title><p>Uniswap airdrop. Connect Wallet. Enter your recovery phrase.</p><textarea></textarea>");
    const r = scoreDomain(facts({ page: p, similarity: { title: 0.5, text: 0.1, favicon: true, overall: 0.6 } }));
    expect(r.label).toBe("phishing-likely");
    expect(r.severity).toBe("critical");
    expect(r.alreadyBlocked).toBe(false);
    expect(r.evidence.join(" ")).toMatch(/Same favicon/);
  });

  it("a page that only mentions seed phrases (no form) is not treated as collecting them", () => {
    const p = page("<title>Uniswap guide</title><p>Uniswap swap guide. Never share your seed phrase with anyone.</p>");
    const r = scoreDomain(facts({ page: p }));
    expect(r.evidence.join(" ")).toMatch(/no input form seen/);
    expect(r.label).toBe("impersonation");
  });

  it("a third-party dApp that only mentions the brand next to a wallet button is impersonation, not phishing", () => {
    const p = page("<title>Robinhood Chain · LP PnL</title><p>Track your Uniswap LP positions and PnL. Connect Wallet</p>");
    const r = scoreDomain(facts({ host: "uniswap.yeeteora.xyz", fuzzer: undefined, sources: ["ct"], page: p }));
    expect(r.label).toBe("impersonation");
    const typo = scoreDomain(facts({ host: "uniswapv4.com", fuzzer: "dictionary", page: page("<title>Uniswap V4</title><p>Uniswap swap. Connect Wallet</p>") }));
    expect(typo.label).toBe("phishing-likely");
  });

  it("labels the brand word in a non-crypto business as a likely false positive", () => {
    const p = page("<title>Aerodrome Tech</title><p>Aerodrome lighting and runway maintenance services</p>");
    const r = scoreDomain(facts({ host: "aerodrometech.com", fuzzer: undefined, sources: ["ct"], page: p, brandName: "Aerodrome" }));
    expect(r.label).toBe("likely-false-positive");
    expect(r.severity === "low" || r.severity === "info").toBe(true);
    expect(r.evidence.join(" ")).toMatch(/unrelated business/);
  });

  it("bot challenges and redirect stubs are unknown content, not false positives", () => {
    const cf = scoreDomain(facts({ page: page("<title>CloudFlare - Verify that you are a human</title><p>checking</p>") }));
    expect(cf.label).toBe("lookalike-unknown-content");
    const stub = scoreDomain(facts({ page: page("<title>GO...</title><script>location.href='x'</script>") }));
    expect(stub.label).toBe("lookalike-unknown-content");
    expect(stub.evidence.join(" ")).toMatch(/content not visible/);
  });

  it("a typosquat that sends visitors to other crypto content is flagged, not dismissed", () => {
    const p = page("<title>Hyperliquid</title><p>Trade perps on Hyperliquid, the onchain order book. Connect your wallet to start trading tokens with deep liquidity on the exchange today.</p>");
    const r = scoreDomain(facts({ host: "uniswwap.org", fuzzer: "insertion", page: { ...p, brandMentions: 0, brandInTitle: false } }));
    expect(r.label).toBe("lookalike-other-crypto");
    expect(["low", "medium"]).toContain(r.severity);
    const blocked = scoreDomain(facts({ page: page("<title>Access Denied</title><p>You don't have permission</p>", { brandMentions: 0, brandInTitle: false }) }));
    expect(blocked.label).toBe("lookalike-unknown-content");
  });

  it("caps parked and not-live lookalikes at low", () => {
    const parked = scoreDomain(facts({ page: page("<title>uniswap-claim.xyz</title><p>This domain is for sale</p>", { brandMentions: 0, brandInTitle: false }) }));
    expect(scoreDomain(facts({ page: page("<title>UniSwap.app for sale | Spaceship.com</title>", { brandMentions: 1 }) })).label).toBe("parked");
    expect(parked.label).toBe("parked");
    expect(parked.severity).toBe("low");
    const dead = scoreDomain(facts({ live: false, page: undefined }));
    expect(dead.label).toBe("not-live");
    expect(["low", "info"]).toContain(dead.severity);
  });

  it("treats redirects to the official site and official nameservers as brand-owned", () => {
    expect(scoreDomain(facts({ redirectsToOfficial: true, page: page("<title>Uniswap</title>") })).label).toBe("brand-owned-redirect");
    const ns = scoreDomain(facts({ sameNsAsOfficial: true, page: page("<title>404</title>", { status: 404 }) }));
    expect(ns.label).toBe("brand-owned-redirect");
    expect(ns.severity).toBe("info");
  });

  it("marks blocklisted domains and phishing interstitials as already blocked", () => {
    const listed = scoreDomain(facts({ listedOn: ["metamask"], page: page("<title>404</title>", { status: 404 }) }));
    expect(listed.label).toBe("phishing-likely");
    expect(listed.alreadyBlocked).toBe(true);
    expect(listed.action).toMatch(/Already blocked/);
    const cf = scoreDomain(facts({ page: page("<title>Suspected Phishing | Cloudflare</title>", { status: 403 }) }));
    expect(cf.alreadyBlocked).toBe(true);
  });

  it("ignores wallet UI that belongs to a web3 profile platform", () => {
    const p = page("<title>aerodrome.sns | Web3 Profile on Solana</title><p>aerodrome profile. Connect Wallet</p>");
    const r = scoreDomain(facts({ host: "aerodrome.sol.site", fuzzer: undefined, sources: ["ct"], page: p, platformWalletUi: true, platform: "SNS profile (sol.site)" }));
    expect(r.label).not.toBe("phishing-likely");
  });

  it("copied official title on a free host is at least high impersonation", () => {
    const p = page("<title>Aerodrome Finance - The Future of DeFi</title><p>Aerodrome swap and liquidity on Base</p>");
    const r = scoreDomain(
      facts({ host: "aerodrome-x.pages.dev", fuzzer: undefined, sources: ["ct"], page: p, similarity: { title: 0.8, text: 0, favicon: false, overall: 0.28 } }),
    );
    expect(r.label).toBe("impersonation");
    expect(r.severity).toBe("high");
  });

  it("maps scores to severities", () => {
    expect([severityOf(85), severityOf(65), severityOf(45), severityOf(25), severityOf(5)]).toEqual(["critical", "high", "medium", "low", "info"]);
  });
});

const engine = (over: Partial<EngineResult>): EngineResult => ({
  verdict: "CAUTION",
  score: 60,
  summary: "x",
  liquidityUsd: 0,
  launchpad: null,
  reasons: [],
  ...over,
});

describe("scoreTokenFinding", () => {
  it("a liquid clone of UNI is high", () => {
    const m = matchToken(UNISWAP, "Uniswap", "UNI")!;
    const r = scoreTokenFinding({ match: m, engine: engine({ liquidityUsd: 25_000, verdict: "DANGER" }), brandName: "Uniswap" });
    expect(r.label).toBe("copycat-token");
    expect(r.severity === "high" || r.severity === "critical").toBe(true);
    expect(r.action).toMatch(/Warn the community/);
  });

  it("an illiquid copycat is only monitored, even a DANGER clone", () => {
    const m = matchToken(UNISWAP, "Uniswap Airdrop", "UNIDROP")!;
    const r = scoreTokenFinding({ match: m, engine: engine({ liquidityUsd: 3 }), brandName: "Uniswap" });
    expect(r.severity === "low" || r.severity === "medium").toBe(true);
    expect(r.action).toMatch(/^Monitor/);
    const clone = scoreTokenFinding({ match: matchToken(UNISWAP, "Uniswap", "UNI")!, engine: engine({ liquidityUsd: 0, verdict: "DANGER" }), brandName: "Uniswap" });
    expect(clone.severity).toBe("medium");
  });

  it("without an engine result the severity is capped at medium", () => {
    const r = scoreTokenFinding({ match: matchToken(UNISWAP, "Uniswap", "UNI")!, brandName: "Uniswap" });
    expect(r.severity).toBe("medium");
  });

  it("same ticker alone is capped at medium and flagged as a possible false positive", () => {
    const m = matchToken(AERO, "Aero Doge", "AERO")!;
    const r = scoreTokenFinding({ match: m, engine: engine({ liquidityUsd: 1e6 }), brandName: "Aerodrome" });
    expect(r.label).toBe("symbol-collision");
    expect(r.severity).toBe("medium");
    expect(r.evidence.join(" ")).toMatch(/false positive/);
  });

  it("notes Zora content coins", () => {
    const m = matchToken(UNISWAP, "uniswap is cool", "UNICOOL")!;
    const r = scoreTokenFinding({ match: m, engine: engine({ launchpad: "zora" }), brandName: "Uniswap" });
    expect(r.evidence.join(" ")).toMatch(/Zora content coin/);
  });
});

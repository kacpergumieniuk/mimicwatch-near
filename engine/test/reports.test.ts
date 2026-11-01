import { describe, expect, it } from "vitest";
import { DRAFT_BANNER, GSB_MAX, domainDrafts, tokenDrafts } from "../src/reports/drafts.ts";
import { renderHtml } from "../src/reports/html.ts";
import { renderDraftsMarkdown } from "../src/reports/markdown.ts";
import type { ScanResult } from "../src/scan.ts";
import type { DomainFinding, TokenFinding } from "../src/scoring.ts";
import { UNISWAP } from "./helpers.ts";

const finding = (over: Partial<DomainFinding> = {}): DomainFinding => ({
  kind: "domain",
  host: "uniswap-claim.xyz",
  sources: ["permutation", "ct"],
  fuzzer: "dictionary",
  dns: { domain: "uniswap-claim.xyz", registered: true, a: ["104.21.1.1"], aaaa: [], mx: [], ns: [] },
  page: {
    url: "https://uniswap-claim.xyz/",
    finalUrl: "https://uniswap-claim.xyz/",
    status: 200,
    title: `Uniswap <script>alert(1)</script>`,
    textSample: "",
    scriptUrls: [],
    signals: { walletPrompt: ["Connect Wallet"], seedPhrase: [], secretForm: false, lure: [], drainerJs: [], parked: [], cryptoContext: [], interstitial: [], challenge: [] },
    brandMentions: 3,
    brandInTitle: true,
    bytes: 1,
    renderedWith: "http",
  },
  listedOn: [],
  alreadyBlocked: false,
  score: 75,
  severity: "high",
  label: "phishing-likely",
  evidence: ["Brand name plus a phishing lure word", "Wallet-connect prompt/library: Connect Wallet"],
  action: "After client approval: file...",
  rdap: {
    domain: "uniswap-claim.xyz",
    registrar: "Example Registrar",
    abuse: { email: "abuse@registrar.example" },
    status: [],
    registered: "2026-10-28T00:00:00Z",
  },
  hosting: { ip: "104.21.1.1", org: "Cloudflare, Inc.", abuse: { email: "abuse@cloudflare.com", form: "https://abuse.cloudflare.com/" } },
  ...over,
});

describe("domain drafts", () => {
  const drafts = domainDrafts(UNISWAP, finding(), "2026-11-01");
  const by = (c: string) => drafts.find((d) => d.channel === c)!;

  it("covers registrar, host, Safe Browsing, Netcraft, MetaMask and ScamSniffer", () => {
    expect(drafts.map((d) => d.channel)).toEqual([
      "registrar-abuse",
      "host-abuse",
      "google-safe-browsing",
      "netcraft",
      "metamask-issue",
      "metamask-pr",
      "scamsniffer-issue",
    ]);
  });

  it("every draft is marked as not filed", () => {
    for (const d of drafts) expect(d.body.startsWith(DRAFT_BANNER)).toBe(true);
  });

  it("addresses the RDAP abuse contacts and defangs URLs in email bodies", () => {
    expect(by("registrar-abuse").to).toBe("abuse@registrar.example");
    expect(by("registrar-abuse").body).toContain("uniswap-claim[.]xyz");
    expect(by("registrar-abuse").body).not.toMatch(/https:\/\/uniswap-claim\.xyz/);
    expect(by("host-abuse").to).toBe("https://abuse.cloudflare.com/");
    expect(by("host-abuse").notes).toContain("Email alternative: abuse@cloudflare.com");
  });

  it("fills the verified form fields and respects the Safe Browsing 800-char limit", () => {
    const gsb = by("google-safe-browsing");
    expect(gsb.fields!["URL to report"]).toBe("https://uniswap-claim.xyz/");
    const long = domainDrafts(UNISWAP, finding({ evidence: Array(40).fill("x".repeat(60)) }), "2026-11-01");
    const g = long.find((d) => d.channel === "google-safe-browsing")!;
    expect(g.fields!["Additional details (max 800)"].length).toBeLessThanOrEqual(GSB_MAX);
    expect(by("metamask-issue").to).toContain("template=01-blocklist-addition.yaml");
    expect(by("metamask-pr").body).toContain("yarn add:blocklist uniswap-claim.xyz");
  });

  it("skips blocklists that already list the domain and registrar drafts for platform subdomains", () => {
    const d = domainDrafts(UNISWAP, finding({ listedOn: ["metamask", "scamsniffer"], alreadyBlocked: true }), "2026-11-01");
    expect(d.some((x) => x.channel.startsWith("metamask") || x.channel === "scamsniffer-issue")).toBe(false);
    const p = domainDrafts(UNISWAP, finding({ host: "uniswap-x.pages.dev", platform: "Cloudflare Pages" }), "2026-11-01");
    expect(p.some((x) => x.channel === "registrar-abuse")).toBe(false);
  });

  it("puts the strongest evidence first in the one-line rationale", async () => {
    const { shortRationale } = await import("../src/reports/drafts.ts");
    const r = shortRationale(UNISWAP, finding({ evidence: ["Hostname contains the brand name", "Brand named on the page (3x)", "Same favicon as the official site"] }));
    expect(r.indexOf("favicon")).toBeLessThan(r.indexOf("Brand named"));
    expect(r).not.toContain("Hostname contains");
  });

  it("falls back to ICANN lookup when RDAP had no abuse email", () => {
    const d = domainDrafts(UNISWAP, finding({ rdap: { domain: "x", abuse: {}, status: [] } }), "2026-11-01");
    expect(d[0].to).toMatch(/lookup\.icann\.org/);
  });
});

const token: TokenFinding = {
  kind: "token",
  chain: "base",
  address: "0x1111111111111111111111111111111111111111",
  name: "Uniswap",
  symbol: "UNI",
  firstBlock: 1,
  source: "uniswap-v4",
  match: { kind: "clone", score: 95, homoglyph: false, why: "symbol UNI and brand word" },
  score: 70,
  severity: "high",
  label: "copycat-token",
  evidence: ["Name/symbol match: clone"],
  action: "Warn",
  explorerUrl: "https://basescan.org/token/0x1111111111111111111111111111111111111111",
};

describe("token drafts", () => {
  it("warns with the official Base address and drafts explorer + ScamSniffer reports", () => {
    const d = tokenDrafts(UNISWAP, token, "2026-11-01");
    expect(d.map((x) => x.channel)).toEqual(["community-warning", "explorer-label", "scamsniffer-issue"]);
    expect(d[0].body).toContain("0xc3De830EA07524a0761646a6a4e4be0e114a3C83");
    expect(d[1].to).toBe("https://basescan.org/contactus");
  });
});

describe("HTML report", () => {
  const result: ScanResult = {
    brand: UNISWAP,
    startedAt: "2026-11-01T10:00:00.000Z",
    finishedAt: "2026-11-01T10:20:00.000Z",
    periodDays: 30,
    stats: { permutations: 1000, permutationsRegistered: 50, ctHosts: 10, nrdHits: 1, candidates: 2, pagesFetched: 2, pagesRendered: 1, tokensIndexed: { base: 5000 }, tokenMatches: 1 },
    coverage: { ct: [{ q: "uniswap%", rows: 10 }], nrd: [{ day: "2026-10-31", domains: 70000 }], tokens: [{ chain: "base", coveredDays: 30, head: 1, errors: [] }], blocklists: ["metamask"] },
    domains: [
      { ...finding(), drafts: domainDrafts(UNISWAP, finding(), "2026-11-01") },
      finding({ host: "uniswap.biz", label: "likely-false-positive", severity: "low", score: 20, evidence: ["No brand content"], alreadyBlocked: false }),
    ],
    tokens: [{ ...token, drafts: tokenDrafts(UNISWAP, token, "2026-11-01") }],
    errors: [],
  };
  const html = renderHtml(result, "/tmp/out");

  it("escapes attacker-controlled page titles", () => {
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("has the summary, sections, drafts, coverage and the no-filing statement", () => {
    expect(html).toContain("1 new high-risk finding".replace("1 new", "2 new"));
    expect(html).toContain("Needs a decision");
    expect(html).toContain("False positive (likely)");
    expect(html).toContain("Google Safe Browsing report");
    expect(html).toContain("WhoisDS");
    expect(html).toMatch(/Nothing in this report has been filed/);
  });

  it("writes drafts.md grouped by finding", () => {
    const md = renderDraftsMarkdown(result);
    expect(md).toContain("## uniswap-claim.xyz (high, phishing-likely, 75/100)");
    expect(md).toContain("## Token UNI");
    expect(md).toContain(DRAFT_BANNER);
  });
});

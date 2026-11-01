/** Findings model plus deterministic scoring: facts in, score / severity / label / action out. No I/O. */
import type { Chain } from "./brand.ts";
import type { ListName } from "./domains/blocklists.ts";
import type { DnsFacts } from "./domains/dns.ts";
import type { Fuzzer } from "./domains/permute.ts";
import type { Fingerprint, Similarity } from "./pages/fingerprint.ts";
import type { DomainRdap, IpRdap } from "./rdap.ts";
import type { Draft } from "./reports/drafts.ts";
import type { EngineResult } from "./tokens/engine.ts";
import type { TokenMatch } from "./tokens/match.ts";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export type DomainLabel =
  | "phishing-likely"
  | "impersonation"
  | "lookalike-unknown-content"
  | "lookalike-other-crypto"
  | "parked"
  | "not-live"
  | "brand-owned-redirect"
  | "likely-false-positive";

export type TokenLabel = "copycat-token" | "symbol-collision" | "weak-match";

export interface DomainFinding {
  kind: "domain";
  host: string;
  unicode?: string;
  sources: Array<"permutation" | "ct" | "nrd" | "manual">;
  fuzzer?: Fuzzer;
  ctFirstSeen?: string;
  ctIssuer?: string;
  nrdDate?: string;
  dns?: DnsFacts;
  page?: Omit<Fingerprint, "text"> & { textSample: string };
  similarity?: Similarity;
  listedOn: ListName[];
  /** On a wallet blocklist or the host already shows a phishing warning. Takedown is still useful; blocklist filing is not. */
  alreadyBlocked: boolean;
  platform?: string;
  score: number;
  severity: Severity;
  label: DomainLabel;
  evidence: string[];
  action: string;
  rdap?: DomainRdap;
  hosting?: IpRdap;
  drafts?: Draft[];
}

export interface TokenFinding {
  kind: "token";
  chain: Chain;
  address: string;
  name?: string;
  symbol?: string;
  firstBlock: number;
  source: string;
  match: TokenMatch;
  engine?: EngineResult;
  engineError?: string;
  score: number;
  severity: Severity;
  label: TokenLabel;
  evidence: string[];
  action: string;
  explorerUrl: string;
  drafts?: Draft[];
}

export function severityOf(score: number): Severity {
  return score >= 80 ? "critical" : score >= 60 ? "high" : score >= 40 ? "medium" : score >= 20 ? "low" : "info";
}

const cap = (s: Severity, max: Severity): Severity => (SEVERITY_ORDER.indexOf(s) < SEVERITY_ORDER.indexOf(max) ? max : s);
const floor = (s: Severity, min: Severity): Severity => (SEVERITY_ORDER.indexOf(s) > SEVERITY_ORDER.indexOf(min) ? min : s);

const TYPO_FUZZERS: Fuzzer[] = ["bitsquatting", "insertion", "omission", "repetition", "replacement", "transposition", "vowel-swap", "hyphenation", "addition", "plural"];
export const LURE_RE = /claim|airdrop|reward|migrat|support|connect|wallet|verify|validat|restore|recover|refund|compensat|unlock|giveaway|presale|secure|login|sync/;

export interface DomainFacts {
  host: string;
  fuzzer?: Fuzzer;
  sources: DomainFinding["sources"];
  live: boolean;
  registered: boolean;
  page?: Fingerprint;
  similarity?: Similarity;
  listedOn: ListName[];
  /** finalUrl host is an official domain */
  redirectsToOfficial: boolean;
  platform?: string;
  /** Platform renders its own wallet UI (sol.site, eth.limo): wallet prompts are not evidence there. */
  platformWalletUi?: boolean;
  /** Other lookalikes on the same nameserver pair (same DNS account). */
  clusterSize?: number;
  clusterNs?: string;
  /** Same nameservers as the official domain: most likely a defensive registration by the brand. */
  sameNsAsOfficial?: boolean;
  ctFirstSeen?: string;
  brandName: string;
}

export function scoreDomain(f: DomainFacts): Pick<DomainFinding, "score" | "severity" | "label" | "evidence" | "action" | "alreadyBlocked"> {
  const ev: string[] = [];
  let score = 0;

  // --- the name itself
  if (f.fuzzer === "homoglyph") {
    score += 30;
    ev.push("Homoglyph lookalike of the official domain");
  } else if (f.fuzzer && TYPO_FUZZERS.includes(f.fuzzer)) {
    score += 25;
    ev.push(`Typosquat (${f.fuzzer}) of the official domain`);
  } else if (f.fuzzer === "dictionary") {
    score += 25;
    ev.push("Brand name plus a phishing lure word");
  } else if (f.fuzzer === "tld-swap") {
    score += 20;
    ev.push("Official name on a different TLD");
  } else {
    score += 15;
    ev.push("Hostname contains the brand name");
  }
  if (f.fuzzer !== "dictionary" && LURE_RE.test(f.host)) {
    score += 10;
    ev.push("Hostname contains a lure word (claim/airdrop/support/...)");
  }
  if (f.sources.includes("ct") && f.ctFirstSeen) ev.push(`TLS certificate issued ${f.ctFirstSeen.slice(0, 10)} (Certificate Transparency)`);
  if (f.sources.includes("nrd")) ev.push("Newly registered domain (WhoisDS daily list)");
  if (f.sources.includes("manual")) ev.push("Added by hand (--hosts: reported by the client or found by an earlier scan)");
  if (f.platform) ev.push(`Hosted on ${f.platform} subdomain`);
  if (f.sameNsAsOfficial) ev.push("Same nameservers as the official domain: probably registered by the brand itself");
  else if (f.clusterSize && f.clusterSize >= 3) ev.push(`One of ${f.clusterSize} lookalikes on the same DNS account (${f.clusterNs}): a single operator`);

  // --- already blocklisted
  if (f.listedOn.length) {
    score += 25;
    ev.push(`Already on public wallet blocklist(s): ${f.listedOn.join(", ")}`);
  }

  // --- the page
  const p = f.page;
  const blockedView = !!p && !p.error && p.signals.challenge.length > 0;
  const thin =
    !!p && !p.error && p.text.length < 200 && p.brandMentions === 0 && !p.signals.parked.length && !p.signals.cryptoContext.length && !p.signals.walletPrompt.length;
  const pageOk = !!p && !p.error && p.status > 0 && p.status < 400 && !blockedView && !thin;
  const interstitial = !!p && !p.error && p.signals.interstitial.length > 0;
  if (interstitial) {
    score += 20;
    ev.push(`Host already shows a phishing warning instead of the site ("${p!.signals.interstitial[0]}")`);
  }
  let brandOnPage = false;
  let impersonating = false;
  let unrelatedUse = false;
  let otherCrypto = false;
  let strong = false;
  let walletish = false;
  let seed = false;
  let parked = false;
  const sim = f.similarity;
  if (p && pageOk && !interstitial) {
    if (sim) {
      score += Math.round(sim.overall * 35);
      if (sim.favicon) ev.push("Same favicon as the official site");
      if (sim.title >= 0.5) ev.push(`Page title resembles the official title (${Math.round(sim.title * 100)}%)`);
      if (sim.text >= 0.2) ev.push(`Page text overlaps the official site (${Math.round(sim.text * 100)}% shingles)`);
    }
    brandOnPage = p.brandMentions > 0;
    const crypto = p.signals.cryptoContext.length > 0;
    walletish = !f.platformWalletUi && (p.signals.walletPrompt.length > 0 || p.signals.drainerJs.length > 0);
    if (f.platformWalletUi && p.signals.walletPrompt.length) ev.push("Wallet UI belongs to the hosting platform, not counted");
    impersonating = (brandOnPage && (crypto || walletish)) || (sim?.overall ?? 0) >= 0.3 || !!sim?.favicon;
    unrelatedUse = brandOnPage && !crypto && !walletish && !impersonating;
    // Posing as the brand, not just mentioning it (third-party dApps and blogs mention brands all the time).
    const lookalikeName = !!f.fuzzer || !!f.platform;
    strong = !!sim?.favicon || (sim?.title ?? 0) >= 0.5 || (sim?.text ?? 0) >= 0.2 || (p.brandInTitle && lookalikeName);
    otherCrypto = !impersonating && (crypto || walletish);
    if (otherCrypto) {
      score += 10;
      ev.push(`Lookalike of your domain serving other crypto content (${p.signals.cryptoContext.slice(0, 3).join(", ") || "wallet UI"})${p.finalUrl && !p.finalUrl.includes(f.host) ? `, ends at ${p.finalUrl.slice(0, 80)}` : ""}`);
    }
    if (impersonating && brandOnPage) {
      score += 10;
      ev.push(`Brand named on the page (${p.brandMentions}x)${p.brandInTitle ? ", including the title" : ""}`);
      if (p.brandInTitle) score += 10;
    }
    if (p.signals.walletPrompt.length && !f.platformWalletUi) {
      score += impersonating ? 12 : 3;
      ev.push(`Wallet-connect prompt/library: ${p.signals.walletPrompt.slice(0, 3).join(", ")}`);
    }
    if (p.signals.seedPhrase.length && p.signals.secretForm && (impersonating || walletish)) {
      seed = true;
      score += 25;
      ev.push(`Asks for secrets in a form: ${p.signals.seedPhrase.slice(0, 3).join(", ")}`);
    } else if (p.signals.seedPhrase.length && impersonating) {
      ev.push(`Mentions ${p.signals.seedPhrase.slice(0, 2).join(", ")} (no input form seen)`);
    }
    if (p.signals.drainerJs.length) {
      score += impersonating ? 10 : 3;
      ev.push(`Drainer-style JS: ${p.signals.drainerJs.slice(0, 3).join(", ")}`);
    }
    if (p.signals.lure.length && impersonating) {
      score += 5;
      ev.push(`Lure text: ${p.signals.lure.slice(0, 3).join(", ")}`);
    }
    parked = p.signals.parked.length > 0 && !walletish && !seed;
    if (parked) ev.push("Parked / for-sale page");
    if (unrelatedUse) ev.push(`Brand word used without any crypto context (${p.brandMentions}x): probably an unrelated business`);
  } else if (p?.error) ev.push(`Page not reachable: ${p.error.slice(0, 80)}`);
  else if (blockedView && !interstitial) ev.push(`Bot challenge or redirect stub ("${p!.signals.challenge[0]}"): real content not visible`);
  else if (thin && !interstitial) ev.push(`Almost empty page (${p!.text.length} chars of text, title "${p!.title.slice(0, 40)}"): content not visible`);
  else if (p && !interstitial) ev.push(`Page returned HTTP ${p.status}`);

  score = Math.max(0, Math.min(100, score));

  const alreadyBlocked = f.listedOn.length > 0 || interstitial;
  let label: DomainLabel;
  if (f.redirectsToOfficial || (f.sameNsAsOfficial && !alreadyBlocked)) label = "brand-owned-redirect";
  else if (!f.live) label = "not-live";
  else if (seed || alreadyBlocked || (impersonating && strong && walletish)) label = "phishing-likely";
  else if (parked) label = "parked";
  else if (!pageOk) label = "lookalike-unknown-content";
  else if (impersonating) label = "impersonation";
  else if (otherCrypto) label = "lookalike-other-crypto";
  else label = "likely-false-positive";

  let severity = severityOf(score);
  switch (label) {
    case "brand-owned-redirect":
      score = Math.min(score, 10);
      severity = "info";
      if (f.redirectsToOfficial) ev.push("Redirects to the official site (probably a defensive registration by the brand)");
      break;
    case "not-live":
      severity = cap(severity, "low");
      break;
    case "parked":
      severity = cap(severity, "low");
      break;
    case "likely-false-positive":
      severity = cap(severity, "low");
      if (!unrelatedUse) ev.push("No brand content found on the page: probably unrelated (false positive)");
      break;
    case "impersonation":
      severity = floor(severity, p?.brandInTitle && (sim?.title ?? 0) >= 0.8 ? "high" : "medium");
      break;
    case "phishing-likely":
      severity = floor(severity, "high");
      break;
    case "lookalike-unknown-content":
      severity = cap(severity, "medium");
      break;
    case "lookalike-other-crypto":
      severity = cap(floor(severity, "low"), "medium");
      break;
  }

  const ACTION: Record<DomainLabel, string> = {
    "phishing-likely": alreadyBlocked
      ? `Already blocked (${[...f.listedOn, ...(interstitial ? ["host warning page"] : [])].join(" + ")}). After client approval: file registrar and host abuse reports so the domain itself goes away (drafts attached).`
      : "After client approval: file registrar + host abuse reports, Google Safe Browsing / Netcraft, and wallet blocklist submissions (drafts attached).",
    impersonation: "Review the screenshot. If it impersonates the brand, file registrar + host reports (drafts attached).",
    "lookalike-unknown-content": "Re-check next scan; the content was not visible to us (error, bot wall or empty page).",
    "lookalike-other-crypto":
      "Review: traffic for a lookalike of your name goes to other crypto content (a competitor, an affiliate, or a phishing kit for another brand). Report if it misleads your users.",
    parked: "Monitor. Consider buying it defensively or a UDRP if it turns active.",
    "not-live": "Monitor (registered, no website). Consider defensive registration.",
    "brand-owned-redirect": "No action. Confirm the client owns this domain and add it to the allowlist.",
    "likely-false-positive": "No action (labelled false positive).",
  };
  return { score, severity, label, evidence: ev, action: ACTION[label], alreadyBlocked };
}

export interface TokenFacts {
  match: TokenMatch;
  engine?: EngineResult;
  launchpadHint?: string;
  brandName: string;
  officialRef?: string;
}

export function scoreTokenFinding(f: TokenFacts): Pick<TokenFinding, "score" | "severity" | "label" | "evidence" | "action"> {
  const ev = [`Name/symbol match: ${f.match.why}`];
  let score = Math.round(f.match.score * 0.6);
  const e = f.engine;
  const liq = e?.liquidityUsd ?? 0;
  const liquid = !!e && liq >= 1_000;
  if (e) {
    if (liq >= 10_000) {
      score += 25;
      ev.push(`Tradeable with ~$${Math.round(liq).toLocaleString("en-US")} liquidity: people can buy it by mistake`);
    } else if (liq >= 1_000) {
      score += 15;
      ev.push(`Tradeable with ~$${Math.round(liq).toLocaleString("en-US")} liquidity`);
    } else {
      score -= 10;
      ev.push(`Little or no liquidity (${e.liquidityUsd === null ? "unpriced" : `~$${Math.round(liq)}`})`);
    }
    ev.push(`Canisell verdict ${e.verdict} (${e.score}/100): ${e.summary}`);
    if (e.verdict === "DANGER" && liquid) score += 5;
    if (e.launchpad) ev.push(`Launched via ${e.launchpad}`);
  }
  score = Math.max(0, Math.min(100, score));
  const label: TokenLabel =
    f.match.kind === "clone" || f.match.kind === "brand-name" || f.match.homoglyph
      ? "copycat-token"
      : f.match.kind === "same-symbol"
        ? "symbol-collision"
        : "weak-match";
  let severity = severityOf(score);
  // High needs evidence that someone can actually buy it.
  if (!liquid) severity = cap(severity, "medium");
  if (label === "weak-match") severity = cap(severity, "low");
  if (label === "symbol-collision") {
    severity = cap(severity, "medium");
    ev.push("Same ticker only: may be an unrelated project (possible false positive)");
  }
  if (e?.launchpad === "zora") ev.push("Zora content coin: often a fan post rather than a scam, review before reporting");
  const action =
    label === "copycat-token" && liquid
      ? `Warn the community with the official address${f.officialRef ? ` (${f.officialRef})` : ""}; after approval, ask the explorer to label it and report it to ScamSniffer (drafts attached).`
      : label === "copycat-token"
        ? "Monitor: no meaningful liquidity yet. Warn the community if it gets liquidity or is promoted."
        : "Monitor; probably unrelated.";
  return { score, severity, label, evidence: ev, action };
}

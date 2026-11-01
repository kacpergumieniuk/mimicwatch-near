/** One brand scan: domains (permutations + CT + NRD), pages, tokens, scoring, drafts. Read-only towards suspects. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "tldts";
import { domainToUnicode } from "node:url";
import { isOfficialHost, isOfficialToken, type BrandProfile, type Chain } from "./brand.ts";
import { listedOn, loadBlocklists } from "./domains/blocklists.ts";
import { searchCt } from "./domains/ct.ts";
import { isLive, lookupMany, makeResolver, type DnsFacts, type DnsLike } from "./domains/dns.ts";
import { searchNrd } from "./domains/nrd.ts";
import { permute, type Fuzzer, type Permutation } from "./domains/permute.ts";
import { fingerprintHost, Renderer } from "./pages/fetch.ts";
import { compare, type Fingerprint } from "./pages/fingerprint.ts";
import { domainRdap, ipRdap, platformFor } from "./rdap.ts";
import { domainDrafts, tokenDrafts } from "./reports/drafts.ts";
import { scoreDomain, scoreTokenFinding, SEVERITY_ORDER, type DomainFinding, type Severity, type TokenFinding } from "./scoring.ts";
import { baseEngine, type EngineFn } from "./tokens/engine.ts";
import { buildTokenIndex, CHAIN_CONFIG, type TokenIndex } from "./tokens/index.ts";
import { matchToken } from "./tokens/match.ts";
import { mapLimit } from "./util/http.ts";

export interface ScanOptions {
  days: number;
  nrdDays: number;
  cacheDir: string;
  shotsDir: string;
  tokens: boolean;
  pages: boolean;
  screenshots: boolean;
  maxPages: number;
  maxRender: number;
  maxEngine: number;
  maxRdap: number;
  skipFuzzers: Fuzzer[];
  /** Extra hosts to check (client reports, earlier finds). Labelled "added by hand" in the report. */
  extraHosts?: string[];
  dnsServers?: string[];
  resolver?: DnsLike;
  engine?: EngineFn;
  log: (s: string) => void;
}

export interface ScanResult {
  brand: BrandProfile;
  startedAt: string;
  finishedAt: string;
  periodDays: number;
  official?: { url: string; title: string; faviconSha256?: string; error?: string };
  stats: {
    permutations: number;
    permutationsRegistered: number;
    ctHosts: number;
    nrdHits: number;
    candidates: number;
    pagesFetched: number;
    pagesRendered: number;
    tokensIndexed: Record<string, number>;
    tokenMatches: number;
  };
  coverage: {
    ct: Array<{ q: string; rows: number; error?: string }>;
    nrd: Array<{ day: string; domains: number; error?: string }>;
    tokens: Array<Pick<TokenIndex, "chain" | "coveredDays" | "head" | "errors">>;
    blocklists: string[];
  };
  domains: DomainFinding[];
  tokens: TokenFinding[];
  errors: string[];
}

const bySeverity = <T extends { severity: Severity; score: number }>(a: T, b: T) =>
  SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || b.score - a.score;

const trimPage = (p: Fingerprint): DomainFinding["page"] => {
  const { text, ...rest } = p;
  return { ...rest, textSample: text.slice(0, 300) };
};

interface Candidate {
  host: string;
  unicode?: string;
  fuzzer?: Fuzzer;
  sources: DomainFinding["sources"];
  ctFirstSeen?: string;
  ctIssuer?: string;
  nrdDate?: string;
}

export async function scanBrand(brand: BrandProfile, o: ScanOptions): Promise<ScanResult> {
  const startedAt = new Date();
  const log = o.log;
  const errors: string[] = [];
  const since = new Date(startedAt.getTime() - o.days * 86_400_000);
  const resolver = o.resolver ?? makeResolver(o.dnsServers);

  // ---------------------------------------------------------------- candidates
  const cands = new Map<string, Candidate>();
  const addCand = (c: Candidate) => {
    const h = c.host.toLowerCase();
    if (isOfficialHost(brand, h)) return;
    const prev = cands.get(h);
    if (!prev) cands.set(h, { ...c, host: h });
    else {
      prev.sources = [...new Set([...prev.sources, ...c.sources])];
      prev.fuzzer ??= c.fuzzer;
      prev.ctFirstSeen ??= c.ctFirstSeen;
      prev.ctIssuer ??= c.ctIssuer;
      prev.nrdDate ??= c.nrdDate;
    }
  };

  const perms = new Map<string, Permutation>();
  for (const d of brand.officialDomains) {
    const label = parse(d).domainWithoutSuffix ?? "";
    if (label.length < 4) continue;
    for (const p of permute(d, { skip: o.skipFuzzers })) if (!perms.has(p.domain) && !isOfficialHost(brand, p.domain)) perms.set(p.domain, p);
  }
  log(`[domains] ${perms.size} permutations of ${brand.officialDomains.join(", ")}; resolving`);
  const permDns = await lookupMany([...perms.keys()], resolver);
  const dnsByHost = new Map<string, DnsFacts>();
  for (const d of permDns)
    if (d.registered) {
      dnsByHost.set(d.domain, d);
      const p = perms.get(d.domain)!;
      addCand({ host: p.domain, unicode: p.unicode !== p.domain ? p.unicode : undefined, fuzzer: p.fuzzer, sources: ["permutation"] });
    }
  const permutationsRegistered = cands.size;
  log(`[domains] ${permutationsRegistered} permutations are registered`);

  log(`[ct] querying crt.sh for ${brand.keywords.join(", ")} (polite, slow)`);
  const ct = await searchCt(brand.keywords, since);
  for (const h of ct.hits) addCand({ host: h.host, sources: ["ct"], ctFirstSeen: h.firstSeen, ctIssuer: h.issuer });
  log(`[ct] ${ct.hits.length} hostnames with certificates since ${since.toISOString().slice(0, 10)}`);

  // Memory: every host earlier scans found for this brand is re-checked, so one flaky crt.sh answer does not drop it.
  const memFile = join(o.cacheDir, `seen-${brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`);
  let memory: Record<string, Candidate> = {};
  try {
    memory = JSON.parse(await readFile(memFile, "utf8"));
  } catch {}
  let remembered = 0;
  for (const c of Object.values(memory))
    if (!cands.has(c.host) && c.sources.some((x) => x !== "permutation")) {
      addCand(c);
      remembered++;
    }
  if (remembered) log(`[memory] re-checking ${remembered} hosts found by earlier scans`);
  for (const h of o.extraHosts ?? []) addCand({ host: h.trim().toLowerCase(), sources: ["manual"] });

  const nrd = o.nrdDays > 0 ? await searchNrd(brand.keywords, o.nrdDays, startedAt) : { hits: [], days: [] };
  for (const h of nrd.hits) addCand({ host: h.domain, sources: ["nrd"], nrdDate: h.registeredOn });
  log(`[nrd] ${nrd.hits.length} matches in ${nrd.days.filter((d) => !d.error).length} daily lists`);

  for (const c of cands.values()) memory[c.host] = { ...memory[c.host], ...c };
  await mkdir(o.cacheDir, { recursive: true });
  await writeFile(memFile, JSON.stringify(memory));

  const missing = [...cands.keys()].filter((h) => !dnsByHost.has(h));
  for (const d of await lookupMany(missing, resolver)) dnsByHost.set(d.domain, d);

  // Nameserver clusters: many lookalikes on one DNS account = one operator; official NS = brand-owned.
  const officialNs = new Set<string>();
  for (const d of await lookupMany(brand.officialDomains, resolver)) for (const n of d.ns) officialNs.add(n.toLowerCase());
  // Registrar/parking default nameservers are shared by millions of domains: they say nothing about the owner.
  const GENERIC_NS = /registrar-servers\.com|domaincontrol\.com|porkbun\.com|dns-parking\.com|hostinger|dnsowl\.com|name\.com$|namebrightdns|parkingcrew|sedoparking|bodis\.com|above\.com|afternic|dan\.com|ui-dns|nsone\.net$|googledomains|squarespacedns|wixdns|vercel-dns|netlify|digitalocean\.com|linode\.com|hichina|dnspod|cloudns\.net|freenom|1and1|ionos|ovh\.net|gandi\.net|namesilo|dynadot|epik\.com|spaceship|openprovider/i;
  const nsKey = (d?: DnsFacts) =>
    d?.ns.length && !d.ns.some((n) => GENERIC_NS.test(n.replace(/\.$/, ""))) ? [...d.ns].map((n) => n.toLowerCase()).sort().join(" + ") : "";
  const clusters = new Map<string, number>();
  for (const h of cands.keys()) {
    const k = nsKey(dnsByHost.get(h));
    if (k) clusters.set(k, (clusters.get(k) ?? 0) + 1);
  }

  const blocklists = await loadBlocklists(o.cacheDir);
  errors.push(...blocklists.errors);

  // ---------------------------------------------------------------- pages
  let official: Fingerprint | undefined;
  const renderer = o.screenshots ? new Renderer(o.shotsDir) : undefined;
  const canRender = renderer ? await renderer.start() : false;
  const keywords = brand.keywords;
  if (o.pages) {
    const ref = new URL(brand.referenceUrl!);
    official = await fingerprintHost(ref.host, { keywords });
    if (canRender && renderer) official = await renderer.render(official, keywords, `official-${ref.host}`);
    if (official.error) errors.push(`official site: ${official.error}`);
  }

  const infra = (dns?: DnsFacts) => {
    const k = nsKey(dns);
    return {
      clusterSize: k ? clusters.get(k) : undefined,
      clusterNs: k || undefined,
      sameNsAsOfficial: !!k && dns!.ns.every((n) => officialNs.has(n.toLowerCase())),
    };
  };
  const pre = [...cands.values()].map((c) => {
    const dns = dnsByHost.get(c.host);
    const listed = listedOn(blocklists, c.host);
    const platform = platformFor(c.host)?.name;
    const s = scoreDomain({
      ...infra(dns),
      platformWalletUi: platformFor(c.host)?.walletUi,
      host: c.host,
      fuzzer: c.fuzzer,
      sources: c.sources,
      live: !!dns && isLive(dns),
      registered: !!dns?.registered,
      listedOn: listed,
      redirectsToOfficial: false,
      platform,
      ctFirstSeen: c.ctFirstSeen,
      brandName: brand.name,
    });
    return { c, dns, listed, platform, pre: s.score };
  });
  // Only names that exist in DNS make it into the report.
  const existing = pre.filter((x) => x.dns && (x.dns.registered || isLive(x.dns)));
  // Page budget goes first to suspects nobody blocks yet and to fresh certificates.
  const rank = (x: (typeof pre)[number]) => x.pre - (x.listed.length ? 25 : 0) + (x.c.sources.includes("ct") ? 10 : 0);
  const live = existing.filter((x) => isLive(x.dns!)).sort((a, b) => rank(b) - rank(a));
  const toFetch = o.pages ? live.slice(0, o.maxPages) : [];
  log(`[pages] fetching ${toFetch.length} of ${live.length} live candidates (HTTP fingerprint)`);
  const pages = new Map<string, Fingerprint>();
  let fetched = 0;
  await mapLimit(toFetch, 6, async (x) => {
    pages.set(x.c.host, await fingerprintHost(x.c.host, { keywords }));
    if (++fetched % 25 === 0) log(`[pages] ${fetched}/${toFetch.length}`);
  });

  const build = (x: (typeof pre)[number]): DomainFinding => {
    const page = pages.get(x.c.host);
    const similarity = page && !page.error ? compare(page, official) : undefined;
    let redirectsToOfficial = false;
    if (page?.finalUrl) {
      try {
        redirectsToOfficial = isOfficialHost(brand, new URL(page.finalUrl).host);
      } catch {}
    }
    const s = scoreDomain({
      ...infra(x.dns),
      platformWalletUi: platformFor(x.c.host)?.walletUi,
      host: x.c.host,
      fuzzer: x.c.fuzzer,
      sources: x.c.sources,
      live: !!x.dns && isLive(x.dns),
      registered: !!x.dns?.registered,
      page,
      similarity,
      listedOn: x.listed,
      redirectsToOfficial,
      platform: x.platform,
      ctFirstSeen: x.c.ctFirstSeen,
      brandName: brand.name,
    });
    return {
      kind: "domain",
      host: x.c.host,
      unicode: x.c.unicode ?? (x.c.host.includes("xn--") ? domainToUnicode(x.c.host) : undefined),
      sources: x.c.sources,
      fuzzer: x.c.fuzzer,
      ctFirstSeen: x.c.ctFirstSeen,
      ctIssuer: x.c.ctIssuer,
      nrdDate: x.c.nrdDate,
      dns: x.dns,
      page: page ? trimPage(page) : undefined,
      similarity,
      listedOn: x.listed,
      platform: x.platform,
      ...s,
    };
  };
  let domains = existing.map(build).sort(bySeverity);

  // Render the most suspicious with Playwright (screenshot + JS-rendered content), then re-score.
  let rendered = 0;
  if (canRender && renderer) {
    const worth = domains
      .filter((d) => d.page && !d.page.error && d.label !== "brand-owned-redirect" && d.label !== "parked")
      .filter((d) => d.label !== "likely-false-positive" || d.score >= 30)
      .sort((a, b) => Number(a.alreadyBlocked) - Number(b.alreadyBlocked) || b.score - a.score)
      .slice(0, o.maxRender);
    log(`[pages] rendering ${worth.length} suspects with Playwright (screenshots)`);
    await mapLimit(worth, 3, async (d) => {
      const fp = pages.get(d.host)!;
      pages.set(d.host, await renderer.render(fp, keywords, d.host));
      rendered++;
    });
    const rebuilt = new Map(existing.map((x) => [x.c.host, x]));
    domains = domains.map((d) => (pages.get(d.host)?.renderedWith === "playwright" ? build(rebuilt.get(d.host)!) : d)).sort(bySeverity);
  }
  await renderer?.stop();

  // ---------------------------------------------------------------- RDAP + drafts
  const scanDate = startedAt.toISOString().slice(0, 10);
  const needDrafts = domains.filter((d) => d.label === "phishing-likely" || d.label === "impersonation" || d.severity === "critical" || d.severity === "high").slice(0, o.maxRdap);
  log(`[rdap] abuse contacts for ${needDrafts.length} findings`);
  await mapLimit(needDrafts, 2, async (d) => {
    if (!d.platform) d.rdap = await domainRdap(d.host);
    const ip = d.dns?.a[0];
    if (ip) d.hosting = await ipRdap(ip);
    if (d.platform) {
      const p = platformFor(d.host)!;
      d.hosting = { ip: ip ?? "", org: p.name, network: d.hosting?.network, abuse: { ...p.contact } };
    }
    d.drafts = domainDrafts(brand, d, scanDate);
  });

  // ---------------------------------------------------------------- tokens
  const tokenFindings: TokenFinding[] = [];
  const tokenCoverage: ScanResult["coverage"]["tokens"] = [];
  const tokensIndexed: Record<string, number> = {};
  if (o.tokens) {
    const engine = o.engine ?? baseEngine();
    for (const chain of brand.tokenChains ?? ["base"]) {
      log(`[tokens:${chain}] building index of tokens with new pools (last ${o.days} days)`);
      let idx: TokenIndex;
      try {
        idx = await buildTokenIndex(chain as Chain, { days: o.days, cacheDir: o.cacheDir, log });
      } catch (e) {
        errors.push(`tokens ${chain}: ${(e as Error).message.slice(0, 160)}`);
        continue;
      }
      tokensIndexed[chain] = idx.tokens.length;
      tokenCoverage.push({ chain, coveredDays: idx.coveredDays, head: idx.head, errors: idx.errors });
      const matches = idx.tokens
        .filter((t) => !isOfficialToken(brand, chain as Chain, t.address))
        .map((t) => ({ t, m: matchToken(brand, t.name, t.symbol) }))
        .filter((x) => x.m)
        .sort((a, b) => b.m!.score - a.m!.score);
      log(`[tokens:${chain}] ${matches.length} name/symbol matches`);
      let engineRuns = 0;
      await mapLimit(matches, 2, async ({ t, m }) => {
        const f: TokenFinding = {
          kind: "token",
          chain: chain as Chain,
          address: t.address,
          name: t.name,
          symbol: t.symbol,
          firstBlock: t.firstBlock,
          source: t.source,
          match: m!,
          explorerUrl: `${CHAIN_CONFIG[chain as Chain].explorer}/token/${t.address}`,
          score: 0,
          severity: "info",
          label: "weak-match",
          evidence: [],
          action: "",
        };
        if (chain === "base" && engineRuns < o.maxEngine && m!.kind !== "symbol-variant") {
          engineRuns++;
          try {
            f.engine = await engine(t.address);
          } catch (e) {
            f.engineError = (e as Error).message.slice(0, 160);
          }
        }
        const official = brand.officialTokens.find((x) => x.chain === chain);
        Object.assign(
          f,
          scoreTokenFinding({ match: m!, engine: f.engine, brandName: brand.name, officialRef: official ? `${official.symbol} ${official.address}` : undefined }),
        );
        if (f.engineError) f.evidence.push(`Risk engine failed: ${f.engineError}`);
        else if (chain !== "base") f.evidence.push("Risk engine is Base-only; liquidity not checked on this chain");
        else if (!f.engine) f.evidence.push("Liquidity not checked (outside the per-scan risk-engine cap)");
        if (f.label === "copycat-token" && (f.severity === "critical" || f.severity === "high"))
          f.drafts = tokenDrafts(brand, f, scanDate);
        tokenFindings.push(f);
      });
    }
  }

  return {
    brand,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    periodDays: o.days,
    official: official
      ? { url: official.finalUrl, title: official.title, faviconSha256: official.faviconSha256, error: official.error }
      : undefined,
    stats: {
      permutations: perms.size,
      permutationsRegistered,
      ctHosts: ct.hits.length,
      nrdHits: nrd.hits.length,
      candidates: domains.length,
      pagesFetched: pages.size,
      pagesRendered: rendered,
      tokensIndexed,
      tokenMatches: tokenFindings.length,
    },
    coverage: {
      ct: ct.queries,
      nrd: nrd.days,
      tokens: tokenCoverage,
      blocklists: Object.keys(blocklists.sets),
    },
    domains,
    tokens: tokenFindings.sort(bySeverity),
    errors,
  };
}

/** Weekly brand report: one self-contained HTML file (print it, or let the CLI render a PDF with Playwright). */
import { relative } from "node:path";
import type { ScanResult } from "../scan.ts";
import { SEVERITY_ORDER, type DomainFinding, type Severity, type TokenFinding } from "../scoring.ts";
import { escapeHtml as e } from "../util/text.ts";
import type { Draft } from "./drafts.ts";

export const PRODUCT_NAME = "Mimicwatch";

const SEV_COLOR: Record<Severity, string> = {
  critical: "#b3261e",
  high: "#d9480f",
  medium: "#b8860b",
  low: "#5c7080",
  info: "#8a8f98",
};

const LABEL_TEXT: Record<string, string> = {
  "phishing-likely": "Phishing (likely)",
  impersonation: "Impersonation",
  "lookalike-unknown-content": "Lookalike, content not visible",
  "lookalike-other-crypto": "Lookalike, other crypto content",
  parked: "Parked / for sale",
  "not-live": "Registered, no website",
  "brand-owned-redirect": "Brand-owned (likely)",
  "likely-false-positive": "False positive (likely)",
  "copycat-token": "Copycat token",
  "symbol-collision": "Same ticker (maybe unrelated)",
  "weak-match": "Weak match",
};

const sev = (s: Severity) => `<span class="sev" style="background:${SEV_COLOR[s]}">${s}</span>`;
const count = <T extends { severity: Severity }>(xs: T[], s: Severity) => xs.filter((x) => x.severity === s).length;
const isAction = (s: Severity) => s === "critical" || s === "high";

function shotTag(d: DomainFinding, baseDir: string): string {
  if (!d.page?.screenshot) return "";
  const rel = relative(baseDir, d.page.screenshot);
  return `<a href="${e(rel)}"><img class="shot" src="${e(rel)}" alt="Screenshot of ${e(d.host)}" loading="lazy"></a>`;
}

function draftHtml(d: Draft): string {
  const fields = d.fields
    ? `<table class="fields">${Object.entries(d.fields)
        .map(([k, v]) => `<tr><th>${e(k)}</th><td><code>${e(v)}</code></td></tr>`)
        .join("")}</table>`
    : "";
  const to = /^https?:/.test(d.to) ? `<a href="${e(d.to)}">${e(d.to)}</a>` : e(d.to);
  return `<details class="draft"><summary>${e(d.title)}</summary>
<p><b>File at:</b> ${to}${d.subject ? `<br><b>Subject:</b> ${e(d.subject)}` : ""}</p>${fields}
<pre>${e(d.body)}</pre>${d.notes?.length ? `<ul class="notes">${d.notes.map((n) => `<li>${e(n)}</li>`).join("")}</ul>` : ""}</details>`;
}

function domainCard(d: DomainFinding, baseDir: string): string {
  const name = d.unicode && d.unicode !== d.host ? `${e(d.unicode)} <small>(${e(d.host)})</small>` : e(d.host);
  const src = [d.fuzzer ? `lookalike: ${d.fuzzer}` : "", d.sources.includes("ct") ? "found in CT logs" : "", d.sources.includes("nrd") ? "newly registered" : "", d.sources.includes("manual") ? "added by hand" : ""].filter(Boolean).join(" · ");
  const infra =
    d.rdap?.registrar || d.hosting?.org
      ? `<p class="small">Registrar: ${e(d.rdap?.registrar ?? (d.platform ? "n/a (platform subdomain)" : "?"))}${d.rdap?.registered ? `, registered ${e(d.rdap.registered.slice(0, 10))}` : ""} · Host: ${e(d.hosting?.org ?? d.hosting?.network ?? "?")}${d.dns?.a.length ? ` · IP ${e(d.dns.a[0])}` : ""}</p>`
      : "";
  return `<article class="card"><div class="card-h">${sev(d.severity)} <span class="host">${name}</span> <span class="lbl">${e(LABEL_TEXT[d.label] ?? d.label)}</span> <small>${d.score}/100 · ${e(src)}</small></div>
<div class="card-b"><div><ul class="ev">${d.evidence.map((x) => `<li>${e(x)}</li>`).join("")}</ul>${infra}<p class="act"><b>Recommended:</b> ${e(d.action)}</p></div>${shotTag(d, baseDir)}</div>
${d.drafts?.length ? `<div class="drafts">${d.drafts.map(draftHtml).join("")}</div>` : ""}</article>`;
}

function tokenCard(t: TokenFinding): string {
  return `<article class="card"><div class="card-h">${sev(t.severity)} <b>${e(t.name ?? "?")}</b> (${e(t.symbol ?? "?")}) <span class="lbl">${e(LABEL_TEXT[t.label] ?? t.label)}</span> <small>${t.score}/100 · ${e(t.chain)} · ${e(t.source)} · block ${t.firstBlock}</small></div>
<div class="card-b"><div><p class="small"><a href="${e(t.explorerUrl)}">${e(t.address)}</a></p><ul class="ev">${t.evidence.map((x) => `<li>${e(x)}</li>`).join("")}</ul><p class="act"><b>Recommended:</b> ${e(t.action)}</p></div></div>
${t.drafts?.length ? `<div class="drafts">${t.drafts.map(draftHtml).join("")}</div>` : ""}</article>`;
}

function domainRow(d: DomainFinding, baseDir: string, detail: boolean): string {
  const name = d.unicode && d.unicode !== d.host ? `${e(d.unicode)}<br><small>${e(d.host)}</small>` : e(d.host);
  const src = [d.fuzzer ? `perm:${d.fuzzer}` : "", d.sources.includes("ct") ? "CT" : "", d.sources.includes("nrd") ? "NRD" : "", d.sources.includes("manual") ? "manual" : ""].filter(Boolean).join(", ");
  const ev = (detail ? d.evidence : d.evidence.slice(0, 3)).map((x) => `<li>${e(x)}</li>`).join("");
  const extra = detail
    ? `${shotTag(d, baseDir)}${
        d.rdap?.registrar || d.hosting?.org
          ? `<p class="small">Registrar: ${e(d.rdap?.registrar ?? (d.platform ? "n/a (platform subdomain)" : "?"))}${d.rdap?.registered ? `, registered ${e(d.rdap.registered.slice(0, 10))}` : ""} &middot; Host: ${e(d.hosting?.org ?? d.hosting?.network ?? "?")}</p>`
          : ""
      }${(d.drafts ?? []).map(draftHtml).join("")}`
    : "";
  return `<tr><td>${sev(d.severity)}<br><small>${d.score}/100</small></td><td class="host">${name}<br><small>${e(src)}</small></td><td>${e(LABEL_TEXT[d.label] ?? d.label)}</td><td><ul class="ev">${ev}</ul>${extra}</td><td>${e(d.action)}</td></tr>`;
}

function tokenRow(t: TokenFinding, detail: boolean): string {
  const ev = (detail ? t.evidence : t.evidence.slice(0, 3)).map((x) => `<li>${e(x)}</li>`).join("");
  return `<tr><td>${sev(t.severity)}<br><small>${t.score}/100</small></td><td><b>${e(t.name ?? "?")}</b> (${e(t.symbol ?? "?")})<br><small><a href="${e(t.explorerUrl)}">${e(t.address)}</a><br>${e(t.chain)}, ${e(t.source)}, block ${t.firstBlock}</small></td><td>${e(LABEL_TEXT[t.label] ?? t.label)}</td><td><ul class="ev">${ev}</ul>${detail ? (t.drafts ?? []).map(draftHtml).join("") : ""}</td><td>${e(t.action)}</td></tr>`;
}

const TABLE_HEAD = `<thead><tr><th>Severity</th><th>Target</th><th>Label</th><th>Evidence</th><th>Recommended action</th></tr></thead>`;

export function renderHtml(r: ScanResult, baseDir: string): string {
  const b = r.brand;
  const actionD = r.domains.filter((d) => isAction(d.severity));
  const actionT = r.tokens.filter((t) => isAction(t.severity));
  const watchD = r.domains.filter(
    (d) => !isAction(d.severity) && (d.severity === "medium" || d.label === "impersonation" || d.label === "lookalike-other-crypto"),
  );
  const restD = r.domains.filter((d) => !actionD.includes(d) && !watchD.includes(d));
  const watchT = r.tokens.filter((t) => !isAction(t.severity) && t.severity !== "info");
  const fp = r.domains.filter((d) => d.label === "likely-false-positive" || d.label === "brand-owned-redirect");
  const from = new Date(new Date(r.startedAt).getTime() - r.periodDays * 86_400_000).toISOString().slice(0, 10);
  const to = r.startedAt.slice(0, 10);
  const sevCells = (xs: Array<{ severity: Severity }>) => SEVERITY_ORDER.map((s) => `<td>${count(xs, s)}</td>`).join("");
  const newD = actionD.filter((d) => !d.alreadyBlocked);
  const blockedD = actionD.filter((d) => d.alreadyBlocked);
  const headline =
    actionD.length + actionT.length === 0
      ? `No high-severity impersonation found in this period. ${r.domains.length} lookalike domains and ${r.tokens.length} name-matching tokens were checked and are listed below for monitoring.`
      : `${newD.length + actionT.length} new high-risk finding(s) not yet on any wallet blocklist (${newD.length} domain(s), ${actionT.length} token(s)), plus ${blockedD.length} phishing domain(s) that wallets already block but that are still online. Draft reports are ready; nothing has been filed.`;
  const cov = r.coverage;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(PRODUCT_NAME)} report: ${e(b.name)} (${from} to ${to})</title>
<style>
:root{--ink:#16181d;--muted:#5b6170;--line:#e3e5ea;--bg:#fbfbfa;--accent:#0f6e5a}
*{box-sizing:border-box}body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg);margin:0}
main{max-width:1120px;margin:0 auto;padding:32px 28px 64px}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid var(--ink);padding-bottom:14px;margin-bottom:22px}
h1{font-size:26px;margin:0}h2{font-size:18px;margin:34px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}
.kicker{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);font-weight:700}
.meta{color:var(--muted);text-align:right;font-size:12px}
.headline{font-size:16px;background:#fff;border:1px solid var(--line);border-left:4px solid var(--accent);padding:12px 16px;margin:0 0 18px}
table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--line)}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}
th{font-size:12px;color:var(--muted);font-weight:600;background:#f4f5f7}
.counts td,.counts th{text-align:center}
.sev{display:inline-block;color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;border-radius:3px;padding:1px 6px}
.host{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;word-break:break-all;max-width:240px}
small,.small{color:var(--muted);font-size:11.5px}
ul.ev{margin:0;padding-left:16px}ul.ev li{margin:1px 0}
img.shot{display:block;width:320px;max-width:100%;border:1px solid var(--line);margin:8px 0}
details.draft{margin:6px 0;border:1px solid var(--line);border-radius:4px;padding:4px 8px;background:#fcfcfd}
details.draft summary{cursor:pointer;font-weight:600;font-size:12.5px}
pre{white-space:pre-wrap;font:12px/1.45 ui-monospace,Menlo,monospace;background:#f4f5f7;padding:8px;border-radius:4px}
table.fields th{width:34%}code{font:12px ui-monospace,Menlo,monospace}
.notes{font-size:12px;color:var(--muted)}
.box{background:#fff;border:1px solid var(--line);padding:12px 16px}
.card{background:#fff;border:1px solid var(--line);border-radius:6px;padding:12px 14px;margin:0 0 12px;break-inside:avoid}
.card-h{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;margin-bottom:6px}
.card-h .host{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;font-weight:600;word-break:break-all}
.lbl{font-size:12px;font-weight:600;color:var(--accent)}
.card-b{display:grid;grid-template-columns:1fr auto;gap:14px}
.card-b img.shot{width:300px;margin:0}
.act{margin:6px 0 0}
.drafts{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px;margin-top:8px}
.drafts details[open]{grid-column:1/-1}
footer{margin-top:40px;font-size:12px;color:var(--muted)}
@media print{body{background:#fff}main{padding:0}details.draft{break-inside:avoid}details.draft>*{display:block}tr{break-inside:avoid}a{color:inherit}}
</style></head><body><main>
<header><div><div class="kicker">${e(PRODUCT_NAME)} &middot; brand impersonation report</div><h1>${e(b.name)}</h1></div>
<div class="meta">Period: ${from} to ${to} (${r.periodDays} days)<br>Generated ${e(r.finishedAt.replace("T", " ").slice(0, 16))} UTC<br>Official: ${b.officialDomains.map(e).join(", ")}</div></header>

${(() => {
  const failed = [
    ...cov.ct.filter((q) => q.error).map((q) => `Certificate Transparency query "${q.q}" failed (${q.error})`),
    ...cov.tokens.filter((t) => t.coveredDays < Math.min(1, r.periodDays)).map((t) => `token logs on ${t.chain} covered only ${t.coveredDays} days`),
    ...(cov.blocklists.length < 2 ? ["a wallet blocklist download failed"] : []),
  ];
  return failed.length ? `<p class="headline" style="border-left-color:#b3261e"><b>Incomplete scan:</b> ${e(failed.join("; "))}. Re-run before relying on "nothing found".</p>` : "";
})()}
<p class="headline">${e(headline)}</p>

<table class="counts"><thead><tr><th></th>${SEVERITY_ORDER.map((s) => `<th>${sev(s)}</th>`).join("")}<th>Total</th></tr></thead>
<tbody><tr><th>Domains</th>${sevCells(r.domains)}<td>${r.domains.length}</td></tr>
<tr><th>Tokens</th>${sevCells(r.tokens)}<td>${r.tokens.length}</td></tr></tbody></table>
<p class="small">Checked: ${r.stats.permutations} lookalike permutations (${r.stats.permutationsRegistered} registered), ${r.stats.ctHosts} hostnames from Certificate Transparency, ${r.stats.nrdHits} newly registered domains, ${r.stats.pagesFetched} pages fetched (${r.stats.pagesRendered} rendered with screenshots), ${Object.entries(r.stats.tokensIndexed)
    .map(([c, n]) => `${n.toLocaleString("en-US")} new-pool tokens on ${c}`)
    .join(", ") || "tokens not scanned"}.</p>

<h2>1. Needs a decision: new (critical / high, not on any blocklist yet)</h2>
${
  newD.length + actionT.length
    ? `${newD.map((d) => domainCard(d, baseDir)).join("")}${actionT.map(tokenCard).join("")}`
    : `<p class="box">Nothing new at this level in this period.</p>`
}
<h2>1b. Still online, already blocked by wallets or the host</h2>
<p class="small">MetaMask / ScamSniffer already warn their users about these, or the host shows a phishing warning. The domains still exist, so a registrar takedown is the remaining step.</p>
${
  blockedD.length
    ? `<details${blockedD.length <= 8 ? " open" : ""}><summary>${blockedD.length} domain(s)</summary>${blockedD.map((d) => domainCard(d, baseDir)).join("")}</details>`
    : `<p class="box">None.</p>`
}

<h2>2. Watch list (medium, or impersonating content without wallet prompts)</h2>
${
  watchD.length + watchT.length
    ? `${watchD.map((d) => domainCard(d, baseDir)).join("")}${
        watchT.length ? `<details><summary>${watchT.length} token(s) on the watch list</summary><table>${TABLE_HEAD}<tbody>${watchT.map((t) => tokenRow(t, false)).join("")}</tbody></table></details>` : ""
      }`
    : `<p class="box">Nothing at this level in this period.</p>`
}

<h2>3. Everything else we checked (low / info)</h2>
<p class="small">Registered lookalikes without a website, parked pages, certificates for unrelated sites, and labelled false positives. Kept so you can see what was ruled out. ${fp.length} are explicitly labelled as false positives or brand-owned redirects.</p>
${
  restD.length
    ? `<details><summary>${restD.length} domain(s)</summary><table>${TABLE_HEAD}<tbody>${restD.map((d) => domainRow(d, baseDir, false)).join("")}</tbody></table></details>`
    : ""
}
${(() => {
  const restT = r.tokens.filter((t) => !actionT.includes(t) && !watchT.includes(t));
  return restT.length
    ? `<details><summary>${restT.length} token(s)</summary><table>${TABLE_HEAD}<tbody>${restT.map((t) => tokenRow(t, false)).join("")}</tbody></table></details>`
    : "";
})()}

<h2>4. Coverage and limits of this scan</h2>
<div class="box small"><ul>
<li>Certificate Transparency (crt.sh): ${cov.ct.map((q) => `<code>${e(q.q)}</code> ${q.error ? `failed (${e(q.error)})` : `${q.rows} certs`}`).join("; ")}. crt.sh truncates leading-wildcard searches, so names that only contain the brand in the middle can be missed.</li>
<li>Newly registered domains (WhoisDS free list, capped at 70k names/day): ${cov.nrd.length ? cov.nrd.map((d) => `${d.day}: ${d.error ? `failed` : d.domains}`).join(", ") : "not used"}.</li>
<li>Tokens: ${cov.tokens.map((t) => `${t.chain}: ${t.coveredDays} days of new pools${t.errors.length ? ` (${t.errors.length} RPC errors)` : ""}`).join("; ") || "not scanned"}. Only tokens that got a Uniswap/Aerodrome pool are seen. Free Ethereum RPCs serve about a day of logs.</li>
<li>Wallet blocklists checked: ${cov.blocklists.join(", ") || "none (download failed)"}.</li>
<li>Not covered yet: X/Twitter, Telegram and Discord impersonators, app stores, paid ads, Solana tokens.</li>
<li>Scores are heuristics. Every finding above "low" should be looked at by a person before anything is filed.</li>
</ul></div>

<h2>5. How this was collected</h2>
<p class="small">Only public data was read: DNS, certificate logs, public domain lists, public blockchain logs, RDAP, and the public pages themselves (fetched like a normal visitor; no logins, no clicks, no form input, no wallet connected). No suspect was contacted. Nothing in this report has been filed with any registrar, host or blocklist: every report under "Draft" is text for ${e(b.name)} to approve. We file only with a signed Letter of Authorisation.</p>

<footer>${e(PRODUCT_NAME)} by Mintward &middot; ${e(b.name)} &middot; ${from} to ${to}</footer>
</main></body></html>`;
}

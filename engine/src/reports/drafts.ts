/**
 * Ready-to-file report drafts. DRAFTS ONLY: nothing in this project sends email, submits forms, opens issues or PRs.
 * Filing is the client's decision (or ours, as their agent, only with a signed Letter of Authorisation).
 *
 * Channel processes verified 2026-11-01:
 * - MetaMask eth-phishing-detect: GitHub issue template "Request blocklist addition" (fields: domains one per line,
 *   rationale, duplicate check) is the active route (145 such issues since 2026-08-01). The README's
 *   `yarn add:blocklist` PR route still exists, but merged PRs are almost all from security-alliance-bot.
 * - ScamSniffer scam-database: GitHub issue with domain, scam addresses (with chain) and evidence. PRs that edit
 *   the JSON are overwritten by their pipeline.
 * - Google Safe Browsing: web form (report type, threat type, threat category, URL, additional details <= 800 chars,
 *   reCAPTCHA).
 * - Netcraft: web form (URL, optional details, reporter email, reCAPTCHA).
 */
import type { BrandProfile } from "../brand.ts";
import type { DomainFinding, TokenFinding } from "../scoring.ts";
import { defang } from "../util/text.ts";

export type Channel =
  | "registrar-abuse"
  | "host-abuse"
  | "google-safe-browsing"
  | "netcraft"
  | "metamask-issue"
  | "metamask-pr"
  | "scamsniffer-issue"
  | "community-warning"
  | "explorer-label";

export interface Draft {
  channel: Channel;
  title: string;
  /** Where to file it (email address or URL). */
  to: string;
  subject?: string;
  fields?: Record<string, string>;
  body: string;
  notes?: string[];
}

export const DRAFT_BANNER =
  "DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.";
export const GSB_MAX = 800;

export const REPORTER = {
  name: "{{REPORTER_NAME}}",
  org: "{{REPORTER_ORG}}",
  email: "{{REPORTER_EMAIL}}",
  loa: "{{LOA_DATE}}",
};

const officialList = (b: BrandProfile) => b.officialDomains.map((d) => `https://${d}`).join(", ");

export function evidenceLines(f: DomainFinding): string[] {
  const out = [...f.evidence];
  if (f.dns?.a.length) out.push(`Resolves to ${f.dns.a.slice(0, 3).join(", ")}`);
  if (f.page?.title) out.push(`Page title: "${f.page.title.slice(0, 120)}"`);
  if (f.page?.screenshot) out.push(`Screenshot: ${f.page.screenshot.split("/").slice(-2).join("/")} (attach)`);
  return out;
}

/** Strongest evidence first: what a reviewer at a blocklist needs to see in one line. */
const EVIDENCE_PRIORITY = [/Asks for secrets/, /favicon/, /text overlaps/, /Drainer-style/, /Wallet-connect/, /title resembles/, /Brand named/, /Homoglyph/, /blocklist/, /phishing warning/, /Typosquat|lure word/];
const rank = (e: string) => {
  const i = EVIDENCE_PRIORITY.findIndex((r) => r.test(e));
  return i === -1 ? EVIDENCE_PRIORITY.length : i;
};

export function shortRationale(b: BrandProfile, f: DomainFinding): string {
  const key = f.evidence
    .filter((e) => !/^Hosted on|^TLS certificate|^Hostname contains/.test(e))
    .sort((a, c) => rank(a) - rank(c))
    .slice(0, 4)
    .join("; ");
  return `Impersonates ${b.name} (official: ${officialList(b)}). ${key}.`;
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 3)}...`;
}

export function domainDrafts(b: BrandProfile, f: DomainFinding, scanDate: string): Draft[] {
  const url = f.page?.finalUrl && !f.page.error ? f.page.finalUrl : `https://${f.host}/`;
  const ev = evidenceLines(f)
    .map((e) => `- ${e}`)
    .join("\n");
  const sig = `${REPORTER.name}\n${REPORTER.org}, acting for ${b.name} under a Letter of Authorisation dated ${REPORTER.loa}\n${REPORTER.email}`;
  const drafts: Draft[] = [];

  const reg = f.rdap;
  if (!f.platform) {
    const to = reg?.abuse.email ?? "(registrar abuse address not found via RDAP: look it up at https://lookup.icann.org)";
    drafts.push({
      channel: "registrar-abuse",
      title: `Registrar abuse report${reg?.registrar ? ` to ${reg.registrar}` : ""}`,
      to,
      subject: `Phishing / brand impersonation: ${f.host} impersonates ${b.name}`,
      body: `Hello ${reg?.registrar ?? "Abuse Team"} abuse team,

The domain ${defang(f.host)} (registered with you${reg?.registered ? ` on ${reg.registered.slice(0, 10)}` : ""}) is being used to impersonate ${b.name}, a crypto project whose official site is ${defang(officialList(b))}. We ask you to suspend the domain under your abuse policy and the RAA section 3.18 obligations.

Evidence (observed ${scanDate}, read-only, URLs defanged):
- URL: ${defang(url)}
${ev}

We are not affiliated with the operator of ${defang(f.host)}. ${b.name} has not authorised its use of the brand. Screenshots and HTML captures are available on request.

Regards,
${sig}`,
      notes: reg?.ianaId ? [`Registrar IANA ID ${reg.ianaId}${reg.abuse.phone ? `, abuse phone ${reg.abuse.phone}` : ""}`] : undefined,
    });
  }

  const host = f.hosting;
  const platformContact = f.platform ? `${f.platform}` : undefined;
  const hostTo = host?.abuse.form ?? host?.abuse.email ?? "(hosting abuse contact not found)";
  drafts.push({
    channel: "host-abuse",
    title: `Hosting abuse report${platformContact ? ` to ${platformContact}` : host?.org ? ` to ${host.org}` : ""}`,
    to: hostTo,
    subject: `Phishing site hosted on your network: ${f.host} (${b.name} impersonation)`,
    body: `Hello ${platformContact ?? host?.org ?? "Abuse Team"},

${defang(url)} ${f.dns?.a.length ? `(${f.dns.a.slice(0, 3).join(", ")}) ` : ""}is hosted on your ${f.platform ? "platform" : "network"} and impersonates ${b.name} (official: ${defang(officialList(b))}).

Evidence (observed ${scanDate}):
${ev}

Please take the content down under your acceptable use policy.

Regards,
${sig}`,
    notes: [host?.abuse.note, host?.abuse.form && host.abuse.email ? `Email alternative: ${host.abuse.email}` : undefined].filter(
      (x): x is string => !!x,
    ),
  });

  const details = truncate(shortRationale(b, f), GSB_MAX);
  drafts.push({
    channel: "google-safe-browsing",
    title: "Google Safe Browsing report",
    to: `https://safebrowsing.google.com/safebrowsing/report_phish/?url=${encodeURIComponent(url)}`,
    fields: {
      "Report Type": "This page is not safe",
      "Threat Type": "Social engineering (phishing) - pick the closest option shown",
      "Threat Category": "Pick the closest option shown (impersonation / phishing)",
      "URL to report": url,
      "Additional details (max 800)": details,
    },
    body: details,
    notes: ["Web form with reCAPTCHA: a person has to submit it."],
  });

  drafts.push({
    channel: "netcraft",
    title: "Netcraft report",
    to: "https://report.netcraft.com/report",
    fields: { "The URL of the site": url, "Further details": details, "Your email address": REPORTER.email },
    body: details,
    notes: ["Web form with reCAPTCHA. Netcraft feeds many browser and registrar blocklists."],
  });

  const listed = new Set(f.listedOn);
  if (!listed.has("metamask")) {
    drafts.push({
      channel: "metamask-issue",
      title: "MetaMask eth-phishing-detect: blocklist addition issue",
      to: "https://github.com/MetaMask/eth-phishing-detect/issues/new?template=01-blocklist-addition.yaml",
      fields: {
        "Malicious domains, IPs, IPFS hashes, or IPNS names": url,
        "Please explain why this content is malicious": `${shortRationale(b, f)} Observed ${scanDate}. Reported on behalf of ${b.name}.`,
        "Is this a duplicate request?": "Search open issues for the domain first, then tick the box",
      },
      body: shortRationale(b, f),
    });
    drafts.push({
      channel: "metamask-pr",
      title: "MetaMask eth-phishing-detect: alternative PR (slower; most merges are bot syncs)",
      to: "https://github.com/MetaMask/eth-phishing-detect",
      body: `git checkout -b block-${f.host}\nyarn add:blocklist ${f.host}\n\nPR title: Block ${f.host} (${b.name} impersonation)\nPR body: ${shortRationale(b, f)}`,
    });
  }
  if (!listed.has("scamsniffer")) {
    drafts.push({
      channel: "scamsniffer-issue",
      title: "ScamSniffer scam-database issue",
      to: "https://github.com/scamsniffer/scam-database/issues/new",
      subject: `[Phishing] ${f.host} - ${b.name} impersonation`,
      body: `Domain: ${f.host}
Scam addresses (with chain): {{ADD IF KNOWN, e.g. from a victim's drain tx}}
Impersonates: ${b.name} (official: ${officialList(b)})

Evidence (observed ${scanDate}):
${ev}`,
      notes: ["ScamSniffer asks for issues, not PRs (their JSON is regenerated). Attach the screenshot."],
    });
  }
  return drafts.map((d) => ({ ...d, body: `${DRAFT_BANNER}\n\n${d.body}` }));
}

export function tokenDrafts(b: BrandProfile, f: TokenFinding, scanDate: string): Draft[] {
  const official = b.officialTokens.filter((t) => t.chain === f.chain);
  const officialLine = official.length
    ? official.map((t) => `${t.symbol} on ${f.chain}: ${t.address}`).join("; ")
    : `${b.name} has no official token on ${f.chain}`;
  const explorer = f.chain === "base" ? "https://basescan.org/contactus" : "https://etherscan.io/contactus";
  const drafts: Draft[] = [
    {
      channel: "community-warning",
      title: "Community warning post (X / Telegram / Discord)",
      to: "Client's official channels",
      body: `Heads up: a token called "${f.name ?? "?"}" (${f.symbol ?? "?"}) at ${f.address} on ${f.chain} is NOT affiliated with ${b.name}.
The only official contract(s): ${officialLine}.
Always check the contract address on ${officialList(b)} before buying or approving anything.`,
    },
    {
      channel: "explorer-label",
      title: `${f.chain === "base" ? "Basescan" : "Etherscan"} label request`,
      to: explorer,
      subject: "Report/Flag address (pick the closest subject in the form)",
      body: `Token ${f.address} ("${f.name ?? "?"}", ${f.symbol ?? "?"}) on ${f.chain} imitates ${b.name}. It is not the official token (${officialLine}). Please label it as an impersonator / unaffiliated token.

Evidence (${scanDate}):
${f.evidence.map((e) => `- ${e}`).join("\n")}

${REPORTER.name}, ${REPORTER.org}, for ${b.name} (LOA dated ${REPORTER.loa}), ${REPORTER.email}`,
      notes: ["Contact form subjects change; choose the one for reporting or labelling an address."],
    },
    {
      channel: "scamsniffer-issue",
      title: "ScamSniffer issue (address report)",
      to: "https://github.com/scamsniffer/scam-database/issues/new",
      subject: `[Scam token] ${f.symbol ?? f.address} on ${f.chain} - ${b.name} impersonation`,
      body: `Scam address (chain): ${f.address} (${f.chain})
Impersonates: ${b.name}. Official: ${officialLine}
Evidence:
${f.evidence.map((e) => `- ${e}`).join("\n")}`,
      notes: ["ScamSniffer's address list stopped updating in Feb 2024; domains are their focus. File only if paired with a phishing domain."],
    },
  ];
  return drafts.map((d) => ({ ...d, body: `${DRAFT_BANNER}\n\n${d.body}` }));
}

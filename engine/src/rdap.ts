/**
 * Abuse contacts via RDAP (free, no key): registrar abuse from the TLD registry's RDAP server (IANA bootstrap),
 * hosting abuse from the IP's RIR (ARIN's RDAP redirects to RIPE/APNIC/LACNIC/AFRINIC as needed).
 */
import { parse } from "tldts";
import { httpJson, type FetchLike } from "./util/http.ts";

export interface Contact {
  name?: string;
  email?: string;
  phone?: string;
  /** Web form when the provider prefers forms over email. */
  form?: string;
  /** Caveat shown in drafts, e.g. an unverified contact. */
  note?: string;
}

export interface DomainRdap {
  domain: string;
  registrar?: string;
  ianaId?: string;
  abuse: Contact;
  registered?: string;
  expires?: string;
  status: string[];
  source?: string;
  error?: string;
}

export interface IpRdap {
  ip: string;
  network?: string;
  org?: string;
  abuse: Contact;
  error?: string;
}

/** Shared hosting platforms: subdomains belong to the platform's customers, so the platform is the abuse target. */
export const PLATFORMS: Array<{ suffix: string; name: string; contact: Contact; walletUi?: boolean }> = [
  // Web3 profile/gateway hosts: the platform itself shows "connect wallet", so that signal is ignored there.
  { suffix: "sol.site", name: "SNS profile (sol.site)", contact: { note: "Solana Name Service profile host; report to the SNS team" }, walletUi: true },
  { suffix: "eth.limo", name: "ENS gateway (eth.limo)", contact: { email: "abuse@eth.limo", note: "address not verified" }, walletUi: true },
  { suffix: "pages.dev", name: "Cloudflare Pages", contact: { form: "https://abuse.cloudflare.com/", email: "abuse@cloudflare.com" } },
  { suffix: "workers.dev", name: "Cloudflare Workers", contact: { form: "https://abuse.cloudflare.com/", email: "abuse@cloudflare.com" } },
  { suffix: "vercel.app", name: "Vercel", contact: { form: "https://vercel.com/abuse" } },
  { suffix: "netlify.app", name: "Netlify", contact: { note: "Netlify abuse page moved (404 on 2026-11-01); find the current channel on netlify.com or use the IP host contact" } },
  { suffix: "github.io", name: "GitHub Pages", contact: { form: "https://support.github.com/contact/report-abuse" } },
  { suffix: "web.app", name: "Firebase Hosting (Google)", contact: { form: "https://support.google.com/code/contact/cloud_platform_report" } },
  { suffix: "firebaseapp.com", name: "Firebase Hosting (Google)", contact: { form: "https://support.google.com/code/contact/cloud_platform_report" } },
  { suffix: "hosted.app", name: "Firebase App Hosting (Google)", contact: { form: "https://support.google.com/code/contact/cloud_platform_report" } },
  { suffix: "onrender.com", name: "Render", contact: { email: "abuse@render.com", note: "address not verified" } },
  { suffix: "replit.app", name: "Replit", contact: { email: "abuse@replit.com", note: "address not verified" } },
  { suffix: "webflow.io", name: "Webflow", contact: { note: "Webflow abuse page not found on 2026-11-01; use webflow.com support or the IP host contact" } },
  { suffix: "framer.app", name: "Framer", contact: { email: "abuse@framer.com", note: "address not verified" } },
  { suffix: "gitbook.io", name: "GitBook", contact: { email: "support@gitbook.com", note: "address not verified" } },
];

export function platformFor(host: string) {
  const h = host.toLowerCase();
  return PLATFORMS.find((p) => h === p.suffix || h.endsWith(`.${p.suffix}`));
}

/** Providers whose IP RDAP abuse address is real but who ask for a web form. */
const FORM_BY_ORG: Array<[RegExp, string]> = [[/cloudflare/i, "https://abuse.cloudflare.com/"]];

type Vcard = [string, Record<string, unknown>, string, unknown][];
interface Entity {
  roles?: string[];
  vcardArray?: [string, Vcard];
  publicIds?: { type: string; identifier: string }[];
  entities?: Entity[];
}

function vcard(e: Entity): Contact {
  const v = e.vcardArray?.[1] ?? [];
  const get = (k: string) => {
    const x = v.find((r) => r[0] === k)?.[3];
    return typeof x === "string" && x.trim() ? x.trim() : undefined;
  };
  return { name: get("fn"), email: get("email"), phone: get("tel")?.replace(/^tel:/, "") };
}

function findRole(es: Entity[] | undefined, role: string): Entity | undefined {
  for (const e of es ?? []) {
    if (e.roles?.includes(role)) return e;
    const n = findRole(e.entities, role);
    if (n) return n;
  }
  return undefined;
}

/** Abuse contact nearest to the given entity (its own nested abuse entity first). */
function abuseOf(e: Entity | undefined, top: Entity[] | undefined): Contact {
  const nested = findRole(e?.entities, "abuse") ?? findRole(top, "abuse");
  return nested ? vcard(nested) : {};
}

export function parseDomainRdap(domain: string, j: any): DomainRdap {
  const registrar = findRole(j.entities, "registrar");
  const ev = (a: string) => (j.events ?? []).find((e: any) => e.eventAction === a)?.eventDate;
  return {
    domain,
    registrar: registrar ? vcard(registrar).name : undefined,
    ianaId: registrar?.publicIds?.find((p) => /IANA/i.test(p.type))?.identifier,
    abuse: abuseOf(registrar, j.entities),
    registered: ev("registration"),
    expires: ev("expiration"),
    status: j.status ?? [],
  };
}

export function parseIpRdap(ip: string, j: any): IpRdap {
  const org = findRole(j.entities, "registrant");
  const out: IpRdap = { ip, network: j.name, org: org ? vcard(org).name : undefined, abuse: abuseOf(org, j.entities) };
  const form = FORM_BY_ORG.find(([r]) => r.test(out.org ?? out.network ?? ""))?.[1];
  if (form) out.abuse.form = form;
  return out;
}

let bootstrap: Promise<Record<string, string>> | undefined;

export function loadBootstrap(fetchImpl?: FetchLike): Promise<Record<string, string>> {
  bootstrap ??= httpJson<{ services: [string[], string[]][] }>("https://data.iana.org/rdap/dns.json", { fetchImpl }).then((j) => {
    const map: Record<string, string> = {};
    for (const [tlds, urls] of j.services) for (const t of tlds) map[t] = urls.find((u) => u.startsWith("https")) ?? urls[0];
    return map;
  });
  return bootstrap;
}

export async function domainRdap(host: string, fetchImpl?: FetchLike): Promise<DomainRdap> {
  const domain = parse(host).domain ?? host;
  const tld = domain.split(".").pop()!;
  try {
    const servers = await loadBootstrap(fetchImpl);
    const base = servers[tld];
    if (!base) return { domain, abuse: {}, status: [], error: `no RDAP server for .${tld} (use WHOIS)` };
    const url = `${base.replace(/\/?$/, "/")}domain/${domain}`;
    const j = await httpJson<any>(url, { fetchImpl, minIntervalMs: 1_000, headers: { accept: "application/rdap+json" } });
    return { ...parseDomainRdap(domain, j), source: url };
  } catch (e) {
    return { domain, abuse: {}, status: [], error: (e as Error).message.slice(0, 160) };
  }
}

export async function ipRdap(ip: string, fetchImpl?: FetchLike): Promise<IpRdap> {
  try {
    const j = await httpJson<any>(`https://rdap.arin.net/registry/ip/${ip}`, { fetchImpl, minIntervalMs: 1_000, headers: { accept: "application/rdap+json" } });
    return parseIpRdap(ip, j);
  } catch (e) {
    return { ip, abuse: {}, error: (e as Error).message.slice(0, 160) };
  }
}

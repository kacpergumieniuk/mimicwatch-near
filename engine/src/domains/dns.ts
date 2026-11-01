import { Resolver } from "node:dns/promises";
import { mapLimit } from "../util/http.ts";

export interface DnsFacts {
  domain: string;
  /** NS or SOA exists: the name is registered (delegated). */
  registered: boolean;
  a: string[];
  aaaa: string[];
  mx: string[];
  ns: string[];
  error?: string;
}

/** Minimal resolver surface so tests can inject a fake. */
export interface DnsLike {
  resolve4(h: string): Promise<string[]>;
  resolve6(h: string): Promise<string[]>;
  resolveMx(h: string): Promise<{ exchange: string; priority: number }[]>;
  resolveNs(h: string): Promise<string[]>;
}

export function makeResolver(servers?: string[], timeoutMs = 4_000): DnsLike {
  const r = new Resolver({ timeout: timeoutMs, tries: 2 });
  if (servers?.length) r.setServers(servers);
  return r;
}

const NOT_FOUND = new Set(["ENOTFOUND", "ENODATA", "ENONAME", "NXDOMAIN"]);

async function q<T>(p: Promise<T>, errs: string[]): Promise<T | undefined> {
  try {
    return await p;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? "ERR";
    if (!NOT_FOUND.has(code)) errs.push(code);
    return undefined;
  }
}

export async function lookup(domain: string, r: DnsLike): Promise<DnsFacts> {
  const errs: string[] = [];
  const [a, ns] = await Promise.all([q(r.resolve4(domain), errs), q(r.resolveNs(domain), errs)]);
  const facts: DnsFacts = { domain, registered: !!ns?.length || !!a?.length, a: a ?? [], aaaa: [], mx: [], ns: ns ?? [] };
  if (facts.registered) {
    const [aaaa, mx] = await Promise.all([a?.length ? Promise.resolve([]) : q(r.resolve6(domain), errs), q(r.resolveMx(domain), errs)]);
    facts.aaaa = aaaa ?? [];
    facts.mx = (mx ?? []).sort((x, y) => x.priority - y.priority).map((m) => m.exchange);
  }
  if (errs.length) facts.error = [...new Set(errs)].join(",");
  return facts;
}

export function lookupMany(domains: string[], r: DnsLike, concurrency = 24): Promise<DnsFacts[]> {
  return mapLimit(domains, concurrency, (d) => lookup(d, r));
}

export const isLive = (d: DnsFacts) => d.a.length > 0 || d.aaaa.length > 0;

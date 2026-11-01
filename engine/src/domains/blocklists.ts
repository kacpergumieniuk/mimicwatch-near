/**
 * Is a suspect already on a public wallet blocklist? Read-only downloads of the public files, cached for 24 h in
 * .cache/. A listed domain is strong evidence of phishing and changes the recommended action ("already blocked
 * in MetaMask; file registrar takedown only").
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { httpGet, type FetchLike } from "../util/http.ts";

export const LISTS = {
  metamask: "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json",
  scamsniffer: "https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/domains.json",
} as const;
export type ListName = keyof typeof LISTS;

export interface Blocklists {
  sets: Partial<Record<ListName, Set<string>>>;
  errors: string[];
}

async function cached(name: string, url: string, cacheDir: string, fetchImpl?: FetchLike): Promise<string> {
  const file = join(cacheDir, `blocklist-${name}.json`);
  try {
    const s = await stat(file);
    if (Date.now() - s.mtimeMs < 24 * 3600 * 1000) return await readFile(file, "utf8");
  } catch {}
  const res = await httpGet(url, { timeoutMs: 60_000, fetchImpl });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const txt = await res.text();
  await mkdir(cacheDir, { recursive: true });
  await writeFile(file, txt);
  return txt;
}

export function parseList(name: ListName, txt: string): Set<string> {
  const j = JSON.parse(txt);
  const arr: string[] = name === "metamask" ? (j.blacklist ?? []) : j;
  return new Set(arr.map((d) => String(d).toLowerCase()));
}

export async function loadBlocklists(cacheDir: string, fetchImpl?: FetchLike): Promise<Blocklists> {
  const out: Blocklists = { sets: {}, errors: [] };
  for (const [name, url] of Object.entries(LISTS) as [ListName, string][]) {
    try {
      out.sets[name] = parseList(name, await cached(name, url, cacheDir, fetchImpl));
    } catch (e) {
      out.errors.push(`${name}: ${(e as Error).message}`);
    }
  }
  return out;
}

/** Lists that contain the host or one of its parent domains. */
export function listedOn(b: Blocklists, host: string): ListName[] {
  const parts = host.toLowerCase().split(".");
  const names: ListName[] = [];
  for (const [name, set] of Object.entries(b.sets) as [ListName, Set<string>][]) {
    for (let i = 0; i < parts.length - 1; i++)
      if (set.has(parts.slice(i).join("."))) {
        names.push(name);
        break;
      }
  }
  return names;
}

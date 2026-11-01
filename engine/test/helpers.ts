import { deflateRawSync } from "node:zlib";
import type { BrandProfile } from "../src/brand.ts";
import { parseBrand } from "../src/brand.ts";
import type { FetchLike } from "../src/util/http.ts";

export interface Route {
  status?: number;
  body?: string | Buffer | object;
  headers?: Record<string, string>;
}

/** URL -> canned response. Unknown URLs reject like a DNS failure. Records every call. */
export function mockFetch(routes: Record<string, Route | ((url: string) => Route)>): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const r = routes[url];
    if (!r) throw new TypeError(`fetch failed: ${url}`);
    const route = typeof r === "function" ? r(url) : r;
    const body =
      route.body === undefined
        ? ""
        : Buffer.isBuffer(route.body) || typeof route.body === "string"
          ? route.body
          : JSON.stringify(route.body);
    const res = new Response(body as BodyInit, { status: route.status ?? 200, headers: route.headers });
    Object.defineProperty(res, "url", { value: url });
    return res;
  };
  return { fetch, calls };
}

/** Builds a one-file zip (deflate) the way WhoisDS ships it. */
export function makeZip(name: string, content: string): Buffer {
  const data = Buffer.from(content);
  const comp = deflateRawSync(data);
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(comp.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt32LE(0, 42);
  const cdOffset = local.length + nameBuf.length + comp.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length + nameBuf.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, comp, cd, nameBuf, eocd]);
}

export const UNISWAP: BrandProfile = parseBrand({
  name: "Uniswap",
  officialDomains: ["uniswap.org"],
  officialTokens: [
    { chain: "base", address: "0xc3De830EA07524a0761646a6a4e4be0e114a3C83", symbol: "UNI", name: "Uniswap" },
    { chain: "ethereum", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", symbol: "UNI", name: "Uniswap" },
  ],
  officialSocials: { x: "Uniswap" },
  keywords: ["uniswap"],
});

export const AERO: BrandProfile = parseBrand({
  name: "Aerodrome",
  officialDomains: ["aerodrome.finance"],
  officialTokens: [{ chain: "base", address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", symbol: "AERO" }],
  officialSocials: {},
  keywords: ["aerodrome"],
});

import { describe, expect, it } from "vitest";
import { listedOn, loadBlocklists, parseList } from "../src/domains/blocklists.ts";
import { parseCtRows, searchCt, type CtRow } from "../src/domains/ct.ts";
import { lookup, lookupMany, type DnsLike } from "../src/domains/dns.ts";
import { matchNrd, searchNrd, unzipFirst, whoisdsUrl } from "../src/domains/nrd.ts";
import { domainRdap, ipRdap, parseDomainRdap, parseIpRdap, platformFor } from "../src/rdap.ts";
import { makeZip, mockFetch } from "./helpers.ts";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const row = (id: number, names: string, nb: string): CtRow => ({
  id,
  issuer_name: "C=US, O=Let's Encrypt, CN=E6",
  common_name: null,
  name_value: names,
  not_before: nb,
  not_after: "2027-01-01T00:00:00",
});

describe("Certificate Transparency (crt.sh)", () => {
  const since = new Date("2026-10-01T00:00:00Z");
  it("keeps recent hostnames containing the keyword, strips wildcards, merges certs", () => {
    const hits = parseCtRows(
      [
        row(1, "*.uniswap-claim.xyz\nuniswap-claim.xyz", "2026-10-20T10:00:00"),
        row(2, "uniswap-claim.xyz", "2026-10-10T10:00:00"),
        row(3, "old-uniswap.com", "2026-09-01T00:00:00"),
        row(4, "unrelated.com", "2026-10-20T00:00:00"),
        row(5, "xn--uniswp-7nf.app", "2026-10-21T00:00:00"), // uniswаp with Cyrillic а
      ],
      "uniswap",
      since,
    );
    const hosts = hits.map((h) => h.host).sort();
    expect(hosts).toEqual(["uniswap-claim.xyz", "xn--uniswp-7nf.app"]);
    const h = hits.find((x) => x.host === "uniswap-claim.xyz")!;
    expect(h.firstSeen).toBe("2026-10-10T10:00:00");
    expect(h.certIds.sort()).toEqual([1, 2]);
    expect(h.issuer).toBe("E6");
  });

  it("runs prefix, dotted, dashed and wildcard queries, merges them and survives a failing one", async () => {
    const f = mockFetch({
      "https://crt.sh/?q=uniswap%25&output=json&exclude=expired": { body: [row(1, "uniswap-airdrop.top", "2026-10-25T00:00:00")] },
      "https://crt.sh/?q=uniswap.%25&output=json&exclude=expired": { body: [row(2, "uniswap.financial", "2026-10-26T00:00:00")] },
      "https://crt.sh/?q=uniswap-%25&output=json&exclude=expired": { body: [] },
      "https://crt.sh/?q=%25uniswap%25&output=json&exclude=expired": { status: 404, body: "" },
    });
    const r = await searchCt(["uniswap"], since, f.fetch, 1, 0);
    expect(r.hits.map((h) => h.host).sort()).toEqual(["uniswap-airdrop.top", "uniswap.financial"]);
    expect(r.queries).toHaveLength(4);
    expect(r.queries[3].error).toMatch(/404/);
    expect(f.calls.filter((u) => u.includes("%25uniswap%25")).length).toBe(2); // one retry after the 404
  }, 30_000);
});

describe("newly registered domains (WhoisDS)", () => {
  it("unzips the daily list and matches brand names, including leet and one-typo labels", () => {
    const zip = makeZip("domain-names.txt", "supportphantomwallet.com\nun1swap-claim.xyz\nunlswap.org\nbakery.com\n");
    const list = unzipFirst(zip).toString().split("\n").filter(Boolean);
    expect(list).toHaveLength(4);
    const hits = matchNrd(list, ["uniswap", "phantom"], "2026-10-31");
    expect(hits.map((h) => [h.domain, h.match])).toEqual([
      ["supportphantomwallet.com", "contains"],
      ["un1swap-claim.xyz", "contains"],
      ["unlswap.org", "fuzzy"],
    ]);
  });

  it("downloads the last N days via the base64 URL scheme", async () => {
    const now = new Date("2026-11-01T12:00:00Z");
    const f = mockFetch({
      [whoisdsUrl("2026-10-31")]: { body: makeZip("domain-names.txt", "uniswap-rewards.app\n") },
      [whoisdsUrl("2026-10-30")]: { status: 404 },
    });
    expect(whoisdsUrl("2026-10-31")).toContain(Buffer.from("2026-10-31.zip").toString("base64"));
    const r = await searchNrd(["uniswap"], 2, now, f.fetch);
    expect(r.hits.map((h) => h.domain)).toEqual(["uniswap-rewards.app"]);
    expect(r.days[1].error).toMatch(/404/);
  }, 30_000);
});

describe("DNS", () => {
  const nx = Object.assign(new Error("nx"), { code: "ENOTFOUND" });
  const fake: DnsLike = {
    resolve4: async (h) => (h === "live.xyz" ? ["1.2.3.4"] : Promise.reject(nx)),
    resolve6: async () => Promise.reject(nx),
    resolveMx: async (h) => (h === "live.xyz" ? [{ exchange: "mx2.live.xyz", priority: 20 }, { exchange: "mx1.live.xyz", priority: 10 }] : Promise.reject(nx)),
    resolveNs: async (h) => (h === "live.xyz" || h === "parked.xyz" ? ["ns1.example"] : Promise.reject(nx)),
  };
  it("classifies live, registered-only and unregistered names", async () => {
    const [live, parked, none] = await lookupMany(["live.xyz", "parked.xyz", "none.xyz"], fake);
    expect(live).toMatchObject({ registered: true, a: ["1.2.3.4"], mx: ["mx1.live.xyz", "mx2.live.xyz"] });
    expect(parked).toMatchObject({ registered: true, a: [] });
    expect(none).toMatchObject({ registered: false });
    expect(none.error).toBeUndefined();
  });
  it("records resolver errors other than NXDOMAIN", async () => {
    const r = await lookup("x.xyz", { ...fake, resolveNs: async () => Promise.reject(Object.assign(new Error("t"), { code: "ETIMEOUT" })) });
    expect(r.error).toBe("ETIMEOUT");
  });
});

describe("RDAP", () => {
  const domainJson = {
    entities: [
      {
        roles: ["registrar"],
        vcardArray: ["vcard", [["fn", {}, "text", "HOSTINGER operations, UAB"]]],
        publicIds: [{ type: "IANA Registrar ID", identifier: "1636" }],
        entities: [
          {
            roles: ["abuse"],
            vcardArray: ["vcard", [["email", {}, "text", "abuse-tracker@hostinger.com"], ["tel", { type: "voice" }, "uri", "tel:+37064503378"]]],
          },
        ],
      },
    ],
    events: [
      { eventAction: "registration", eventDate: "2026-10-29T10:25:36Z" },
      { eventAction: "expiration", eventDate: "2027-10-29T10:25:36Z" },
    ],
    status: ["client transfer prohibited"],
  };
  const ipJson = {
    name: "CLOUDFLARENET",
    entities: [
      {
        roles: ["registrant"],
        vcardArray: ["vcard", [["fn", {}, "text", "Cloudflare, Inc."]]],
        entities: [{ roles: ["abuse"], vcardArray: ["vcard", [["fn", {}, "text", "Abuse"], ["email", {}, "text", "abuse@cloudflare.com"]]] }],
      },
    ],
  };

  it("parses registrar, IANA id and abuse contact (real response shape)", () => {
    const r = parseDomainRdap("supportphantomwallet.com", domainJson);
    expect(r).toMatchObject({
      registrar: "HOSTINGER operations, UAB",
      ianaId: "1636",
      abuse: { email: "abuse-tracker@hostinger.com", phone: "+37064503378" },
      registered: "2026-10-29T10:25:36Z",
    });
  });

  it("parses IP RDAP and prefers Cloudflare's abuse form", () => {
    const r = parseIpRdap("104.21.32.1", ipJson);
    expect(r.org).toBe("Cloudflare, Inc.");
    expect(r.abuse.email).toBe("abuse@cloudflare.com");
    expect(r.abuse.form).toBe("https://abuse.cloudflare.com/");
  });

  it("uses the IANA bootstrap to find the registry server (mocked)", async () => {
    const f = mockFetch({
      "https://data.iana.org/rdap/dns.json": { body: { services: [[["com", "net"], ["https://rdap.verisign.com/com/v1/"]]] } },
      "https://rdap.verisign.com/com/v1/domain/evil-uniswap.com": { body: domainJson },
      "https://rdap.arin.net/registry/ip/104.21.32.1": { body: ipJson },
    });
    const d = await domainRdap("app.evil-uniswap.com", f.fetch);
    expect(d.domain).toBe("evil-uniswap.com");
    expect(d.abuse.email).toBe("abuse-tracker@hostinger.com");
    const ip = await ipRdap("104.21.32.1", f.fetch);
    expect(ip.org).toBe("Cloudflare, Inc.");
  });

  it("maps platform subdomains to the platform", () => {
    expect(platformFor("aerodrome-duz.pages.dev")?.name).toBe("Cloudflare Pages");
    expect(platformFor("aerodrome.sol.site")?.walletUi).toBe(true);
    expect(platformFor("uniswap.org")).toBeUndefined();
  });
});

describe("wallet blocklists", () => {
  it("parses MetaMask and ScamSniffer formats and matches parent domains", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bw-"));
    const f = mockFetch({
      "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json": { body: { blacklist: ["evil.xyz"], whitelist: [] } },
      "https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/domains.json": { body: ["claim-uni.app"] },
    });
    const b = await loadBlocklists(dir, f.fetch);
    expect(listedOn(b, "app.evil.xyz")).toEqual(["metamask"]);
    expect(listedOn(b, "claim-uni.app")).toEqual(["scamsniffer"]);
    expect(listedOn(b, "fine.org")).toEqual([]);
    expect(parseList("scamsniffer", '["A.com"]').has("a.com")).toBe(true);
  });
});

#!/usr/bin/env -S npx tsx
/**
 * brandwatch scan <brand.json> [more.json ...] [options]
 *
 * Read-only scanner. It never submits reports: it writes report.html (+ .pdf), findings.json and drafts.md.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadBrand } from "./brand.ts";
import type { Fuzzer } from "./domains/permute.ts";
import { Renderer } from "./pages/fetch.ts";
import { renderDraftsMarkdown } from "./reports/markdown.ts";
import { PRODUCT_NAME, renderHtml } from "./reports/html.ts";
import { domainDrafts, tokenDrafts } from "./reports/drafts.ts";
import { scanBrand, type ScanResult } from "./scan.ts";

const HELP = `${PRODUCT_NAME} (brandwatch) - brand-impersonation watch for crypto projects

Usage:
  npm run scan -- <brand.json> [more brand files] [options]
  npx tsx src/cli.ts render <findings.json> [--pdf]   rebuild drafts, report.html and drafts.md from saved findings
                                                     (e.g. after relabelling a false positive by hand)

Options:
  --days <n>          lookback for certificates and tokens (default 30)
  --nrd-days <n>      newly-registered-domain daily lists to read (default 7, 0 = off)
  --out <dir>         output directory (default out/)
  --no-tokens         skip the token watcher
  --no-pages          skip page fetching (DNS + CT only)
  --no-screenshots    HTTP fingerprints only, no Playwright
  --pdf               also write report.pdf (needs Playwright)
  --max-pages <n>     live suspects to fetch (default 300)
  --max-render <n>    suspects to render with screenshots (default 40)
  --max-engine <n>    Base tokens to run through the Canisell risk engine (default 30)
  --dns <ips>         comma-separated DNS resolvers (default: system)
  --fast              skip bitsquatting permutations (fewer DNS queries)
  --hosts <file>      extra hostnames to check, one per line (client reports, earlier finds; marked "added by hand")

Nothing is ever filed or submitted. Reports are drafts for the brand owner to approve.`;

process.on("unhandledRejection", (e) => console.error(`[warn] unhandled rejection: ${(e as Error)?.message ?? e}`));

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      days: { type: "string", default: "30" },
      "nrd-days": { type: "string", default: "7" },
      out: { type: "string", default: "out" },
      "no-tokens": { type: "boolean", default: false },
      "no-pages": { type: "boolean", default: false },
      "no-screenshots": { type: "boolean", default: false },
      pdf: { type: "boolean", default: false },
      "max-pages": { type: "string", default: "300" },
      "max-render": { type: "string", default: "40" },
      "max-engine": { type: "string", default: "30" },
      dns: { type: "string" },
      fast: { type: "boolean", default: false },
      hosts: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (positionals[0] === "render") {
    for (const f of positionals.slice(1)) await rerender(f, !!values.pdf);
    return;
  }
  const args = positionals[0] === "scan" ? positionals.slice(1) : positionals;
  if (values.help || args.length === 0) {
    console.log(HELP);
    process.exit(values.help ? 0 : 1);
  }
  const log = (s: string) => console.error(`${new Date().toISOString().slice(11, 19)} ${s}`);
  for (const file of args) {
    const brand = await loadBrand(file);
    const date = new Date().toISOString().slice(0, 10);
    const slug = brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const dir = resolve(values.out!, `${slug}-${date}`);
    await mkdir(dir, { recursive: true });
    log(`=== ${brand.name}: scanning into ${dir}`);
    const skip: Fuzzer[] = values.fast ? ["bitsquatting"] : [];
    const result = await scanBrand(brand, {
      days: Number(values.days),
      nrdDays: Number(values["nrd-days"]),
      cacheDir: resolve(".cache"),
      shotsDir: join(dir, "shots"),
      tokens: !values["no-tokens"],
      pages: !values["no-pages"],
      screenshots: !values["no-pages"] && !values["no-screenshots"],
      maxPages: Number(values["max-pages"]),
      maxRender: Number(values["max-render"]),
      maxEngine: Number(values["max-engine"]),
      maxRdap: 40,
      skipFuzzers: skip,
      dnsServers: values.dns?.split(",").map((s) => s.trim()),
      extraHosts: values.hosts ? (await readFile(values.hosts, "utf8")).split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim()).filter(Boolean) : [],
      log,
    });
    await writeOutputs(dir, result, !!values.pdf);
    const html = join(dir, "report.html");
    const c = (s: string) => result.domains.filter((d) => d.severity === s).length + result.tokens.filter((t) => t.severity === s).length;
    log(
      `=== ${brand.name}: ${result.domains.length} domains, ${result.tokens.length} tokens | critical ${c("critical")}, high ${c("high")}, medium ${c("medium")}, low ${c("low")}, info ${c("info")}`,
    );
    log(`report: ${html}`);
  }
}

async function rerender(file: string, pdf: boolean) {
  const dir = dirname(resolve(file));
  const result = JSON.parse(await readFile(file, "utf8")) as ScanResult;
  const date = result.startedAt.slice(0, 10);
  for (const d of result.domains) if (d.drafts?.length) d.drafts = domainDrafts(result.brand, d, date);
  for (const t of result.tokens) if (t.drafts?.length) t.drafts = tokenDrafts(result.brand, t, date);
  await writeOutputs(dir, result, pdf);
  console.error(`re-rendered ${dir}`);
}

async function writeOutputs(dir: string, result: ScanResult, pdf: boolean) {
  await writeFile(join(dir, "findings.json"), JSON.stringify(result, null, 2));
  await writeFile(join(dir, "drafts.md"), renderDraftsMarkdown(result));
  const html = join(dir, "report.html");
  await writeFile(html, renderHtml(result, dir));
  if (pdf) {
    const r = new Renderer(dir);
    if (await r.start()) {
      await r.pdf(html, join(dir, "report.pdf"));
      await r.stop();
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

/**
 * Runs the vendored engine CLI (engine/src/cli.ts) unchanged, with one optional switch from outside:
 * MW_SKIP_CT=1 answers crt.sh requests with an immediate error, for when crt.sh is down (it then times out
 * for minutes per query). The engine records the failed queries, and its report shows "incomplete scan".
 */
if (process.env.MW_SKIP_CT === "1") {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("crt.sh")) return new Response("crt.sh skipped: unavailable during this scan", { status: 400 });
    return real(input, init);
  }) as typeof fetch;
}
await import("../engine/src/cli.ts");

# Vendored: Canisell token-risk engine

Copied from the private repo `kacpergumieniuk/canisell` (same owner, 4b47 Crypto Projects), path `api/src/`, commit `3d546a0900b0f90305f9df9b6cb1ffe554c8db04` (2026-11-01).

Files copied unchanged: `risk/*.ts`, `chain/addresses.ts`, `sim/bytecode.ts`, `cache.ts`.
Adapted: `chain/client.ts` (takes RPC URLs directly instead of the API's `Config` type).
Not copied: the x402 paywall, HTTP app, MCP server and `sim/artifact.ts`.

Brandwatch uses `checkToken()` from `risk/verdict.ts` to score copycat tokens on Base (SAFE / CAUTION / DANGER, 0-100,
honeypot simulation, owner powers, liquidity, creator history). Fix bugs upstream in canisell first, then re-copy.

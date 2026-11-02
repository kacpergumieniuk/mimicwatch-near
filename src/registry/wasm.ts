import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../brands.ts";

/** Where `npm run build:contract` writes the registry. */
export const BUILT_WASM = join(ROOT, "contracts/target/near/mimicwatch_registry/mimicwatch_registry.wasm");
/** The committed build that runs on testnet (see contracts/prebuilt/README.md). */
export const PREBUILT_WASM = join(ROOT, "contracts/prebuilt/mimicwatch_registry.wasm");
/** `code_hash` of registry.mimicwatch-e7iig5g5.testnet (view_account): base58 of the sha256 of PREBUILT_WASM. */
export const TESTNET_CODE_HASH = "ugLDXXVgTxz8x3hPWGoKK4KXUbWREoAfnEjzzpugm3B";

/** Your own build if it exists, else the committed one (so the demo runs without Rust). */
export function registryWasm(log: (msg: string) => void = console.log): Uint8Array {
  if (existsSync(BUILT_WASM)) return new Uint8Array(readFileSync(BUILT_WASM));
  if (!existsSync(PREBUILT_WASM)) throw new Error(`${BUILT_WASM} missing: run \`npm run build:contract\` first`);
  log("using the committed contracts/prebuilt/mimicwatch_registry.wasm, the build deployed on testnet (run `npm run build:contract` to build your own)");
  return new Uint8Array(readFileSync(PREBUILT_WASM));
}

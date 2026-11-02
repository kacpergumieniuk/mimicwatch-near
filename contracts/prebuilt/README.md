# Prebuilt registry contract

`mimicwatch_registry.wasm` is the registry contract built with `npm run build:contract` (`cargo near build
non-reproducible-wasm`) at commit `0fb9daa`; the contract source has not changed since. It is the exact file deployed on
testnet: its sha256, in base58, is `ugLDXXVgTxz8x3hPWGoKK4KXUbWREoAfnEjzzpugm3B`, the `code_hash` that `view_account`
returns for `registry.mimicwatch-e7iig5g5.testnet`. `npm test` checks both (`test/prebuilt.test.ts`).

`npm run demo` uses it when `contracts/target/near/` does not exist, so the full demo runs on a machine without Rust.
If you build the contract yourself, your build is used instead. Builds are not reproducible across machines (the
compiler embeds local dependency paths), so your own build will have a different hash.

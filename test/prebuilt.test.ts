import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../src/brands.ts";
import { PREBUILT_WASM, TESTNET_CODE_HASH } from "../src/registry/wasm.ts";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes: Uint8Array): string {
  let n = BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

describe("committed registry build (contracts/prebuilt)", () => {
  const digest = createHash("sha256").update(readFileSync(PREBUILT_WASM)).digest();
  it("matches SHA256SUMS", () => {
    const [hash] = readFileSync(join(ROOT, "contracts/prebuilt/SHA256SUMS"), "utf8").split(/\s+/);
    expect(digest.toString("hex")).toBe(hash);
  });
  it("is the code deployed on testnet (base58 sha256 = code_hash)", () => {
    expect(base58(digest)).toBe(TESTNET_CODE_HASH);
  });
});

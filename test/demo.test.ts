import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

describe("npm run demo (offline, in-memory registry)", () => {
  it("tells the same story from the recorded scan every time", () => {
    const run = () => execFileSync(process.execPath, ["--import", "tsx", join(ROOT, "scripts/demo.ts"), "--fast", "--memory"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, FORCE_COLOR: "0" } });
    const a = run();
    expect(a).toContain("exist on mainnet 507");
    expect(a).toMatch(/linear_protocol\.near\s+critical fake-token/);
    expect(a).toContain("10 approve");
    expect(a).toMatch(/skip\s+79 × review is "pending"/);
    expect(a).toContain("= evidence_hash stored on chain");
    const verdicts = [...a.matchAll(/^\s+(ALLOW|WARN|BLOCK)\s/gm)].map((m) => m[1]);
    expect(verdicts).toEqual(["BLOCK", "BLOCK", "ALLOW", "WARN", "BLOCK", "WARN", "BLOCK"]);
    expect(run()).toBe(a);
  }, 60_000);
});

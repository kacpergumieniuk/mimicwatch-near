/**
 * npm run demo:record [-- --pace 1.2] [--viewer-only]
 *
 * Records `npm run demo -- --osc` into docs/video/:
 *   mimicwatch-demo.cast   asciicast v2 (asciinema play), with viewer events as OSC sequences
 *   transcript.txt         the same run as plain text
 *   viewer.html            self-contained player: terminal, wallet panel, scene captions, subtitles.
 *                          Open it and press Space; ?clean=1 hides the controls; ?t=SECONDS jumps.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../src/brands.ts";

const OUT = join(ROOT, "docs/video");
const CAST = join(OUT, "mimicwatch-demo.cast");
const argv = process.argv.slice(2);
const pi = argv.indexOf("--pace");
const pace = pi >= 0 ? argv[pi + 1] : "1";
/** Longest pause kept in the recording (node start-up and sandbox boot are compressed). */
const MAX_IDLE = 2.5;
mkdirSync(OUT, { recursive: true });

if (!argv.includes("--viewer-only")) {
  const events: Array<[number, string]> = [];
  const start = performance.now();
  let last = 0;
  let shift = 0;
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "scripts/demo.ts"), "--osc", "--pace", pace, ...(argv.includes("--memory") ? ["--memory"] : [])], {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: "1", COLUMNS: "110" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    let t = (performance.now() - start) / 1000 - shift;
    if (t - last > MAX_IDLE) {
      shift += t - last - MAX_IDLE;
      t = last + MAX_IDLE;
    }
    last = t;
    events.push([Number(t.toFixed(3)), chunk.replace(/\r?\n/g, "\r\n")]);
    process.stdout.write(".");
  });
  const code: number = await new Promise((r) => child.on("close", (c) => r(c ?? 1)));
  process.stdout.write("\n");
  if (code !== 0) throw new Error(`demo exited with ${code}`);
  const header = { version: 2, width: 110, height: 48, title: "Mimicwatch for NEAR (NEAR HACKATHON 2026)", env: { TERM: "xterm-256color", SHELL: "/bin/zsh" } };
  writeFileSync(CAST, [JSON.stringify(header), ...events.map(([t, d]) => JSON.stringify([t, "o", d]))].join("\n") + "\n");
  const plain = events.map(([, d]) => d).join("").replace(/\x1b\][^\x07]*\x07/g, "").replace(/\x1b\[[0-9;]*m/g, "").replace(/\r\n/g, "\n");
  writeFileSync(join(OUT, "transcript.txt"), plain);
  console.log(`wrote ${CAST} (${last.toFixed(1)} s, ${events.length} events) and transcript.txt`);
}

const cast = readFileSync(CAST, "utf8");
const logo = readFileSync(join(ROOT, "docs/logo.svg"), "utf8");
const endNote = "Recorded mainnet scan from 2026-11-01, re-scored offline. Registry on a local NEAR node in this video; the same contract is live on NEAR testnet. Review decisions in the demo are recorded. Synthetic voice (Kokoro TTS).";
const tpl = readFileSync(join(ROOT, "scripts/viewer-template.html"), "utf8");
const safe = (s: string) => JSON.stringify(s).replace(/<\//g, "<\\/");
writeFileSync(join(OUT, "viewer.html"), tpl.replace("/*CAST_JSON*/null", safe(cast)).replace('/*LOGO_SVG*/""', safe(logo)).replace('/*END_NOTE*/""', safe(endNote)));
console.log(`wrote ${join(OUT, "viewer.html")}`);

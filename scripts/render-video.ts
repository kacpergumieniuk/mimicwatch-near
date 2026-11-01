/**
 * npm run demo:render   docs/video/mimicwatch-demo.cast + viewer.html -> docs/video/mimicwatch-demo.mp4
 *
 * 1. The narration is the demo's own cue lines (OSC "cue" events in the cast). Each line is spoken with
 *    macOS `say -v Samantha` into its own clip.
 * 2. Timeline: each cue starts when its event appears on screen. Between cues the recording plays at
 *    up to 2.5x speed, or holds on its last frame while the voice finishes.
 * 3. Frames are rendered by seeking viewer.html in headless Chromium (Playwright) and piped to ffmpeg.
 *    Subtitles are drawn by the viewer (burned in) and also added as a soft track and an .srt file.
 * 4. Audio clips are placed with adelay, mixed, loudness-normalised (-16 LUFS) and muxed.
 *
 *   --fps 30   --max-seconds 140 (fails if longer: X's limit without Premium is 2:20)
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { ROOT } from "../src/brands.ts";

const { values } = parseArgs({ options: { fps: { type: "string", default: "30" }, "max-seconds": { type: "string", default: "140" }, voice: { type: "string", default: "Samantha" }, rate: { type: "string", default: "182" } } });
const FPS = Number(values.fps);
const OUT = join(ROOT, "docs/video");
const work = join(tmpdir(), `mw-render-${Date.now()}`);
mkdirSync(work, { recursive: true });
const MAX_SPEED = 2.5;
const GAP = 0.35;
const END_HOLD = 4.2;

// ---------------------------------------------------------------- cues from the cast
const castLines = readFileSync(join(OUT, "mimicwatch-demo.cast"), "utf8").trim().split("\n").slice(1).map((l) => JSON.parse(l) as [number, string, string]);
const castEnd = castLines.at(-1)![0];
const cues: Array<{ id: string; t: number; text: string; say: string }> = [];
let endAt = castEnd;
for (const [t, , d] of castLines)
  for (const m of d.matchAll(/\x1b\]1337;MimicwatchEvent=([A-Za-z0-9+/=]+)\x07/g)) {
    const e = JSON.parse(Buffer.from(m[1], "base64").toString("utf8")) as { type: string; id: string; text: string; say?: string };
    if (e.type === "cue") cues.push({ id: e.id, t, text: e.text, say: e.say ?? e.text });
    if (e.type === "end") endAt = t;
  }
if (!cues.length) throw new Error("no cues in the cast; record with npm run demo:record");

// ---------------------------------------------------------------- voice clips
const dur = (f: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
const clips = cues.map((c, i) => {
  const f = join(work, `cue${String(i).padStart(2, "0")}.aiff`);
  execFileSync("say", ["-v", values.voice!, "-r", values.rate!, "-o", f, c.say]);
  return { ...c, file: f, dur: dur(f) };
});

// ---------------------------------------------------------------- timeline
// map: [videoTime, castTime, speed] anchors; the viewer interpolates (speed, then hold).
const map: Array<[number, number, number]> = [];
const starts: number[] = [];
let v = Math.min(0.6, clips[0].t);
map.push([0, 0, clips[0].t > 0 ? clips[0].t / v : 1]);
for (let i = 0; i < clips.length; i++) {
  if (i > 0) {
    const castSeg = clips[i].t - clips[i - 1].t;
    const span = Math.max(clips[i - 1].dur + GAP, castSeg / MAX_SPEED);
    v = starts[i - 1] + span;
  }
  starts.push(v);
  const nextCast = i + 1 < clips.length ? clips[i + 1].t : endAt;
  const nextSpan = i + 1 < clips.length ? Math.max(clips[i].dur + GAP, (nextCast - clips[i].t) / MAX_SPEED) : Math.max(clips[i].dur + GAP, (nextCast - clips[i].t) / MAX_SPEED);
  map.push([v, clips[i].t, Math.max(1, (nextCast - clips[i].t) / nextSpan)]);
}
const endV = starts.at(-1)! + Math.max(clips.at(-1)!.dur + GAP, (endAt - clips.at(-1)!.t) / MAX_SPEED);
map.push([endV, endAt, 1]);
const total = endV + END_HOLD;
if (total > Number(values["max-seconds"])) throw new Error(`video would be ${total.toFixed(1)} s (limit ${values["max-seconds"]}): shorten the narration or the demo pauses`);
const subs = clips.map((c, i) => ({ start: starts[i], end: Math.min(starts[i] + c.dur + 0.25, i + 1 < clips.length ? starts[i + 1] : total), text: c.text }));
console.log(`${clips.length} cues, video ${total.toFixed(1)} s`);

// ---------------------------------------------------------------- srt
const ts = (s: number) => {
  const ms = Math.round(s * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const srt = subs.map((s, i) => `${i + 1}\n${ts(s.start)} --> ${ts(s.end)}\n${s.text}\n`).join("\n");
writeFileSync(join(OUT, "mimicwatch-demo.en.srt"), srt);

// ---------------------------------------------------------------- audio
const audio = join(work, "voice.m4a");
const inputs = clips.flatMap((c) => ["-i", c.file]);
const filters = clips.map((_, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(starts[i] * 1000)}|${Math.round(starts[i] * 1000)}[a${i}]`).join(";");
execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", `${filters};${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0,apad,atrim=0:${total.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]`, "-map", "[out]", "-c:a", "aac", "-b:a", "160k", audio]);

// ---------------------------------------------------------------- frames
const silent = join(work, "video.mp4");
const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", silent], { stdio: ["pipe", "inherit", "inherit"] });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`file://${join(OUT, "viewer.html")}?clean=1`);
await page.evaluate(([m, s]) => (window as unknown as { __mw: { setTimeline: (a: unknown, b: unknown) => void } }).__mw.setTimeline(m, s), [map, subs] as const);
const frames = Math.ceil(total * FPS);
const shotsDir = join(OUT, "shots");
mkdirSync(shotsDir, { recursive: true });
const stills = new Map(starts.map((s, i) => [Math.round((s + Math.min(clips[i].dur, 3)) * FPS), clips[i].id]));
stills.set(frames - 30, "end");
for (let k = 0; k < frames; k++) {
  await page.evaluate((t) => (window as unknown as { __mw: { seek: (t: number) => void } }).__mw.seek(t), k / FPS);
  const buf = await page.screenshot({ type: "jpeg", quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  const still = stills.get(k);
  if (still) await page.screenshot({ path: join(shotsDir, `${still}.jpg`), type: "jpeg", quality: 85 });
  if (k % 300 === 0) process.stdout.write(`frame ${k}/${frames}\n`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();

// ---------------------------------------------------------------- mux
const mp4 = join(OUT, "mimicwatch-demo.mp4");
execFileSync("ffmpeg", ["-y", "-v", "error", "-i", silent, "-i", audio, "-i", join(OUT, "mimicwatch-demo.en.srt"), "-map", "0:v", "-map", "1:a", "-map", "2", "-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng", "-t", total.toFixed(3), "-movflags", "+faststart", mp4]);
const mb = statSync(mp4).size / 1e6;
console.log(`wrote ${mp4}: ${dur(mp4).toFixed(1)} s, ${mb.toFixed(1)} MB`);
if (mb > 50) throw new Error("over 50 MB");
writeFileSync(join(OUT, "timeline.json"), JSON.stringify({ total, cues: clips.map((c, i) => ({ id: c.id, castT: c.t, videoT: Number(starts[i].toFixed(3)), dur: Number(c.dur.toFixed(3)), text: c.text })) }, null, 2));

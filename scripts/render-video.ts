/**
 * npm run demo:render   docs/video/mimicwatch-demo.cast + viewer.html -> docs/video/mimicwatch-demo.mp4
 *
 * 1. The narration is the demo's own cue lines (OSC "cue" events in the cast; `say` is the spoken form).
 *    Each cue is cut into caption-sized pieces (whole sentences, at most two lines on screen) and every
 *    piece is spoken with Kokoro TTS (local, Apache-2.0) into its own clip, so each caption is on screen
 *    exactly while its words are spoken.
 * 2. Timeline: each cue starts when its event appears on screen. Between cues the recording plays at
 *    up to 2.5x speed, or holds on its last frame while the voice finishes.
 * 3. Frames are rendered by seeking viewer.html in headless Chromium (Playwright) and piped to ffmpeg.
 *    Subtitles are drawn by the viewer (burned in) and also added as a soft track and an .srt file.
 * 4. Audio clips are placed with adelay, mixed, loudness-normalised (-16 LUFS) and muxed.
 *
 *   --voice am_michael   Kokoro voice (--tts say: a macOS voice, default Samantha)
 *   --speed 1.0          Kokoro speed          --tts kokoro|say   (--rate 182: words per minute for say)
 *   --fps 30   --max-seconds 140 (fails if longer: X's limit without Premium is 2:20)
 *   KOKORO_DIR (default ~/.local/kokoro): kokoro-v1.0.onnx, voices-v1.0.bin, tts.py and .venv
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { ROOT } from "../src/brands.ts";

const { values } = parseArgs({
  options: {
    fps: { type: "string", default: "30" },
    "max-seconds": { type: "string", default: "140" },
    tts: { type: "string", default: "kokoro" },
    voice: { type: "string" },
    speed: { type: "string", default: "1.0" },
    rate: { type: "string", default: "182" },
  },
});
const TTS = values.tts!;
if (TTS !== "kokoro" && TTS !== "say") throw new Error("--tts must be kokoro or say");
const VOICE = values.voice ?? (TTS === "kokoro" ? "am_michael" : "Samantha");
const KOKORO = process.env.KOKORO_DIR ?? join(homedir(), ".local/kokoro");
const FPS = Number(values.fps);
const OUT = join(ROOT, "docs/video");
const work = join(tmpdir(), `mw-render-${Date.now()}`);
mkdirSync(work, { recursive: true });
const MAX_SPEED = 2.5;
const GAP = 0.35;
const PIECE_GAP = 0.18;
const END_HOLD = 4.2;
/** Characters that fit in two lines of the burned-in caption (the viewer shrinks the font if a line still wraps to three). */
const MAX_CAPTION = 96;

// ---------------------------------------------------------------- cues from the cast
const castLines = readFileSync(join(OUT, "mimicwatch-demo.cast"), "utf8").trim().split("\n").slice(1).map((l) => JSON.parse(l) as [number, string, string]);
const castEnd = castLines.at(-1)![0];
const cues: Array<{ id: string; t: number; text: string; say: string }> = [];
let endAt = castEnd;
for (const [t, , d] of castLines)
  for (const m of d.matchAll(/\x1b\]1337;MimicwatchEvent=([A-Za-z0-9+/=]+)\x07/g)) {
    const e = JSON.parse(Buffer.from(m[1], "base64").toString("utf8")) as { type: string; id: string; text: string; say?: string };
    if (e.type === "cue") cues.push({ id: e.id, t, text: e.text.trim(), say: (e.say ?? e.text).trim() });
    if (e.type === "end") endAt = t;
  }
if (!cues.length) throw new Error("no cues in the cast; record with npm run demo:record");

// ---------------------------------------------------------------- captions and speech
/** Spoken forms the TTS gets wrong otherwise (the captions keep the written form). */
const SPEECH: Array<[RegExp, string]> = [
  [/\bLiNEAR\b/g, "Linear"],
  [/\bRhea\b/g, "Ria"],
  [/\bUSDC\b/g, "U S D C"],
];
const spoken = (s: string) => SPEECH.reduce((x, [re, to]) => x.replace(re, to), s);
const sentences = (s: string) => s.split(/(?<=[.?!])\s+(?=\S)/);

/** Whole sentences grouped into caption-sized pieces; text and speech are split the same way when they have the same sentences. */
function pieces(text: string, say: string): Array<{ text: string; say: string }> {
  const ts = sentences(text);
  const ss = sentences(say);
  if (ts.length !== ss.length) return [{ text, say }];
  const out: Array<{ text: string; say: string }> = [];
  ts.forEach((t, i) => {
    const last = out.at(-1);
    if (last && last.text.length + 1 + t.length <= MAX_CAPTION) {
      last.text += " " + t;
      last.say += " " + ss[i];
    } else out.push({ text: t, say: ss[i] });
  });
  return out;
}

/** A caption longer than two lines is split at a clause boundary (or a space) near the middle. */
function splitCaption(text: string): string[] {
  if (text.length <= MAX_CAPTION) return [text];
  const target = text.length / Math.ceil(text.length / MAX_CAPTION);
  let best = -1;
  let cost = Infinity;
  for (const m of text.matchAll(/[,:;]?\s/g)) {
    const p = m.index! + m[0].length - 1;
    if (p > MAX_CAPTION || p < 12) continue;
    const c = Math.abs(p - target) + (m[0].length > 1 ? 0 : 14);
    if (c < cost) [best, cost] = [p, c];
  }
  if (best < 0) return [text];
  return [text.slice(0, best).trim(), ...splitCaption(text.slice(best).trim())];
}

const dur = (f: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
function run(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} exited ${c}: ${err.slice(-600)}`))));
  });
}
const speak = (say: string, file: string) =>
  TTS === "kokoro"
    ? run(join(KOKORO, ".venv/bin/python"), [join(KOKORO, "tts.py"), VOICE, values.speed!, spoken(say), file], KOKORO)
    : run("say", ["-v", VOICE, "-r", values.rate!, "-o", file, spoken(say)]);

type Piece = { text: string; say: string; file: string; dur: number; offset: number };
const jobs: Array<{ piece: Piece }> = [];
const plan = cues.map((c, i) => ({
  ...c,
  pieces: pieces(c.text, c.say).map((p, k): Piece => {
    const piece = { ...p, file: join(work, `cue${String(i).padStart(2, "0")}-${k}.${TTS === "kokoro" ? "wav" : "aiff"}`), dur: 0, offset: 0 };
    jobs.push({ piece });
    return piece;
  }),
}));
console.log(`speaking ${jobs.length} pieces of ${cues.length} cues with ${TTS} ${VOICE}${TTS === "kokoro" ? ` at ${values.speed}x` : ""}`);
let next = 0;
await Promise.all(
  Array.from({ length: TTS === "kokoro" ? 3 : 1 }, async () => {
    while (next < jobs.length) {
      const { piece } = jobs[next++];
      await speak(piece.say, piece.file);
      piece.dur = dur(piece.file);
    }
  }),
);
const clips = plan.map((c) => {
  let off = 0;
  for (const p of c.pieces) {
    p.offset = off;
    off += p.dur + PIECE_GAP;
  }
  return { ...c, dur: off - PIECE_GAP };
});

// ---------------------------------------------------------------- timeline
// map: [videoTime, castTime, speed] anchors; the viewer interpolates (speed, then hold).
const map: Array<[number, number, number]> = [];
const starts: number[] = [];
let v = Math.min(0.6, clips[0].t);
map.push([0, 0, clips[0].t > 0 ? clips[0].t / v : 1]);
for (let i = 0; i < clips.length; i++) {
  if (i > 0) v = starts[i - 1] + Math.max(clips[i - 1].dur + GAP, (clips[i].t - clips[i - 1].t) / MAX_SPEED);
  starts.push(v);
  const nextCast = i + 1 < clips.length ? clips[i + 1].t : endAt;
  const nextSpan = Math.max(clips[i].dur + GAP, (nextCast - clips[i].t) / MAX_SPEED);
  map.push([v, clips[i].t, Math.max(1, (nextCast - clips[i].t) / nextSpan)]);
}
const endV = starts.at(-1)! + Math.max(clips.at(-1)!.dur + GAP, (endAt - clips.at(-1)!.t) / MAX_SPEED);
map.push([endV, endAt, 1]);
const total = endV + END_HOLD;
if (total > Number(values["max-seconds"])) throw new Error(`video would be ${total.toFixed(1)} s (limit ${values["max-seconds"]}): shorten the narration, raise --speed or cut the demo pauses`);

// Captions: one per caption-sized part, timed by its own clip (parts of one clip by their share of the characters).
// Inside a cue a caption stays up until the next one starts, so a caption is on screen for every spoken word.
const subs: Array<{ start: number; end: number; text: string }> = [];
clips.forEach((c, i) => {
  const cueSubs: Array<{ start: number; end: number; text: string }> = [];
  for (const p of c.pieces) {
    const parts = splitCaption(p.text);
    const chars = parts.reduce((n, x) => n + x.length, 0);
    let t = starts[i] + p.offset;
    for (const x of parts) {
      const d = (p.dur * x.length) / chars;
      cueSubs.push({ start: t, end: t + d, text: x });
      t += d;
    }
  }
  cueSubs.forEach((s, k) => (s.end = k + 1 < cueSubs.length ? cueSubs[k + 1].start : Math.min(s.end + 0.25, i + 1 < clips.length ? starts[i + 1] : total)));
  subs.push(...cueSubs);
});
console.log(`${clips.length} cues, ${subs.length} captions, video ${total.toFixed(1)} s`);

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
const placed = clips.flatMap((c, i) => c.pieces.map((p) => ({ file: p.file, at: Math.round((starts[i] + p.offset) * 1000) })));
const inputs = placed.flatMap((p) => ["-i", p.file]);
const filters = placed.map((p, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${p.at}|${p.at}[a${i}]`).join(";");
execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", `${filters};${placed.map((_, i) => `[a${i}]`).join("")}amix=inputs=${placed.length}:normalize=0,apad,atrim=0:${total.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]`, "-map", "[out]", "-c:a", "aac", "-b:a", "160k", audio]);

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
writeFileSync(
  join(OUT, "timeline.json"),
  JSON.stringify(
    {
      total,
      voice: TTS === "kokoro" ? `Kokoro TTS ${VOICE} at ${values.speed}x` : `macOS say ${VOICE}`,
      cues: clips.map((c, i) => ({ id: c.id, castT: c.t, videoT: Number(starts[i].toFixed(3)), dur: Number(c.dur.toFixed(3)), text: c.text })),
      captions: subs.map((s) => ({ start: Number(s.start.toFixed(3)), end: Number(s.end.toFixed(3)), text: s.text })),
    },
    null,
    2,
  ),
);

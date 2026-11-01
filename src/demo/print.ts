/** Terminal helpers for the demo: colours, and OSC markers the video viewer reads (invisible in a terminal). */
const tty = process.stdout.isTTY || process.env.FORCE_COLOR === "1";
const wrap = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
export const bold = wrap("1");
export const dim = wrap("2");
export const red = wrap("31");
export const green = wrap("32");
export const yellow = wrap("33");
export const cyan = wrap("36");
export const magenta = wrap("35");

export const verdictTag = (v: string) => {
  const s = ` ${v} `;
  return v === "ALLOW" ? green(bold(s)) : v === "WARN" ? yellow(bold(s)) : red(bold(s));
};
export const sevTag = (s: string) => (s === "critical" ? red(bold(s)) : s === "high" ? red(s) : s === "medium" ? yellow(s) : dim(s));

/** An event for the HTML viewer, as an OSC 1337 sequence (terminals ignore it). */
export function oscEvent(e: Record<string, unknown>): string {
  return `\x1b]1337;MimicwatchEvent=${Buffer.from(JSON.stringify(e)).toString("base64")}\x07`;
}

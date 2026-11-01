/** drafts.md: every draft in copy-paste form, grouped by finding. */
import type { ScanResult } from "../scan.ts";
import { DRAFT_BANNER, type Draft } from "./drafts.ts";

function draftMd(d: Draft): string {
  const fields = d.fields ? `\n${Object.entries(d.fields).map(([k, v]) => `- **${k}:** \`${v}\``).join("\n")}\n` : "";
  const notes = d.notes?.length ? `\n${d.notes.map((n) => `> ${n}`).join("\n")}\n` : "";
  return `### ${d.title}\n\n**File at:** ${d.to}${d.subject ? `  \n**Subject:** ${d.subject}` : ""}\n${fields}\n\`\`\`text\n${d.body}\n\`\`\`\n${notes}`;
}

export function renderDraftsMarkdown(r: ScanResult): string {
  const parts = [`# Draft reports: ${r.brand.name} (${r.startedAt.slice(0, 10)})\n\n**${DRAFT_BANNER}**\n`];
  for (const d of r.domains.filter((x) => x.drafts?.length))
    parts.push(`## ${d.host} (${d.severity}, ${d.label}, ${d.score}/100)\n\n${d.drafts!.map(draftMd).join("\n")}`);
  for (const t of r.tokens.filter((x) => x.drafts?.length))
    parts.push(`## Token ${t.symbol ?? "?"} ${t.address} on ${t.chain} (${t.severity}, ${t.label})\n\n${t.drafts!.map(draftMd).join("\n")}`);
  if (parts.length === 1) parts.push("No findings needed drafts in this scan.");
  return parts.join("\n\n");
}

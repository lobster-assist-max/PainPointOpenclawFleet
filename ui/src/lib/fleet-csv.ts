/**
 * fleet-csv — export a fleet bot roster to a downloadable CSV.
 *
 * The Dashboard shows the fleet in cards/rows, but there was no way to pull the
 * roster out for a review, a spreadsheet, or a report. This builds an
 * RFC-4180-escaped CSV of the key per-bot signals (status, health, channels,
 * sessions, uptime, month cost, gateway) and triggers a client-side download.
 */

import type { BotStatus, BotTag } from "@/api/fleet-monitor";
import { getRoleById } from "@/lib/fleet-roles";
import { getDisplayStatus, formatUptime } from "@/lib/bot-display-helpers";

/** RFC-4180 field escaping: quote + double internal quotes when the value has a comma/quote/newline. */
function csvField(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = [
  "Name",
  "Role",
  "Status",
  "Health",
  "Grade",
  "Channels Connected",
  "Channels Total",
  "Active Sessions",
  "Uptime",
  "Month Cost USD",
  "Tags",
  "Gateway URL",
  "Bot ID",
];

/**
 * Build the CSV text for a list of bots (header row + one row per bot). Pass the
 * fleet `tags` to populate the Tags column (semicolon-joined labels per bot).
 */
export function botsToCsv(bots: BotStatus[], tags: BotTag[] = []): string {
  const tagsByBot = new Map<string, string[]>();
  for (const t of tags) {
    const list = tagsByBot.get(t.botId) ?? [];
    list.push(t.label);
    tagsByBot.set(t.botId, list);
  }
  const rows = bots.map((b) => {
    const role = b.roleId ? getRoleById(b.roleId) : null;
    return [
      b.name,
      role?.title ?? b.roleId ?? "",
      getDisplayStatus(b.connectionState),
      b.healthScore ? b.healthScore.overall : "",
      b.healthScore ? b.healthScore.grade : "",
      b.channelsConnected ?? "",
      b.channelsTotal ?? "",
      b.activeSessions,
      b.uptime != null ? formatUptime(b.uptime) : "",
      b.monthCostUsd != null ? b.monthCostUsd.toFixed(2) : "",
      (tagsByBot.get(b.botId) ?? []).join("; "),
      b.gatewayUrl,
      b.botId,
    ]
      .map(csvField)
      .join(",");
  });
  return [HEADERS.map(csvField).join(","), ...rows].join("\r\n");
}

/**
 * Trigger a client-side download of CSV text. Prepends a UTF-8 BOM (U+FEFF) so
 * Excel renders emoji / 中文 bot names correctly instead of mojibake.
 */
export function downloadCsv(filename: string, csv: string): void {
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

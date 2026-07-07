/**
 * fleet-csv — export a fleet bot roster to a downloadable CSV.
 *
 * The Dashboard shows the fleet in cards/rows, but there was no way to pull the
 * roster out for a review, a spreadsheet, or a report. This builds an
 * RFC-4180-escaped CSV of the key per-bot signals (status, health, channels,
 * sessions, uptime, month cost, gateway) and triggers a client-side download.
 */

import type { BotStatus, BotTag } from "@/api/fleet-monitor";
import { getRoleById, roleTier } from "@/lib/fleet-roles";
import {
  getDisplayStatus,
  formatUptime,
  botNeedsAttention,
  budgetPercent,
  botOverBudget,
  contextPercent,
} from "@/lib/bot-display-helpers";

/** RFC-4180 field escaping: quote + double internal quotes when the value has a comma/quote/newline. */
function csvField(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = [
  "Name",
  "Role",
  "Tier",
  "Skills",
  "Status",
  "Health",
  "Grade",
  "Context %",
  "Channels Connected",
  "Channels Total",
  "Active Sessions",
  "Uptime",
  "Uptime Hours",
  "Month Cost USD",
  "Month Budget USD",
  "Budget %",
  "Over Budget",
  "Alerts",
  "Needs Attention",
  "Tags",
  "Gateway URL",
  "Bot ID",
];

/**
 * Build the CSV text for a list of bots (header row + one row per bot). Pass the
 * fleet `tags` to populate the Tags column (semicolon-joined labels per bot),
 * and `alertsByBot` (firing-alert count per botId) so the export records the two
 * most actionable review signals — the alert count AND a Needs-Attention flag
 * (the union of firing alert / degraded / context pressure / cost overrun). An
 * operator filtering the grid to "Needs attention" then exporting now gets a
 * report that says WHY each bot needs attention, not just which ones do.
 */
export function botsToCsv(
  bots: BotStatus[],
  tags: BotTag[] = [],
  alertsByBot?: Map<string, number>,
): string {
  const tagsByBot = new Map<string, string[]>();
  for (const t of tags) {
    const list = tagsByBot.get(t.botId) ?? [];
    list.push(t.label);
    tagsByBot.set(t.botId, list);
  }
  const rows = bots.map((b) => {
    const role = b.roleId ? getRoleById(b.roleId) : null;
    const alertCount = alertsByBot?.get(b.botId) ?? 0;
    // Context-window occupancy (real signal about a bot nearing its limit) —
    // shown as the ContextBar; via the SHARED contextPercent helper so the
    // exported value can never diverge from the card/list/sort (and picks up its
    // bottom clamp — a stray negative token count reads 0, not a negative %).
    const contextPct = contextPercent(b) ?? "";
    return [
      // Keep the emoji with the name so the export retains the bot's identity
      // ("🦞 小龍蝦"), matching how bots are named everywhere else in the UI.
      b.emoji ? `${b.emoji} ${b.name}` : b.name,
      role?.title ?? b.roleId ?? "",
      // Org tier (Leadership / Department Heads / Individual Contributors) — the
      // grouping/sort/filter dimension the Dashboard uses (#291/#329), now that
      // Phase-1 launch wires the org chart. Records each bot's org position.
      roleTier(b.roleId).label,
      // A bot's capabilities — shown on the card (SkillBadges) + list row, now
      // in the export so a reviewed roster records what each bot can do.
      b.skills.join("; "),
      getDisplayStatus(b.connectionState),
      b.healthScore ? b.healthScore.overall : "",
      b.healthScore ? b.healthScore.grade : "",
      contextPct,
      b.channelsConnected ?? "",
      b.channelsTotal ?? "",
      b.activeSessions,
      b.uptime != null ? formatUptime(b.uptime) : "",
      // Machine-sortable numeric uptime alongside the human "2d 5h" string —
      // the display string sorts as garbage in a spreadsheet ("10d" < "2d"),
      // so a reviewer analyzing stability by uptime needs a real number. Every
      // other metric column is numeric; uptime was the lone display-only one.
      b.uptime != null ? Math.round((b.uptime / 3_600_000) * 10) / 10 : "",
      b.monthCostUsd != null ? b.monthCostUsd.toFixed(2) : "",
      // Month budget alongside cost so a reviewer can see over/under-budget.
      b.monthBudgetUsd != null ? b.monthBudgetUsd.toFixed(2) : "",
      // Budget usage % + an explicit Over-Budget flag (shared helpers) so a
      // reviewer can filter/sort the spreadsheet by budget status directly
      // instead of manually comparing the Cost/Budget columns.
      budgetPercent(b) ?? "",
      botOverBudget(b) ? "Yes" : "No",
      // Two most actionable review signals — the firing-alert count and a
      // Needs-Attention flag (the same union the "attention" filter/chip uses).
      alertCount,
      botNeedsAttention(b, alertCount > 0) ? "Yes" : "No",
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
 * Map the Dashboard's active search token to a short filename slug so an
 * exported triage subset is named for what it is (e.g. filtering to "Failing"
 * then Export CSV → `fleet-grade-f-<date>.csv`, a ready failing-bots report)
 * instead of the generic `fleet-roster-<date>.csv`. A free-text search →
 * "filtered"; no filter → "roster". Mirrors the FilterBar token vocabulary
 * (attention/alerting/degraded/channels/context:high/over-budget/offline/pinned/grade:*).
 */
export function csvFilterSlug(searchQuery: string): string {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return "roster";
  const known: Record<string, string> = {
    attention: "needs-attention",
    alerting: "alerting",
    degraded: "degraded",
    channels: "channels-down",
    "context:high": "context-pressure",
    "over-budget": "over-budget",
    offline: "offline",
    pinned: "pinned",
  };
  if (known[q]) return known[q];
  const grade = /^grade:([a-f]|none)$/.exec(q);
  if (grade) return grade[1] === "none" ? "unscored" : `grade-${grade[1]}`;
  const roleTierMatch = /^role:(leadership|heads|ic|ics|unassigned)$/.exec(q);
  if (roleTierMatch) return `role-${roleTierMatch[1] === "ics" ? "ic" : roleTierMatch[1]}`;
  return "filtered";
}

/**
 * A filesystem-safe slug of a fleet/company name, for prefixing an exported CSV
 * filename so an operator downloading rosters from MULTIPLE fleets can tell them
 * apart (`acme-fleet-roster-<date>.csv` vs a generic `fleet-roster-<date>.csv`).
 * Lowercases, replaces any run of non-alphanumerics with a single hyphen, trims
 * leading/trailing hyphens, and caps length. Falls back to "fleet" when the name
 * has no usable characters (e.g. an all-emoji / 中文 name a filename can't carry).
 */
export function slugifyFleetName(name: string | null | undefined): string {
  const slug = (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "fleet";
}

/**
 * Filesystem-safe capture timestamp for an export filename — "YYYY-MM-DD-HHMM"
 * (local time). The exports previously used a date-only stamp, so two rosters
 * exported on the SAME DAY collided to the identical filename (the browser just
 * appends "(1)", leaving the operator unable to tell them apart). Including the
 * time makes each download distinct AND self-dating in a downloads folder.
 */
export function csvTimestamp(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(
    now.getHours(),
  )}${p(now.getMinutes())}`;
}

/** Trigger a client-side download of a Blob under the given filename. */
function triggerBlobDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Trigger a client-side download of CSV text. Prepends a UTF-8 BOM (U+FEFF) so
 * Excel renders emoji / 中文 bot names correctly instead of mojibake.
 */
export function downloadCsv(filename: string, csv: string): void {
  const bom = String.fromCharCode(0xfeff);
  triggerBlobDownload(filename, new Blob([bom + csv], { type: "text/csv;charset=utf-8;" }));
}

/**
 * Trigger a client-side download of plain text (e.g. a Markdown/standup report).
 * Used as a graceful fallback when the clipboard is unavailable — the operator
 * still gets the generated snapshot as a file instead of losing it entirely.
 */
export function downloadTextFile(filename: string, text: string): void {
  triggerBlobDownload(filename, new Blob([text], { type: "text/plain;charset=utf-8;" }));
}

/**
 * Shared display helpers for bot status rendering.
 * Used by BotStatusCard and BotDetail to avoid duplicated logic.
 */

import { roleTier } from "./fleet-roles";

export type DisplayStatus = "online" | "offline" | "idle";

export function getDisplayStatus(state: string): DisplayStatus {
  if (state === "monitoring") return "online";
  if (state === "dormant" || state === "error" || state === "disconnected") return "offline";
  return "idle"; // connecting, authenticating, backoff
}

export const STATUS_CONFIG: Record<DisplayStatus, { dot: string; label: string; color: string }> = {
  online: { dot: "bg-green-400", label: "Online", color: "text-green-600" },
  offline: { dot: "bg-red-400", label: "Offline", color: "text-red-500" },
  idle: { dot: "bg-yellow-400 animate-pulse", label: "Idle", color: "text-yellow-600" },
};

export function contextBarColor(percent: number): string {
  if (percent > 80) return "bg-red-500";
  if (percent >= 50) return "bg-yellow-500";
  return "bg-green-500";
}

/**
 * Text-color class matching contextBarColor's thresholds (>80 red, ≥50 amber,
 * else muted). Used by the dense list-view row where a compact colored "N%"
 * stands in for the full ContextBar shown on the card.
 */
export function contextTextColor(percent: number): string {
  if (percent > 80) return "text-red-600 dark:text-red-400";
  if (percent >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

/**
 * Context-window occupancy as an integer 0–100, or null when the bot has no
 * live context data (contextTokens / contextMaxTokens unset — e.g. a DB-fallback
 * or just-connected bot). Clamped to [0,100] so a peak context that briefly
 * exceeds the window can't read >100%. Shared by the dashboard card, the list
 * row, and the "context" sort so every surface agrees.
 */
export function contextPercent(bot: {
  contextTokens: number | null;
  contextMaxTokens: number | null;
}): number | null {
  if (
    bot.contextTokens == null ||
    bot.contextMaxTokens == null ||
    bot.contextMaxTokens <= 0
  )
    return null;
  return Math.min(
    100,
    Math.max(0, Math.round((bot.contextTokens / bot.contextMaxTokens) * 100)),
  );
}

/**
 * Month-to-date budget usage as an integer percent (cost / budget * 100), or
 * null when the bot has no budget set (monthBudgetUsd unset/zero) or no known
 * cost. NOT clamped — a value > 100 means the bot has blown past its monthly
 * token budget. Shared by the dashboard card bar, the list-row cost badge, and
 * the "over-budget" filter so every cost surface agrees.
 */
export function budgetPercent(bot: {
  monthCostUsd: number | null;
  monthBudgetUsd: number | null;
}): number | null {
  if (bot.monthBudgetUsd == null || bot.monthBudgetUsd <= 0 || bot.monthCostUsd == null)
    return null;
  return Math.round((bot.monthCostUsd / bot.monthBudgetUsd) * 100);
}

/**
 * True when a bot has spent MORE than its monthly token budget (cost > budget).
 * Only meaningful when a budget is set; a bot with no budget is never
 * over-budget. Surfaces cost overrun — a real operational concern that was
 * otherwise only visible as the red bar on the card.
 */
export function botOverBudget(bot: {
  monthCostUsd: number | null;
  monthBudgetUsd: number | null;
}): boolean {
  return (
    bot.monthBudgetUsd != null &&
    bot.monthBudgetUsd > 0 &&
    bot.monthCostUsd != null &&
    bot.monthCostUsd > bot.monthBudgetUsd
  );
}

/**
 * True when a bot has customer channels configured but at least one is
 * disconnected — i.e. it's reaching fewer (or no) customers than it should.
 * Only meaningful when live channel data is present (channelsTotal populated by
 * the /status metrics cache); returns false in DB-fallback mode where the counts
 * are null, so it never produces a false "channels down" signal offline.
 */
export function botChannelsDown(bot: {
  channelsConnected: number | null;
  channelsTotal: number | null;
}): boolean {
  return (
    bot.channelsTotal != null &&
    bot.channelsTotal > 0 &&
    bot.channelsConnected != null &&
    bot.channelsConnected < bot.channelsTotal
  );
}

/**
 * True when a monitoring (connected) bot is DEGRADED — its customer channels are
 * down or its health grade is low (D/F, overall < 60). A dormant/offline bot is
 * "offline", not "degraded", so this only flags a bot that LOOKS online (green)
 * but isn't serving well. Excludes external signals like firing alerts (which
 * aren't on BotStatus) — the caller ORs those in. Shared by the Sidebar Fleet
 * Pulse so its "degraded" concept stays consistent with the Dashboard.
 */
export function botIsDegraded(bot: {
  connectionState: string;
  channelsConnected: number | null;
  channelsTotal: number | null;
  healthScore: { overall: number } | null;
}): boolean {
  if (bot.connectionState !== "monitoring") return false;
  return botChannelsDown(bot) || (bot.healthScore != null && bot.healthScore.overall < 60);
}

/**
 * True when a connected bot NEEDS ATTENTION — the UNION of the dashboard's
 * problem signals: a firing alert (passed in, since alerts aren't on BotStatus),
 * a DEGRADED state (customer channels down / low health / failing grade), context
 * pressure (over 80% of its context window, at risk of losing conversation
 * history), OR cost overrun (spent more than its monthly token budget). This is
 * the "just show me everything wrong right now" set — the union that the separate
 * alerting/degraded/channels/context/over-budget filters each cover only one slice
 * of. An offline bot is a separate category (its own "offline" filter + Bots
 * Online KPI), so it's deliberately NOT folded in here — this flags a *connected*
 * bot that isn't healthy or is overspending.
 */
export function botNeedsAttention(
  bot: {
    connectionState: string;
    channelsConnected: number | null;
    channelsTotal: number | null;
    healthScore: { overall: number } | null;
    contextTokens: number | null;
    contextMaxTokens: number | null;
    monthCostUsd: number | null;
    monthBudgetUsd: number | null;
  },
  hasAlert: boolean,
): boolean {
  return (
    hasAlert ||
    botIsDegraded(bot) ||
    (contextPercent(bot) ?? -1) > 80 ||
    botOverBudget(bot)
  );
}

/**
 * Canonical A–F grade letter for a 0–100 health score. Same thresholds as the
 * server `fleetHealthGrade` and the color helpers below, so a grade letter
 * derived on the client (e.g. from a computed fleet average) agrees with the
 * per-bot `healthScore.grade` returned by the server.
 */
export function healthGradeLetter(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Tailwind classes for a health-score badge, keyed by the 0–100 overall score.
 * A→green, B→emerald, C→yellow, D→orange, F→red — so a connected-but-degraded bot
 * (e.g. all customer channels down → health 50) reads amber/red at a glance
 * instead of hiding behind a solid-green "Online" connection dot.
 */
export function healthBadgeClasses(score: number): string {
  if (score >= 90) return "bg-green-500/15 text-green-600 dark:text-green-400";
  if (score >= 75) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400";
  if (score >= 40) return "bg-orange-500/15 text-orange-600 dark:text-orange-400";
  return "bg-red-500/15 text-red-600 dark:text-red-400";
}

/**
 * Solid text color for a 0–100 health score, aligned to the canonical grade
 * thresholds (A green, B teal, C yellow, D orange, F red — same buckets as
 * `healthBadgeClasses` and the server `fleetHealthGrade`). Use this instead of
 * ad-hoc 80/60 cutoffs so a score's color always agrees with the grade letter
 * shown beside it and with the dashboard health badge (previously a grade-B
 * score of 85 rendered in "excellent" green on the Bot Detail page).
 */
export function healthScoreTextColor(score: number): string {
  if (score >= 90) return "text-green-600 dark:text-green-400";
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
  if (score >= 40) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

/** Bar fill color for a 0–100 health score — same grade-aligned thresholds as {@link healthScoreTextColor}. */
export function healthScoreBarColor(score: number): string {
  if (score >= 90) return "bg-green-500";
  if (score >= 75) return "bg-emerald-500";
  if (score >= 60) return "bg-yellow-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/**
 * Human-readable uptime from a millisecond duration. Shared by the Bot Detail
 * page and the dashboard card so both format uptime identically (was a private
 * copy in BotDetail.tsx).
 */
export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

const CHANNEL_DISPLAY_NAMES: Record<string, string> = {
  line: "LINE",
  telegram: "Telegram",
  discord: "Discord",
  whatsapp: "WhatsApp",
  slack: "Slack",
  signal: "Signal",
  msteams: "MS Teams",
  web: "Web Chat",
  direct: "Direct",
  group: "Group",
  cron: "Cron Jobs",
};

export function channelDisplayName(channel: string): string {
  return CHANNEL_DISPLAY_NAMES[channel] ?? channel.charAt(0).toUpperCase() + channel.slice(1);
}

/**
 * Client-side session-key → messaging-channel inference. Single source of truth
 * on the client, mirroring the server's `inferChannelFromSessionKey`
 * (server/src/services/fleet-channels.ts) — the same parsing was previously
 * duplicated inline across fleet components.
 *
 * Session-key shapes:
 *   ...:channel:<name>:...  → the explicit channel name (line, telegram, …)
 *   ...:peer:...            → "direct" (1:1 DM)
 *   ...:guild:...           → "group"
 *   cron:...                → "cron" (scheduled run)
 *   anything else           → "other"
 */
export function inferChannelFromSessionKey(sessionKey: string | undefined | null): string {
  const key = sessionKey ?? "";
  if (key.includes(":channel:")) {
    const m = key.match(/:channel:(\w+)/);
    return m ? m[1] : "other";
  }
  if (key.includes(":peer:")) return "direct";
  if (key.includes(":guild:")) return "group";
  if (key.includes("cron:")) return "cron";
  return "other";
}

/**
 * Human-readable label for a fleet audit-log action key (e.g. `bot.connect`,
 * `bot.workshop.file.write`, `budget.create`). Every fleet write operation is
 * audited under a dotted action key; this maps the common ones to a friendly
 * phrase for the dashboard Recent Activity feed, falling back to a title-cased
 * de-dotted rendering for anything unmapped so a new action type still reads
 * sensibly instead of showing a raw key.
 */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  "bot.connect": "Connected bot",
  "bot.disconnect": "Disconnected bot",
  "bot.avatar.upload": "Updated avatar",
  "bot.avatar.delete": "Removed avatar",
  "tag.add": "Added tag",
  "tag.remove": "Removed tag",
  "budget.create": "Created budget",
  "budget.delete": "Deleted budget",
  "bot.workshop.file.write": "Edited identity file",
  "bot.workshop.file.delete": "Deleted identity file",
  "bot.workshop.personality.snapshot": "Snapshotted personality",
  "bot.workshop.personality.rollback": "Rolled back personality",
  "bot.workshop.memory.inject": "Added memory",
  "bot.workshop.memory.delete": "Removed memory",
  "bot.workshop.skill.install": "Installed skill",
};

/**
 * The complete set of fleet audit-log action keys the server records
 * (`recordAudit`/`auditWorkshopWrite`). The AuditLog page filters server-side, so
 * a dropdown built from only the currently-loaded (already-filtered) page would
 * collapse to a single option the moment a filter is applied — the operator
 * couldn't switch to a different action. Exposing the full known vocabulary keeps
 * the filter freely switchable regardless of what's on the current page.
 */
export const KNOWN_FLEET_AUDIT_ACTIONS: readonly string[] = Object.keys(AUDIT_ACTION_LABELS);

export function describeAuditAction(action: string): string {
  const mapped = AUDIT_ACTION_LABELS[action];
  if (mapped) return mapped;
  return action
    .split(/[.:_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * A concise specific for an audit entry drawn from its `details` payload —
 * e.g. the tag label, the edited file path, the memory name, the installed
 * skill. Surfaced next to the action label so a feed reads "Added tag ·
 * production" instead of the vaguer "Added tag". Returns null when there's no
 * useful specific (connect/avatar carry only internal ids). Best-effort: the
 * details shape is server-defined, so every field access is type-guarded.
 */
export function describeAuditDetail(
  action: string,
  details: Record<string, unknown> | undefined | null,
): string | null {
  if (!details || typeof details !== "object") return null;
  const str = (k: string): string | null => {
    const v = (details as Record<string, unknown>)[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  switch (action) {
    case "tag.add":
      return str("label") ?? str("tag");
    case "tag.remove":
      return str("tag");
    case "bot.workshop.file.write":
    case "bot.workshop.file.delete":
      return str("filePath");
    case "bot.workshop.personality.snapshot":
      return str("description");
    case "bot.workshop.memory.inject":
      return str("name");
    case "bot.workshop.memory.delete": {
      // Server sends { memoryPath } like "memory/greeting.md" — show the
      // filename (sans dir + .md) so it reads "Removed memory · greeting",
      // matching the specific shown for memory.inject.
      const path = str("memoryPath");
      if (!path) return null;
      return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
    }
    case "bot.workshop.skill.install":
      return str("skillName");
    case "budget.create":
    case "budget.delete": {
      // { scope, scopeId, monthlyLimitUsd } — show a scope + limit label so the
      // feed reads "Created budget · fleet-wide · $100/mo" instead of leaving the
      // budget's UUID as the only (meaningless) specific.
      const limit = (details as Record<string, unknown>).monthlyLimitUsd;
      const limitStr =
        typeof limit === "number" && Number.isFinite(limit) ? `$${limit}/mo` : null;
      const scope = str("scope");
      const scopeLabel = scope === "fleet" ? "fleet-wide" : scope ? `${scope} budget` : null;
      return [scopeLabel, limitStr].filter(Boolean).join(" · ") || null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Tag helpers (shared by BotTagsManager + the Dashboard bulk-tag action)
// ---------------------------------------------------------------------------

/** The tag categories the server accepts (matches BotTag["category"]). */
export type TagCategory = "environment" | "channel" | "team" | "model" | "custom";

/** Each category's default chip color. Single source of truth for the tag UI. */
export const TAG_CATEGORIES: { value: TagCategory; label: string; color: string }[] = [
  { value: "environment", label: "Environment", color: "#2A9D8F" },
  { value: "channel", label: "Channel", color: "#D4A373" },
  { value: "team", label: "Team", color: "#8B5CF6" },
  { value: "model", label: "Model", color: "#3B82F6" },
  { value: "custom", label: "Custom", color: "#6B7280" },
];

/** Slugify a human tag label into a tag key (server caps the key at 64 chars). */
export function slugifyTag(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

// ---------------------------------------------------------------------------
// Filter-token autocomplete (shared by the Dashboard FilterBar search box)
// ---------------------------------------------------------------------------

/**
 * The special search tokens the Dashboard grid understands, with a human label
 * and a one-line hint. Single source of truth for the search-box autocomplete
 * dropdown — surfaces the FULL token vocabulary (including non-problem tokens
 * like grade:a / role:leadership / pinned that have no QuickFilter chip) at the
 * point of typing, so an operator doesn't have to memorize the exact strings.
 * Keep in sync with the token clauses in FilterBar.useFilteredBots.
 */
export interface FilterTokenSuggestion {
  token: string;
  label: string;
  hint: string;
}

export const FILTER_TOKEN_SUGGESTIONS: FilterTokenSuggestion[] = [
  { token: "attention", label: "Needs attention", hint: "alerting, degraded, over budget, or high context" },
  { token: "alerting", label: "Alerting", hint: "bots with firing alerts" },
  { token: "degraded", label: "Degraded", hint: "channels down or low health" },
  { token: "channels", label: "Channels down", hint: "customer channels disconnected" },
  { token: "over-budget", label: "Over budget", hint: "past monthly token budget" },
  { token: "context:high", label: "Context pressure", hint: "over 80% of context window used" },
  { token: "offline", label: "Offline", hint: "disconnected bots" },
  { token: "idle", label: "Idle", hint: "connected but not active" },
  { token: "online", label: "Online", hint: "actively monitoring" },
  { token: "pinned", label: "Pinned", hint: "your pinned bots" },
  { token: "grade:a", label: "Grade A", hint: "health 90+" },
  { token: "grade:b", label: "Grade B", hint: "health 75–89" },
  { token: "grade:c", label: "Grade C", hint: "health 60–74" },
  { token: "grade:d", label: "Grade D", hint: "health 40–59" },
  { token: "grade:f", label: "Grade F (failing)", hint: "health under 40" },
  { token: "grade:none", label: "Unscored", hint: "no health score yet" },
  { token: "role:leadership", label: "Leadership", hint: "CEO / C-suite" },
  { token: "role:heads", label: "Department heads", hint: "role level 3" },
  { token: "role:ic", label: "Individual contributors", hint: "role level 4" },
  { token: "role:unassigned", label: "Unassigned", hint: "no known org role" },
];

/**
 * Match a (partial) search query against the known filter tokens, returning the
 * suggestions to offer in the autocomplete dropdown. Matches on the token OR its
 * label (case-insensitive substring), and never suggests a token the query is
 * already exactly (so applying a suggestion closes the dropdown). Returns [] for
 * an empty query — the dropdown stays closed until the operator starts typing.
 */
export function matchFilterTokens(query: string): FilterTokenSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return FILTER_TOKEN_SUGGESTIONS.filter(
    (s) => s.token !== q && (s.token.includes(q) || s.label.toLowerCase().includes(q)),
  );
}

/**
 * A human-readable label for the Dashboard's active search filter, used to scope
 * a copied fleet summary to the displayed subset (e.g. "Over budget", "Grade F
 * (failing)"). Maps a known filter token to its FILTER_TOKEN_SUGGESTIONS label; a
 * free-text search → `matching "<query>"`; an empty query → null. Single source
 * of truth for the token→label mapping, kept in sync with the search vocabulary.
 */
export function filterScopeLabel(searchQuery: string): string | null {
  const q = searchQuery.trim();
  if (!q) return null;
  const known = FILTER_TOKEN_SUGGESTIONS.find((s) => s.token === q.toLowerCase());
  if (known) return known.label;
  return `matching "${q}"`;
}

// Structural subset of BotStatus needed to summarise fleet state (kept
// structural so this helper doesn't import from the api layer). BotStatus
// satisfies it, so callers pass their live bot list directly.
export interface FleetSummaryBot {
  botId: string;
  name: string;
  emoji: string;
  connectionState: string;
  healthScore: { overall: number } | null;
  channelsConnected: number | null;
  channelsTotal: number | null;
  contextTokens: number | null;
  contextMaxTokens: number | null;
  monthCostUsd: number | null;
  monthBudgetUsd: number | null;
  roleId?: string | null;
}

/**
 * A concise, paste-ready text snapshot of fleet state — an optional captured-at
 * timestamp, a one-line headline, the grade distribution, the org-tier
 * composition, a fleet-wide channel reachability line, the top spenders by month
 * cost, a named list of the bots
 * needing attention (with WHY), and a named list of the offline bots. For a
 * standup, a Slack update, or a demo hand-off. Complements the CSV roster export
 * (spreadsheet) and the shareable view URL (link) with plain text you can drop
 * into a chat. `capturedAt` is passed by the caller (kept out of the pure helper
 * so it stays testable) and, when present, stamps the snapshot with "as of when"
 * — a pasted standup snapshot loses its meaning without the time it was taken.
 * `scopeLabel` (e.g. "Over budget") scopes the snapshot to the passed subset so a
 * filtered Copy-summary gives a targeted message about exactly those bots, like
 * how Export CSV respects the active filter — the headline reads "Fleet (Over
 * budget): …" instead of implying the whole fleet.
 * `fleetName` (the company/fleet name) heads the snapshot so an operator managing
 * MULTIPLE fleets can tell pasted snapshots apart — "Acme Fleet: …" instead of a
 * generic "Fleet: …" that's identical across every fleet.
 */
export function fleetSummaryText(
  bots: FleetSummaryBot[],
  alertsByBot?: Map<string, number>,
  capturedAt?: Date,
  scopeLabel?: string,
  fleetName?: string,
): string {
  const stamp = capturedAt
    ? capturedAt.toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const base = fleetName?.trim() || "Fleet";
  const heading = scopeLabel ? `${base} (${scopeLabel})` : base;
  const total = bots.length;
  if (total === 0)
    return `${stamp ? `As of ${stamp}\n` : ""}${heading}: ${
      scopeLabel ? "no bots match this filter" : "no bots connected"
    }.`;

  const online = bots.filter((b) => b.connectionState === "monitoring").length;
  const offline = bots.filter((b) => getDisplayStatus(b.connectionState) === "offline").length;
  const scored = bots.filter((b) => b.healthScore != null);
  const avgHealth = scored.length
    ? Math.round(
        scored.reduce((s, b) => s + (b.healthScore?.overall ?? 0), 0) / scored.length,
      )
    : null;
  const needing = bots.filter((b) =>
    botNeedsAttention(b, (alertsByBot?.get(b.botId) ?? 0) > 0),
  );
  // Month-to-date spend + over-budget count — core standup figures the summary
  // previously omitted (both already on the bot; the CSV/KPIs surface them).
  const monthSpend = bots.reduce((s, b) => s + (b.monthCostUsd ?? 0), 0);
  const overBudget = bots.filter(botOverBudget).length;

  const head = [
    `${total} bot${total !== 1 ? "s" : ""}`,
    `${online} online`,
    offline > 0 ? `${offline} offline` : null,
    avgHealth != null ? `avg health ${avgHealth} (${healthGradeLetter(avgHealth)})` : null,
    monthSpend > 0 ? `$${monthSpend.toFixed(2)} this month` : null,
    overBudget > 0 ? `${overBudget} over budget` : null,
    // "all healthy" ONLY when every bot is online and none needs attention.
    // Offline bots aren't in the `needing` union, so a fleet where bots are
    // offline (or idle/connecting) must NOT claim "all healthy" — that would
    // contradict the "N offline" segment. The offline/online counts tell the
    // story in that case, so append no positive claim.
    needing.length > 0
      ? `${needing.length} need attention`
      : online === total
        ? "all healthy"
        : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const lines = stamp ? [`As of ${stamp}`, `${heading}: ${head}`] : [`${heading}: ${head}`];
  // Grade distribution — the composition the average hides (a "82 avg" fleet
  // could be all-C or mostly-A-with-two-Fs). Surfaced as the Health Distribution
  // bar on the Dashboard (#315); folded into the copyable snapshot for standups.
  // Online-but-unscored bots (just launched, awaiting the first health check) are
  // counted so a freshly-launched fleet — the primary demo state — isn't blank on
  // health. Offline bots are excluded (they're on their own "Offline:" line).
  const unscoredOnline = bots.filter(
    (b) => b.connectionState === "monitoring" && b.healthScore == null,
  ).length;
  if (scored.length > 0 || unscoredOnline > 0) {
    const counts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const b of scored) counts[healthGradeLetter(b.healthScore?.overall ?? 0)]++;
    const parts = (["A", "B", "C", "D", "F"] as const)
      .filter((g) => counts[g] > 0)
      .map((g) => `${counts[g]}${g}`);
    if (unscoredOnline > 0) parts.push(`${unscoredOnline} unscored`);
    lines.push(`Health: ${parts.join(" · ")}`);
  }
  // Org composition — the fleet's shape by org tier (the hierarchy the fleet is
  // built around, surfaced as the CSV Tier column #352 and the Role grouping
  // #291). A standup wants "who's in the org", not just headcount. Shown only
  // when at least one bot has a known role tier — an all-ConnectBot fleet with
  // only coarse roles would otherwise render a meaningless "N Unassigned".
  const tierCounts = [0, 0, 0, 0]; // Leadership · Heads · ICs · Unassigned
  for (const b of bots) tierCounts[roleTier(b.roleId).order]++;
  const assigned = tierCounts[0] + tierCounts[1] + tierCounts[2];
  if (assigned > 0) {
    const orgParts: string[] = [];
    if (tierCounts[0] > 0) orgParts.push(`${tierCounts[0]} Leadership`);
    if (tierCounts[1] > 0) orgParts.push(`${tierCounts[1]} Heads`);
    if (tierCounts[2] > 0) orgParts.push(`${tierCounts[2]} ICs`);
    if (tierCounts[3] > 0) orgParts.push(`${tierCounts[3]} unassigned`);
    lines.push(`Org: ${orgParts.join(" · ")}`);
  }
  // Fleet-level customer reachability — "are we reachable by customers?" is a
  // core standup question the snapshot never answered at the fleet level. The
  // attention list flags individual channels-down bots, but a standup wants the
  // total: sum the per-bot channel counts (only bots with channels configured
  // contribute). Flagged when any channel is down so it reads as a concern.
  const chTotal = bots.reduce((s, b) => s + (b.channelsTotal ?? 0), 0);
  const chConnected = bots.reduce((s, b) => s + (b.channelsConnected ?? 0), 0);
  if (chTotal > 0) {
    const down = chTotal - chConnected;
    lines.push(
      `Channels: ${chConnected}/${chTotal} customer channels connected${
        down > 0 ? ` (${down} down)` : ""
      }`,
    );
  }
  // Top spenders — a cost-review standup asks "where is the money going?", which
  // the over-budget count doesn't answer (a bot with NO budget set but heavy
  // spend is invisible to it). Name the top few bots by month-to-date cost so the
  // "$X this month" headline has a breakdown. Only bots that have actually spent
  // contribute, and the line is shown only when there's meaningful fleet spend.
  if (monthSpend > 0) {
    const spenders = bots
      .filter((b) => (b.monthCostUsd ?? 0) > 0)
      .sort((a, b) => (b.monthCostUsd ?? 0) - (a.monthCostUsd ?? 0))
      .slice(0, 3);
    if (spenders.length > 0) {
      const items = spenders.map(
        (b) => `${b.emoji ? b.emoji + " " : ""}${b.name} $${(b.monthCostUsd ?? 0).toFixed(2)}`.trim(),
      );
      lines.push(`Top spend: ${items.join(", ")}`);
    }
  }
  if (needing.length > 0) {
    const items = needing.slice(0, 12).map((b) => {
      const reasons: string[] = [];
      if ((alertsByBot?.get(b.botId) ?? 0) > 0) reasons.push("alerting");
      if (botChannelsDown(b)) reasons.push("channels down");
      if (botOverBudget(b)) reasons.push("over budget");
      if ((contextPercent(b) ?? -1) > 80) reasons.push("context high");
      if (!reasons.length && b.healthScore != null && b.healthScore.overall < 60)
        reasons.push("low health");
      const name = `${b.emoji ? b.emoji + " " : ""}${b.name}`.trim();
      return `${name}${reasons.length ? ` (${reasons.join(", ")})` : ""}`;
    });
    const extra = needing.length > 12 ? ` +${needing.length - 12} more` : "";
    lines.push(`Needs attention: ${items.join(", ")}${extra}`);
  }
  // Named list of the OFFLINE bots — the headline says "3 offline" but a standup
  // needs to know WHICH bots to reconnect. Offline bots aren't in the "needs
  // attention" union (they're a separate category), so surface them on their own
  // line. Capped like the attention list to keep the snapshot compact.
  const offlineBots = bots.filter(
    (b) => getDisplayStatus(b.connectionState) === "offline",
  );
  if (offlineBots.length > 0) {
    const names = offlineBots
      .slice(0, 12)
      .map((b) => `${b.emoji ? b.emoji + " " : ""}${b.name}`.trim());
    const extra = offlineBots.length > 12 ? ` +${offlineBots.length - 12} more` : "";
    lines.push(`Offline: ${names.join(", ")}${extra}`);
  }
  return lines.join("\n");
}

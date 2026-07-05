/**
 * Shared display helpers for bot status rendering.
 * Used by BotStatusCard and BotDetail to avoid duplicated logic.
 */

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

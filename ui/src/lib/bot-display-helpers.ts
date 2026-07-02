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
 * Tailwind classes for a health-score badge, keyed by the 0–100 overall score.
 * A→green, B→teal, C→yellow, D→orange, F→red — so a connected-but-degraded bot
 * (e.g. all customer channels down → health 50) reads amber/red at a glance
 * instead of hiding behind a solid-green "Online" connection dot.
 */
export function healthBadgeClasses(score: number): string {
  if (score >= 90) return "bg-green-500/15 text-green-600 dark:text-green-400";
  if (score >= 75) return "bg-teal-500/15 text-teal-600 dark:text-teal-400";
  if (score >= 60) return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400";
  if (score >= 40) return "bg-orange-500/15 text-orange-600 dark:text-orange-400";
  return "bg-red-500/15 text-red-600 dark:text-red-400";
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
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

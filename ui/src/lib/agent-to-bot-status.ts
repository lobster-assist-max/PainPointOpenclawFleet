/**
 * Maps a DB Agent record to the BotStatus shape used by fleet UI components.
 * Used as fallback when the fleet-monitor sidecar is not running.
 */

import type { Agent } from "@paperclipai/shared";
import type { BotStatus } from "@/api/fleet-monitor";

export function agentToBotStatus(a: Agent): BotStatus {
  const meta = (a.metadata ?? {}) as Record<string, unknown>;
  const config = (a.adapterConfig ?? {}) as Record<string, unknown>;
  // The bot's emoji lives in metadata.emoji. `a.icon` is a lucide icon-name
  // key (e.g. "bot") for the standard agent UI — never render it as an emoji.
  // Older ConnectBot records stored the raw emoji in `icon`, so fall back to
  // it only when it isn't a plain lucide-name token.
  const metaEmoji = typeof meta.emoji === "string" ? meta.emoji : "";
  const iconIsEmoji = a.icon != null && a.icon !== "" && !/^[a-z0-9-]+$/i.test(a.icon);
  return {
    botId: a.id,
    agentId: a.id,
    name: a.name,
    emoji: metaEmoji || (iconIsEmoji ? a.icon! : ""),
    connectionState: a.status === "active" ? "monitoring" : "dormant",
    healthScore: null,
    freshness: { lastUpdated: String(a.updatedAt ?? a.createdAt), source: "cached", staleAfterMs: 60000 },
    gatewayUrl: (config.gatewayUrl as string) ?? "",
    gatewayVersion: null,
    channels: [],
    activeSessions: 0,
    uptime: null,
    avatar: null,
    // Prefer the rich fleet role ID preserved in metadata (e.g. "head-sales",
    // "coo") over the coarse DB `role` enum, so the org chart and pixel-art
    // avatar palette can colour by exact department.
    roleId: (typeof meta.roleId === "string" ? meta.roleId : null) ?? a.role ?? null,
    description: a.title ?? null,
    contextTokens: (meta.contextTokens as number) ?? null,
    contextMaxTokens: (meta.contextMaxTokens as number) ?? null,
    monthCostUsd: a.spentMonthlyCents > 0 ? a.spentMonthlyCents / 100 : null,
    monthBudgetUsd: a.budgetMonthlyCents > 0 ? a.budgetMonthlyCents / 100 : null,
    skills: (meta.skills as string[]) ?? [],
  };
}

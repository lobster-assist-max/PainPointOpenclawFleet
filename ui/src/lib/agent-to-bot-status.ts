/**
 * Maps a DB Agent record to the BotStatus shape used by fleet UI components.
 * Used as fallback when the fleet-monitor sidecar is not running.
 */

import type { Agent } from "@paperclipai/shared";
import type { BotStatus } from "@/api/fleet-monitor";

export function agentToBotStatus(a: Agent): BotStatus {
  const meta = (a.metadata ?? {}) as Record<string, unknown>;
  const config = (a.adapterConfig ?? {}) as Record<string, unknown>;
  return {
    botId: a.id,
    agentId: a.id,
    name: a.name,
    emoji: a.icon ?? "",
    connectionState: a.status === "active" ? "monitoring" : "dormant",
    healthScore: null,
    freshness: { lastUpdated: String(a.updatedAt ?? a.createdAt), source: "cached", staleAfterMs: 60000 },
    gatewayUrl: (config.gatewayUrl as string) ?? "",
    gatewayVersion: null,
    channels: [],
    activeSessions: 0,
    uptime: null,
    avatar: null,
    roleId: a.role ?? null,
    description: a.title ?? null,
    contextTokens: (meta.contextTokens as number) ?? null,
    contextMaxTokens: (meta.contextMaxTokens as number) ?? null,
    monthCostUsd: a.spentMonthlyCents > 0 ? a.spentMonthlyCents / 100 : null,
    monthBudgetUsd: a.budgetMonthlyCents > 0 ? a.budgetMonthlyCents / 100 : null,
    skills: (meta.skills as string[]) ?? [],
  };
}

/**
 * React Query hooks for Fleet Monitor data.
 *
 * Each hook wraps a fleet-monitor API call with proper query keys,
 * staleness config, and automatic refetching.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useCompany } from "@/context/CompanyContext";
import {
  fleetMonitorApi,
  fleetAlertsApi,
  type FleetStatus,
  type BotStatus,
  type BotHealthScore,
  type AlertState,
  type ConnectBotRequest,
  type AgentTurnTrace,
  type DiscoveredGateway,
  type BotTag,
} from "@/api/fleet-monitor";

// ---------------------------------------------------------------------------
// Fleet-level hooks
// ---------------------------------------------------------------------------

/** All connected bots + aggregate fleet health. Refetches every 10s. */
export function useFleetStatus() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.status(selectedCompanyId!),
    queryFn: () => fleetMonitorApi.status(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

/** Derive a single bot from fleet status (avoids extra API call). */
export function useBotFromFleet(botId: string | undefined): BotStatus | undefined {
  const { data: fleet } = useFleetStatus();
  if (!fleet || !botId) return undefined;
  return fleet.bots.find((b) => b.botId === botId);
}

// ---------------------------------------------------------------------------
// Bot-level hooks
// ---------------------------------------------------------------------------

/** Bot health score with 15s refresh. */
export function useBotHealth(botId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.botHealth(botId!),
    queryFn: () => fleetMonitorApi.botHealth(botId!),
    enabled: !!botId,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** Bot sessions list. */
export function useBotSessions(botId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.botSessions(botId!),
    queryFn: () => fleetMonitorApi.botSessions(botId!),
    enabled: !!botId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Bot token usage for a date range. */
export function useBotUsage(botId: string | undefined, from?: string, to?: string) {
  return useQuery({
    queryKey: queryKeys.fleet.botUsage(botId!, from, to),
    queryFn: () => fleetMonitorApi.botUsage(botId!, from, to),
    enabled: !!botId,
    staleTime: 60_000,
  });
}

/** Bot identity (name, emoji, avatar). */
export function useBotIdentity(botId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.botIdentity(botId!),
    queryFn: () => fleetMonitorApi.botIdentity(botId!),
    enabled: !!botId,
    staleTime: 300_000, // identity rarely changes
  });
}

/** Bot channels status. */
export function useBotChannels(botId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.botChannels(botId!),
    queryFn: () => fleetMonitorApi.botChannels(botId!),
    enabled: !!botId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Bot cron jobs. */
export function useBotCron(botId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.botCron(botId!),
    queryFn: () => fleetMonitorApi.botCron(botId!),
    enabled: !!botId,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

/** Fleet alerts with optional state filter. Refetches every 15s. */
export function useFleetAlerts(state?: AlertState) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.alerts(selectedCompanyId!, state),
    queryFn: () => fleetAlertsApi.list(selectedCompanyId!, state),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

// ---------------------------------------------------------------------------
// Agent Turn Traces
// ---------------------------------------------------------------------------

/** Recent traces for a bot. Refetches every 10s. */
export function useBotTraces(botId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.botTraces(botId!),
    queryFn: () => fleetMonitorApi.botTraces(botId!),
    enabled: !!botId,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

// ---------------------------------------------------------------------------
// Gateway Discovery
// ---------------------------------------------------------------------------

/** Discovered gateways via mDNS. */
export function useGatewayDiscovery() {
  return useQuery({
    queryKey: queryKeys.fleet.discovery(),
    queryFn: () => fleetMonitorApi.discovery(),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Bot Tags
// ---------------------------------------------------------------------------

/** All tags across fleet. */
export function useFleetTags() {
  return useQuery({
    queryKey: queryKeys.fleet.tags(),
    queryFn: () => fleetMonitorApi.tags(),
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Connect a new bot to the fleet. */
export function useConnectBot() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (data: Omit<ConnectBotRequest, "companyId">) =>
      fleetMonitorApi.connect({ ...data, companyId: selectedCompanyId! }),
    onSuccess: () => {
      if (selectedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.fleet.status(selectedCompanyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.fleet.alerts(selectedCompanyId) });
      }
    },
  });
}

/** Disconnect a bot from the fleet. */
export function useDisconnectBot() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (botId: string) => fleetMonitorApi.disconnect(botId),
    onSuccess: () => {
      if (selectedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.fleet.status(selectedCompanyId) });
      }
    },
  });
}

/** Test gateway connection (no side effects). */
export function useTestConnection() {
  return useMutation({
    mutationFn: (data: { gatewayUrl: string; token: string }) =>
      fleetMonitorApi.testConnection(data.gatewayUrl, data.token),
  });
}

/** Acknowledge an alert. */
export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (alertId: string) => fleetAlertsApi.acknowledge(alertId),
    onSuccess: () => {
      if (selectedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.fleet.alerts(selectedCompanyId) });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Human-readable label for bot connection state. */
export function connectionStateLabel(state: string): string {
  const labels: Record<string, string> = {
    monitoring: "Online",
    connecting: "Connecting",
    authenticating: "Authenticating",
    disconnected: "Reconnecting",
    backoff: "Waiting to retry",
    error: "Error",
    dormant: "Not connected",
  };
  return labels[state] ?? state;
}

/** Time since a date, formatted as "Xs ago", "Xm ago", "Xh ago". */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Estimate USD cost from token counts (Claude Sonnet 4 pricing as default). */
export function estimateCostUsd(usage: {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}): number {
  // Claude Sonnet 4 pricing: $3/M input, $15/M output, $0.30/M cached input
  const inputCost = ((usage.inputTokens - usage.cachedInputTokens) / 1_000_000) * 3;
  const cachedCost = (usage.cachedInputTokens / 1_000_000) * 0.3;
  const outputCost = (usage.outputTokens / 1_000_000) * 15;
  return inputCost + cachedCost + outputCost;
}

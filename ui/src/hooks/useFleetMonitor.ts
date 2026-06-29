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
import { agentsApi } from "@/api/agents";

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

/** Connect a new bot to the fleet and persist as DB agent. */
export function useConnectBot() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (data: Omit<ConnectBotRequest, "companyId">) =>
      fleetMonitorApi.connect({ ...data, companyId: selectedCompanyId! }),
    onSuccess: async (result, variables) => {
      if (!selectedCompanyId) return;
      // Persist bot as DB agent so it survives fleet-monitor restarts
      try {
        await agentsApi.create(selectedCompanyId, {
          name: result.identity?.name ?? "Bot",
          icon: result.identity?.emoji ?? "",
          title: result.identity?.description ?? "",
          role: "member",
          adapterType: "openclaw_gateway",
          adapterConfig: { gatewayUrl: variables.gatewayUrl },
          runtimeConfig: {
            heartbeat: { enabled: true, intervalSec: 3600, wakeOnDemand: true, cooldownSec: 10, maxConcurrentRuns: 1 },
          },
          metadata: { fleetBot: true },
        });
      } catch {
        // DB write failed — bot is still connected via fleet-monitor
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.status(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.alerts(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
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
// Trust Graduation hooks
// ---------------------------------------------------------------------------

/** Promote a bot to the next trust level. */
export function useTrustPromote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { botId: string; approvedBy?: string }) =>
      fleetMonitorApi.trustPromote(vars.botId, vars.approvedBy),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.trustProfile(vars.botId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.trustDistribution() });
    },
  });
}

/** Demote a bot one trust level. */
export function useTrustDemote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { botId: string; reason?: string }) =>
      fleetMonitorApi.trustDemote(vars.botId, vars.reason),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.trustProfile(vars.botId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.trustDistribution() });
    },
  });
}

// ---------------------------------------------------------------------------
// Ops Playbook hooks
// ---------------------------------------------------------------------------

/** List all available playbooks (built-ins seeded server-side). */
export function usePlaybooks() {
  return useQuery({
    queryKey: queryKeys.fleet.playbooks(),
    queryFn: () => fleetMonitorApi.playbooks(),
    select: (res) => res.playbooks,
    staleTime: 30_000,
  });
}

/** Playbook execution statistics. */
export function usePlaybookStats() {
  return useQuery({
    queryKey: queryKeys.fleet.playbookStats(),
    queryFn: () => fleetMonitorApi.playbookStats(),
    select: (res) => res.stats,
    staleTime: 30_000,
  });
}

/**
 * List playbook executions, optionally filtered by status.
 * Polls every 3s while any execution is still in flight so the active-execution
 * panel advances (the engine completes one step per status read).
 */
export function usePlaybookExecutions(status?: string) {
  return useQuery({
    queryKey: queryKeys.fleet.playbookExecutions(status),
    queryFn: () => fleetMonitorApi.playbookExecutions(status),
    select: (res) => res.executions,
    refetchInterval: (query) => {
      const executions = query.state.data?.executions ?? [];
      const active = executions.some(
        (e) => e.status === "running" || e.status === "paused" || e.status === "waiting_approval",
      );
      return active ? 3_000 : false;
    },
  });
}

/** Helper: invalidate every playbook-related query after a mutation. */
function invalidatePlaybookQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["fleet", "playbook-executions"] });
  queryClient.invalidateQueries({ queryKey: queryKeys.fleet.playbookStats() });
  queryClient.invalidateQueries({ queryKey: queryKeys.fleet.playbooks() });
}

/** Execute a playbook. */
export function usePlaybookExecute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; targetBotId?: string }) =>
      fleetMonitorApi.playbookExecute(vars.id, { targetBotId: vars.targetBotId }),
    onSuccess: () => invalidatePlaybookQueries(queryClient),
  });
}

/** Pause a running execution. */
export function usePlaybookPause() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (execId: string) => fleetMonitorApi.playbookPause(execId),
    onSuccess: () => invalidatePlaybookQueries(queryClient),
  });
}

/** Resume a paused execution. */
export function usePlaybookResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (execId: string) => fleetMonitorApi.playbookResume(execId),
    onSuccess: () => invalidatePlaybookQueries(queryClient),
  });
}

/** Abort a running execution. */
export function usePlaybookAbort() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { execId: string; reason?: string }) =>
      fleetMonitorApi.playbookAbort(vars.execId, vars.reason),
    onSuccess: () => invalidatePlaybookQueries(queryClient),
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

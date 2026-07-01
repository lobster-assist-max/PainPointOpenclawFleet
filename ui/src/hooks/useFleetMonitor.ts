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
  fleetIncidentsApi,
  fleetIntegrationsApi,
  fleetComplianceApi,
  fleetDeploymentsApi,
  fleetVoiceApi,
  fleetMemoryMeshApi,
  fleetTimeMachineApi,
  fleetHealingApi,
  type CreateHealingPolicy,
  type TimeBookmarkType,
  type FederatedSearchOptions,
  type VoiceAnomalyType,
  type RetentionAction,
  type CreateDeploymentRequest,
  type DeploymentStatus,
  type FleetStatus,
  type BotStatus,
  type BotHealthScore,
  type AlertState,
  type ConnectBotRequest,
  type AgentTurnTrace,
  type DiscoveredGateway,
  type BotTag,
  type MetaLearningConfig,
  type CreateSandboxRequest,
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
// Health Heatmap
// ---------------------------------------------------------------------------

/**
 * Fleet/bot health heatmap (averaged fleet_snapshots). Scoped to the
 * selected company; pass a botId for a single-bot view. Refetches every
 * 5 minutes — the underlying snapshots are captured on a 15-minute loop.
 */
export function useFleetHeatmap(
  granularity: "daily" | "hourly",
  botId?: string,
) {
  const { selectedCompanyId } = useCompany();
  const days = granularity === "hourly" ? 7 : 28;
  return useQuery({
    queryKey: queryKeys.fleet.heatmap(selectedCompanyId!, granularity, botId),
    queryFn: () =>
      fleetMonitorApi.heatmap(selectedCompanyId!, { days, granularity, botId }),
    enabled: !!selectedCompanyId,
    refetchInterval: 5 * 60 * 1000,
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
          // `icon` is a lucide icon-name key (rendered by AgentIcon in the
          // standard agent UI) — NOT an emoji. The bot's real emoji is stored
          // in metadata.emoji so agentToBotStatus can surface it on the fleet
          // dashboard without breaking the sidebar's lucide icon lookup.
          icon: "bot",
          title: result.identity?.description ?? "",
          role: "member",
          adapterType: "openclaw_gateway",
          adapterConfig: { gatewayUrl: variables.gatewayUrl },
          runtimeConfig: {
            heartbeat: { enabled: true, intervalSec: 3600, wakeOnDemand: true, cooldownSec: 10, maxConcurrentRuns: 1 },
          },
          metadata: { fleetBot: true, emoji: result.identity?.emoji ?? "" },
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
// A2A Collaboration Mesh hooks
// ---------------------------------------------------------------------------

/** Expertise matrix for the current company's fleet (empty until detected). */
export function useA2AExpertise(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.a2aExpertise(companyId ?? ""),
    queryFn: () => fleetMonitorApi.a2aExpertise(companyId as string),
    select: (res) => res.matrix,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

/** Collaboration history for the current company. */
export function useA2ACollaborations(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.a2aCollaborations(companyId ?? ""),
    queryFn: () => fleetMonitorApi.a2aCollaborations(companyId as string),
    select: (res) => res.collaborations,
    enabled: !!companyId,
    staleTime: 15_000,
  });
}

/** Aggregated collaboration stats for a fixed time window. */
export function useA2AStats(
  companyId: string | null | undefined,
  periodStart: string,
  periodEnd: string,
) {
  return useQuery({
    queryKey: queryKeys.fleet.a2aStats(companyId ?? "", periodStart, periodEnd),
    queryFn: () => fleetMonitorApi.a2aStats(companyId as string, periodStart, periodEnd),
    select: (res) => res.stats,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

/**
 * Auto-detect a bot's expertise from its SOUL.md / IDENTITY.md.
 * Invalidates the expertise matrix on success so the heatmap refreshes.
 */
export function useA2AAutoDetect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { companyId: string; botId: string }) =>
      fleetMonitorApi.a2aAutoDetect(vars.companyId, vars.botId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.fleet.a2aExpertise(vars.companyId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Conversation Analytics hooks
// ---------------------------------------------------------------------------

/** Topic clusters for a company (empty until conversations are analyzed). */
export function useConversationTopics(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.convTopics(companyId ?? ""),
    queryFn: () => fleetMonitorApi.conversationTopics(companyId as string),
    select: (res) => res.data,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

/** Knowledge gap report for a company. */
export function useConversationGaps(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.convGaps(companyId ?? ""),
    queryFn: () => fleetMonitorApi.conversationGaps(companyId as string),
    select: (res) => res.data,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

/** Satisfaction trend for a company over a fixed window. */
export function useConversationSatisfaction(
  companyId: string | null | undefined,
  periodStart: string,
  periodEnd: string,
  granularity: "hour" | "day" | "week" = "day",
) {
  return useQuery({
    queryKey: queryKeys.fleet.convSatisfaction(companyId ?? "", periodStart, periodEnd),
    queryFn: () =>
      fleetMonitorApi.conversationSatisfaction(companyId as string, periodStart, periodEnd, granularity),
    select: (res) => res.data,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

/** Resolution funnel for a company. */
export function useConversationFunnel(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.convFunnel(companyId ?? ""),
    queryFn: () => fleetMonitorApi.conversationFunnel(companyId as string),
    select: (res) => res.data,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

/** Cross-bot inconsistencies for a company. */
export function useConversationInconsistencies(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.convInconsistencies(companyId ?? ""),
    queryFn: () => fleetMonitorApi.conversationInconsistencies(companyId as string),
    select: (res) => res.data,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

/**
 * Run a batch conversation analysis for a bot (fetches sessions via gateway,
 * runs NLP, seeds the engine). Invalidates all conversation-analytics queries
 * for the company on success so the widget refreshes with live data.
 */
export function useConversationAnalyze() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { botId: string; companyId: string; limit?: number }) =>
      fleetMonitorApi.conversationAnalyze(vars.botId, vars.companyId, { limit: vars.limit }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.convTopics(vars.companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.convGaps(vars.companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.convFunnel(vars.companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.convInconsistencies(vars.companyId) });
      queryClient.invalidateQueries({ queryKey: ["fleet", "conv-satisfaction", vars.companyId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Secrets Vault
// ---------------------------------------------------------------------------

/** List a company's secrets (metadata + sync status, never values). */
export function useVaultSecrets(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.vaultSecrets(companyId ?? ""),
    queryFn: () => fleetMonitorApi.secretsList(companyId as string),
    select: (res) => res.secrets,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

/** Secret health report (expiring / out-of-sync / never-rotated alerts). */
export function useVaultHealth(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.vaultHealth(companyId ?? ""),
    queryFn: () => fleetMonitorApi.secretsHealth(companyId as string),
    select: (res) => res.report,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

/** Push a secret to all assigned bots; refreshes the list + health on success. */
export function useVaultPushAll(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (secretId: string) => fleetMonitorApi.secretPushAll(secretId),
    onSuccess: () => {
      if (!companyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.vaultSecrets(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.vaultHealth(companyId) });
    },
  });
}

/** Verify a secret's sync status across all bots; refreshes list + health. */
export function useVaultVerifyAll(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (secretId: string) => fleetMonitorApi.secretVerifyAll(secretId),
    onSuccess: () => {
      if (!companyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.vaultSecrets(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.vaultHealth(companyId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Cost Optimizer
// ---------------------------------------------------------------------------

/** Per-bot cost breakdown (computed live from connected bots). */
export function useCostBreakdown(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.costBreakdown(companyId ?? ""),
    queryFn: () => fleetMonitorApi.costOptimizerBreakdown(companyId as string),
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

/** Optimization findings for a company (empty until a scan runs). */
export function useCostFindings(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.costFindings(companyId ?? ""),
    queryFn: () => fleetMonitorApi.costOptimizerFindings(companyId as string),
    select: (res) => res.findings,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

/** Historical savings from executed optimizations. */
export function useCostSavings(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.fleet.costSavings(companyId ?? ""),
    queryFn: () => fleetMonitorApi.costOptimizerSavings(companyId as string),
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

/**
 * Run a full fleet cost scan (inspects every connected bot via gateway RPC,
 * generates findings). Invalidates findings + breakdown on success.
 */
export function useCostScan(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fleetMonitorApi.costOptimizerScan(companyId as string),
    onSuccess: () => {
      if (!companyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.costFindings(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.costBreakdown(companyId) });
    },
  });
}

/**
 * Execute an approved/open optimization finding via gateway RPC. Invalidates
 * findings + breakdown + savings on success so all three cards refresh.
 */
export function useCostExecute(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => fleetMonitorApi.costOptimizerExecute(findingId),
    onSuccess: () => {
      if (!companyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.costFindings(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.costBreakdown(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.costSavings(companyId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Plugin Inventory
// ---------------------------------------------------------------------------

/**
 * Plugin inventory + drift report across all connected bots. The endpoint
 * takes no params (it inspects every monitoring bot via gateway RPC) so this
 * is fleet-wide rather than company-scoped. Server caches per-bot for 10 min;
 * refetch every 5 min to pick up plugin config changes.
 */
export function usePluginInventory() {
  return useQuery({
    queryKey: queryKeys.fleet.pluginInventory(),
    queryFn: () => fleetMonitorApi.pluginInventory(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/**
 * Inter-bot communication graph (nodes + edges). Node metadata
 * (name/emoji/health) refreshes server-side every 5 min, so poll at the same
 * cadence to pick up new edges + health changes.
 */
export function useInterBotGraph() {
  return useQuery({
    queryKey: queryKeys.fleet.interBotGraph(),
    queryFn: () => fleetMonitorApi.interBotGraph(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Blast radius for a bot. Only fetches when a botId is provided. */
export function useInterBotBlast(botId: string | null) {
  return useQuery({
    queryKey: queryKeys.fleet.interBotBlast(botId ?? ""),
    queryFn: () => fleetMonitorApi.interBotBlast(botId as string),
    enabled: !!botId,
    staleTime: 30_000,
  });
}

/** Fleet-wide Conversation Quality Index. Recomputed server-side every 5 min. */
export function useFleetQuality() {
  return useQuery({
    queryKey: queryKeys.fleet.quality(),
    queryFn: () => fleetMonitorApi.quality(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// Canary Lab (A/B experiments)
// ---------------------------------------------------------------------------

/** List Canary Lab experiments. Polls while any experiment is running/paused. */
export function useCanaryExperiments() {
  return useQuery({
    queryKey: queryKeys.fleet.canaryExperiments(),
    queryFn: () => fleetMonitorApi.canaryExperiments(),
    staleTime: 30_000,
    refetchInterval: (query) => {
      const exps = query.state.data?.experiments ?? [];
      const live = exps.some((e) => e.status === "running" || e.status === "paused");
      return live ? 30_000 : false;
    },
  });
}

function invalidateCanary(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.fleet.canaryExperiments() });
}

/** Start a draft/paused experiment. */
export function useCanaryStart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fleetMonitorApi.canaryStart(id),
    onSuccess: () => invalidateCanary(queryClient),
  });
}

/** Pause a running experiment. */
export function useCanaryPause() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fleetMonitorApi.canaryPause(id),
    onSuccess: () => invalidateCanary(queryClient),
  });
}

/** Abort a running/paused experiment. */
export function useCanaryAbort() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; reason?: string }) =>
      fleetMonitorApi.canaryAbort(vars.id, vars.reason),
    onSuccess: () => invalidateCanary(queryClient),
  });
}

/** Complete a running experiment (computes the final verdict). */
export function useCanaryComplete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fleetMonitorApi.canaryComplete(id),
    onSuccess: () => invalidateCanary(queryClient),
  });
}

// ---------------------------------------------------------------------------
// Capacity Planner (forecasts)
// ---------------------------------------------------------------------------

/** Fleet cost + session-count capacity forecasts (Holt-Winters). */
export function useCapacityForecasts(opts?: { horizonDays?: number; budgetThreshold?: number }) {
  return useQuery({
    queryKey: queryKeys.fleet.capacityForecasts(),
    queryFn: () => fleetMonitorApi.capacityForecasts(opts),
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
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

// ---------------------------------------------------------------------------
// Incident hooks
// ---------------------------------------------------------------------------
// The incident manager is a global in-memory singleton (not company-scoped),
// so these hooks don't gate on companyId.

/** List incidents, optionally filtered by status/severity. Refetches every 15s. */
export function useIncidents(status?: string, severity?: string) {
  return useQuery({
    queryKey: queryKeys.fleet.incidents(status, severity),
    queryFn: () => fleetIncidentsApi.list({ status, severity }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** Fleet incident metrics (MTTR/MTTI, open/resolved counts). */
export function useIncidentMetrics() {
  return useQuery({
    queryKey: queryKeys.fleet.incidentMetrics(),
    queryFn: () => fleetIncidentsApi.metrics(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

function useInvalidateIncidents() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["fleet", "incidents"] });
    queryClient.invalidateQueries({ queryKey: queryKeys.fleet.incidentMetrics() });
  };
}

/** Acknowledge an incident. */
export function useAcknowledgeIncident() {
  const invalidate = useInvalidateIncidents();
  return useMutation({
    mutationFn: ({ id, by }: { id: string; by: { userId: string; name: string } }) =>
      fleetIncidentsApi.acknowledge(id, by),
    onSuccess: invalidate,
  });
}

/** Escalate an incident to the next level. */
export function useEscalateIncident() {
  const invalidate = useInvalidateIncidents();
  return useMutation({
    mutationFn: (id: string) => fleetIncidentsApi.escalate(id),
    onSuccess: invalidate,
  });
}

/** Resolve an incident. */
export function useResolveIncident() {
  const invalidate = useInvalidateIncidents();
  return useMutation({
    mutationFn: ({
      id,
      resolution,
    }: {
      id: string;
      resolution: { summary: string; rootCause?: string; actions?: string[] };
    }) => fleetIncidentsApi.resolve(id, resolution),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Integration hooks
// ---------------------------------------------------------------------------
// Integrations are a global in-memory registry (not company-scoped), so these
// hooks don't gate on companyId.

/** List integrations, optionally filtered by provider/status. Refetches every 30s. */
export function useIntegrations(provider?: string, status?: string) {
  return useQuery({
    queryKey: queryKeys.fleet.integrations(provider, status),
    queryFn: () => fleetIntegrationsApi.list({ provider, status }),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Recent ingested events across all integrations (or one). Refetches every 15s. */
export function useIntegrationEvents(integrationId?: string) {
  return useQuery({
    queryKey: queryKeys.fleet.integrationEvents(integrationId),
    queryFn: () => fleetIntegrationsApi.events({ integrationId, limit: 50 }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

function useInvalidateIntegrations() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["fleet", "integrations"] });
    queryClient.invalidateQueries({ queryKey: ["fleet", "integration-events"] });
  };
}

/** Register a new integration. */
export function useCreateIntegration() {
  const invalidate = useInvalidateIntegrations();
  return useMutation({
    mutationFn: (data: {
      name: string;
      type: "webhook" | "polling" | "streaming";
      provider: string;
      auth: { type: string; token?: string; secret?: string };
      config?: Record<string, unknown>;
    }) => fleetIntegrationsApi.create(data),
    onSuccess: invalidate,
  });
}

/** Send a test event through an integration. */
export function useTestIntegration() {
  const invalidate = useInvalidateIntegrations();
  return useMutation({
    mutationFn: (id: string) => fleetIntegrationsApi.test(id),
    onSuccess: invalidate,
  });
}

/** Remove an integration. */
export function useDeleteIntegration() {
  const invalidate = useInvalidateIntegrations();
  return useMutation({
    mutationFn: (id: string) => fleetIntegrationsApi.remove(id),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Compliance & data governance hooks
// ---------------------------------------------------------------------------
// The compliance store is a global in-memory registry (not company-scoped),
// so these hooks don't gate on companyId.

/** Current weighted compliance score + factor breakdown. Refetches every 30s. */
export function useComplianceScore() {
  return useQuery({
    queryKey: queryKeys.fleet.complianceScore(),
    queryFn: () => fleetComplianceApi.score(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** PII scan results (newest first). Refetches every 15s. */
export function useComplianceScans(status?: string) {
  return useQuery({
    queryKey: queryKeys.fleet.complianceScans(status),
    queryFn: () => fleetComplianceApi.scanResults({ status, limit: 20 }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** Retention policies. */
export function useCompliancePolicies() {
  return useQuery({
    queryKey: queryKeys.fleet.compliancePolicies(),
    queryFn: () => fleetComplianceApi.policies(),
    staleTime: 30_000,
  });
}

/** Compliance audit trail (newest first). */
export function useComplianceAudit(action?: string) {
  return useQuery({
    queryKey: queryKeys.fleet.complianceAudit(action),
    queryFn: () => fleetComplianceApi.audit({ action, limit: 50 }),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

function useInvalidateCompliance() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["fleet", "compliance-score"] });
    queryClient.invalidateQueries({ queryKey: ["fleet", "compliance-scans"] });
    queryClient.invalidateQueries({ queryKey: ["fleet", "compliance-policies"] });
    queryClient.invalidateQueries({ queryKey: ["fleet", "compliance-audit"] });
  };
}

/** Start a PII scan across the fleet. */
export function useStartComplianceScan() {
  const invalidate = useInvalidateCompliance();
  return useMutation({
    mutationFn: (data: { scope?: string; targetBotIds?: string[]; requestedBy?: string }) =>
      fleetComplianceApi.startScan(data),
    onSuccess: invalidate,
  });
}

/** Create a data retention policy. */
export function useCreateRetentionPolicy() {
  const invalidate = useInvalidateCompliance();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      dataCategory: string;
      retentionDays: number;
      action: RetentionAction;
      scope?: string;
    }) => fleetComplianceApi.createPolicy(data),
    onSuccess: invalidate,
  });
}

/** Submit a GDPR/CCPA right-to-erasure request. */
export function useSubmitErasure() {
  const invalidate = useInvalidateCompliance();
  return useMutation({
    mutationFn: (data: {
      customerId: string;
      reason?: string;
      scope?: string[];
      requestedBy?: string;
    }) => fleetComplianceApi.submitErasure(data),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Fleet Deployment Orchestrator hooks
// ---------------------------------------------------------------------------

/** List deployment plans for the selected fleet, optionally filtered by status. */
export function useDeployments(status?: DeploymentStatus) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.deployments(selectedCompanyId ?? undefined, status),
    queryFn: () => fleetDeploymentsApi.list({ fleetId: selectedCompanyId!, status }),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** Deployment statistics for the selected fleet. */
export function useDeploymentStats() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.deploymentStats(selectedCompanyId ?? undefined),
    queryFn: () => fleetDeploymentsApi.stats(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

function useInvalidateDeployments() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["fleet", "deployments"] });
    queryClient.invalidateQueries({ queryKey: ["fleet", "deployment-stats"] });
  };
}

/** Create a new deployment plan. */
export function useCreateDeployment() {
  const invalidate = useInvalidateDeployments();
  return useMutation({
    mutationFn: (data: CreateDeploymentRequest) => fleetDeploymentsApi.create(data),
    onSuccess: invalidate,
  });
}

/** Execute a draft/queued deployment plan. */
export function useExecuteDeployment() {
  const invalidate = useInvalidateDeployments();
  return useMutation({
    mutationFn: (id: string) => fleetDeploymentsApi.execute(id),
    onSuccess: invalidate,
  });
}

/** Pause a running deployment. */
export function usePauseDeployment() {
  const invalidate = useInvalidateDeployments();
  return useMutation({
    mutationFn: (id: string) => fleetDeploymentsApi.pause(id),
    onSuccess: invalidate,
  });
}

/** Resume a paused deployment. */
export function useResumeDeployment() {
  const invalidate = useInvalidateDeployments();
  return useMutation({
    mutationFn: (id: string) => fleetDeploymentsApi.resume(id),
    onSuccess: invalidate,
  });
}

/** Roll back a deployment. */
export function useRollbackDeployment() {
  const invalidate = useInvalidateDeployments();
  return useMutation({
    mutationFn: (id: string) => fleetDeploymentsApi.rollback(id),
    onSuccess: invalidate,
  });
}

/** Cancel a deployment plan. */
export function useCancelDeployment() {
  const invalidate = useInvalidateDeployments();
  return useMutation({
    mutationFn: (id: string) => fleetDeploymentsApi.cancel(id),
    onSuccess: invalidate,
  });
}

/** Dry-run a deployment plan (does not mutate state, so no invalidation). */
export function useDryRunDeployment() {
  return useMutation({
    mutationFn: (id: string) => fleetDeploymentsApi.dryRun(id),
  });
}

// ---------------------------------------------------------------------------
// Anomaly Correlation hooks
// ---------------------------------------------------------------------------
// The correlation engine is a global in-memory singleton fed by the
// fleet-bootstrap `alert.fired` → ingestAlert pipeline, so these hooks don't
// gate on companyId.

/** List anomaly correlations, optionally filtered by status. Refetches every 15s. */
export function useCorrelations(status?: string) {
  return useQuery({
    queryKey: queryKeys.fleet.correlations(status),
    queryFn: () => fleetMonitorApi.correlations(status),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** Anomaly correlation statistics (counts, avg confidence, top root causes). */
export function useCorrelationStats() {
  return useQuery({
    queryKey: queryKeys.fleet.correlationStats(),
    queryFn: () => fleetMonitorApi.correlationStats(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

function useInvalidateCorrelations() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["fleet", "correlations"] });
    queryClient.invalidateQueries({ queryKey: queryKeys.fleet.correlationStats() });
  };
}

/** Mark a correlation as resolved. */
export function useResolveCorrelation() {
  const invalidate = useInvalidateCorrelations();
  return useMutation({
    mutationFn: ({ id, resolvedBy }: { id: string; resolvedBy?: string }) =>
      fleetMonitorApi.correlationResolve(id, resolvedBy),
    onSuccess: invalidate,
  });
}

/** Mark a correlation as a false positive (recorded for future learning). */
export function useMarkCorrelationFalsePositive() {
  const invalidate = useInvalidateCorrelations();
  return useMutation({
    mutationFn: (id: string) => fleetMonitorApi.correlationFalsePositive(id),
    onSuccess: invalidate,
  });
}

// ─── Voice Intelligence ────────────────────────────────────────────────────

/** Fleet-wide voice analytics summary. Refetches every 20s. */
export function useVoiceSummary() {
  return useQuery({
    queryKey: queryKeys.fleet.voiceSummary(),
    queryFn: () => fleetVoiceApi.summary(),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}

/** Currently in-progress voice calls. Refetches every 10s (live). */
export function useVoiceActiveCalls() {
  return useQuery({
    queryKey: queryKeys.fleet.voiceActive(),
    queryFn: () => fleetVoiceApi.active(),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

/** Recent anomalous calls, optionally filtered by type. Refetches every 20s. */
export function useVoiceAnomalies(type?: VoiceAnomalyType) {
  return useQuery({
    queryKey: queryKeys.fleet.voiceAnomalies(type),
    queryFn: () => fleetVoiceApi.anomalies(type),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}

/** Survey completion analytics across the fleet. Refetches every 30s. */
export function useVoiceSurvey() {
  return useQuery({
    queryKey: queryKeys.fleet.voiceSurvey(),
    queryFn: () => fleetVoiceApi.survey(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

// ─── Memory Mesh ──────────────────────────────────────────────────────────

/** Fleet-wide memory health report (per-bot stats + distribution). Refetches every 60s. */
export function useMemoryHealth() {
  return useQuery({
    queryKey: queryKeys.fleet.memoryHealth(),
    queryFn: () => fleetMemoryMeshApi.health(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Memory mesh summary statistics. Refetches every 30s. */
export function useMemoryStats() {
  return useQuery({
    queryKey: queryKeys.fleet.memoryStats(),
    queryFn: () => fleetMemoryMeshApi.stats(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Detected memory conflicts, optionally filtered by status. Refetches every 30s. */
export function useMemoryConflicts(status?: "open" | "resolved" | "dismissed") {
  return useQuery({
    queryKey: queryKeys.fleet.memoryConflicts(status),
    queryFn: () => fleetMemoryMeshApi.conflicts(status),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Knowledge gaps — topics some bots know but others don't. Refetches every 60s. */
export function useMemoryGaps() {
  return useQuery({
    queryKey: queryKeys.fleet.memoryGaps(),
    queryFn: () => fleetMemoryMeshApi.gaps(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Cross-bot knowledge graph (topics + shared-bot edges). */
export function useMemoryGraph(minConnections?: number) {
  return useQuery({
    queryKey: queryKeys.fleet.memoryGraph(minConnections),
    queryFn: () => fleetMemoryMeshApi.graph({ minConnections }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

function useInvalidateMemoryMesh() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["fleet", "memory-conflicts"] });
    queryClient.invalidateQueries({ queryKey: queryKeys.fleet.memoryStats() });
    queryClient.invalidateQueries({ queryKey: queryKeys.fleet.memoryHealth() });
  };
}

/** Resolve a memory conflict (accept the suggested resolution). */
export function useResolveMemoryConflict() {
  const invalidate = useInvalidateMemoryMesh();
  return useMutation({
    mutationFn: (id: string) => fleetMemoryMeshApi.resolveConflict(id),
    onSuccess: invalidate,
  });
}

/** Dismiss a memory conflict (no action needed). */
export function useDismissMemoryConflict() {
  const invalidate = useInvalidateMemoryMesh();
  return useMutation({
    mutationFn: (id: string) => fleetMemoryMeshApi.dismissConflict(id),
    onSuccess: invalidate,
  });
}

/** Federated memory search across the fleet (on-demand, not auto-polled). */
export function useMemorySearch() {
  return useMutation({
    mutationFn: ({ query, options }: { query: string; options?: FederatedSearchOptions }) =>
      fleetMemoryMeshApi.search(query, options),
  });
}

// ---------------------------------------------------------------------------
// Meta-Learning hooks
// ---------------------------------------------------------------------------
// The meta-learning engine is a global in-memory singleton started by
// fleet-bootstrap; it observes fleet parameters and emits optimization
// suggestions. These hooks don't gate on companyId (fleet-wide tuning).

/** Tunable parameters the engine observes across every fleet engine. */
export function useMetaObservables() {
  return useQuery({
    queryKey: queryKeys.fleet.metaObservables(),
    queryFn: () => fleetMonitorApi.metaObservables(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Optimization suggestions, optionally filtered by status. Refetches every 20s. */
export function useMetaSuggestions(status?: string) {
  return useQuery({
    queryKey: queryKeys.fleet.metaSuggestions(status),
    queryFn: () => fleetMonitorApi.metaSuggestions(status),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}

/** Parameter sensitivity analysis (which params most affect outcomes). */
export function useMetaSensitivity() {
  return useQuery({
    queryKey: queryKeys.fleet.metaSensitivity(),
    queryFn: () => fleetMonitorApi.metaSensitivity(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Learning history — past parameter changes and their measured impact. */
export function useMetaHistory(limit?: number) {
  return useQuery({
    queryKey: queryKeys.fleet.metaHistory(limit),
    queryFn: () => fleetMonitorApi.metaHistory(limit),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Current meta-learning configuration. */
export function useMetaConfig() {
  return useQuery({
    queryKey: queryKeys.fleet.metaConfig(),
    queryFn: () => fleetMonitorApi.metaConfig(),
    staleTime: 30_000,
  });
}

/** Meta-learning statistics (counts + avg improvement score). */
export function useMetaStats() {
  return useQuery({
    queryKey: queryKeys.fleet.metaStats(),
    queryFn: () => fleetMonitorApi.metaStats(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

function useInvalidateMeta() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["fleet", "meta-suggestions"] });
    queryClient.invalidateQueries({ queryKey: queryKeys.fleet.metaStats() });
    queryClient.invalidateQueries({ queryKey: queryKeys.fleet.metaHistory() });
    queryClient.invalidateQueries({ queryKey: queryKeys.fleet.metaObservables() });
  };
}

/** Apply a pending suggestion (engine activates a safety guard after applying). */
export function useApplyMetaSuggestion() {
  const invalidate = useInvalidateMeta();
  return useMutation({
    mutationFn: (id: string) => fleetMonitorApi.metaApplySuggestion(id),
    onSuccess: invalidate,
  });
}

/** Reject a pending suggestion. */
export function useRejectMetaSuggestion() {
  const invalidate = useInvalidateMeta();
  return useMutation({
    mutationFn: (id: string) => fleetMonitorApi.metaRejectSuggestion(id),
    onSuccess: invalidate,
  });
}

/** Update the meta-learning configuration. */
export function useUpdateMetaConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<MetaLearningConfig>) =>
      fleetMonitorApi.metaUpdateConfig(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.metaConfig() });
    },
  });
}

// ─── Time Machine ─────────────────────────────────────────────────────────

/**
 * Reconstruct the fleet's recorded state at a given timestamp. Disabled until
 * both a company and an ISO timestamp are supplied.
 */
export function useTimeMachineReconstruct(timestamp: string | null) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.timeMachineReconstruct(
      selectedCompanyId ?? "",
      timestamp ?? "",
    ),
    queryFn: () =>
      fleetTimeMachineApi.reconstruct(selectedCompanyId!, timestamp!),
    enabled: !!selectedCompanyId && !!timestamp,
  });
}

/** Available reconstruction time range (earliest/latest snapshot) for the fleet. */
export function useTimeMachineRange() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.timeMachineRange(selectedCompanyId ?? ""),
    queryFn: () => fleetTimeMachineApi.range(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
}

/** List time bookmarks, optionally filtered by type. */
export function useTimeMachineBookmarks(type?: TimeBookmarkType) {
  return useQuery({
    queryKey: queryKeys.fleet.timeMachineBookmarks(type),
    queryFn: () => fleetTimeMachineApi.bookmarks(type),
  });
}

/** Create a time bookmark. */
export function useCreateTimeBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      timestamp: string;
      label: string;
      type?: TimeBookmarkType;
      refId?: string;
    }) => fleetTimeMachineApi.createBookmark(input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["fleet", "time-machine", "bookmarks"],
      });
    },
  });
}

/** Delete a time bookmark. */
export function useDeleteTimeBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fleetTimeMachineApi.deleteBookmark(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["fleet", "time-machine", "bookmarks"],
      });
    },
  });
}

// ─── Sandbox Environments ──────────────────────────────────────────────────

/** List sandbox environments (active only by default). Polls while any sandbox is running. */
export function useSandboxes(includeDestroyed?: boolean) {
  return useQuery({
    queryKey: queryKeys.fleet.sandboxes(includeDestroyed),
    queryFn: () => fleetMonitorApi.sandboxList(includeDestroyed),
    refetchInterval: (query) => {
      const data = query.state.data;
      const anyRunning = data?.sandboxes?.some((s) => s.status === "running");
      return anyRunning ? 10_000 : false;
    },
  });
}

/** Production-vs-sandbox metric comparison for a sandbox. */
export function useSandboxComparison(id: string | null) {
  return useQuery({
    queryKey: queryKeys.fleet.sandboxComparison(id ?? ""),
    queryFn: () => fleetMonitorApi.sandboxComparison(id!),
    enabled: !!id,
    retry: false,
  });
}

/** Promotion gate status for a sandbox. */
export function useSandboxGates(id: string | null) {
  return useQuery({
    queryKey: queryKeys.fleet.sandboxGates(id ?? ""),
    queryFn: () => fleetMonitorApi.sandboxGates(id!),
    enabled: !!id,
  });
}

function invalidateSandboxes(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["fleet", "sandboxes"] });
}

/** Create a sandbox environment. */
export function useCreateSandbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSandboxRequest) => fleetMonitorApi.sandboxCreate(data),
    onSuccess: () => invalidateSandboxes(queryClient),
  });
}

/** Start a ready/paused sandbox (begins traffic + gate evaluation). */
export function useStartSandbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fleetMonitorApi.sandboxStart(id),
    onSuccess: () => invalidateSandboxes(queryClient),
  });
}

/** Pause a running sandbox. */
export function usePauseSandbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fleetMonitorApi.sandboxPause(id),
    onSuccess: () => invalidateSandboxes(queryClient),
  });
}

/** Destroy a sandbox. */
export function useDestroySandbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fleetMonitorApi.sandboxDestroy(id),
    onSuccess: () => invalidateSandboxes(queryClient),
  });
}

/** Promote a sandbox's overrides to production (requires all gates passed). */
export function usePromoteSandbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fleetMonitorApi.sandboxPromote(id),
    onSuccess: () => invalidateSandboxes(queryClient),
  });
}

/** Manually approve a promotion gate. */
export function useApproveSandboxGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, gateName }: { id: string; gateName: string }) =>
      fleetMonitorApi.sandboxApproveGate(id, gateName),
    onSuccess: (_data, vars) => {
      invalidateSandboxes(queryClient);
      queryClient.invalidateQueries({
        queryKey: queryKeys.fleet.sandboxGates(vars.id),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Self-Healing hooks
// ---------------------------------------------------------------------------
// The healing engine is a global in-memory singleton (fleet-wide policies +
// attempts), so these hooks don't gate on companyId.

/** Healing policies. */
export function useHealingPolicies() {
  return useQuery({
    queryKey: queryKeys.fleet.healingPolicies(),
    queryFn: () => fleetHealingApi.policies(),
    staleTime: 15_000,
  });
}

/** Healing summary stats incl. kill-switch state. Refetches every 15s. */
export function useHealingStats() {
  return useQuery({
    queryKey: queryKeys.fleet.healingStats(),
    queryFn: () => fleetHealingApi.stats(),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** Recent remediation attempts (optionally per-bot). Refetches every 15s. */
export function useHealingAttempts(botId?: string) {
  return useQuery({
    queryKey: queryKeys.fleet.healingAttempts(botId),
    queryFn: () => fleetHealingApi.attempts({ botId }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** Healing audit log (optionally per-bot). Refetches every 30s. */
export function useHealingAudit(botId?: string) {
  return useQuery({
    queryKey: queryKeys.fleet.healingAudit(botId),
    queryFn: () => fleetHealingApi.audit({ botId }),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

function invalidateHealing(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.fleet.healingPolicies() });
  queryClient.invalidateQueries({ queryKey: queryKeys.fleet.healingStats() });
}

/** Toggle the global kill switch. */
export function useToggleHealingPause() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pause: boolean) =>
      pause ? fleetHealingApi.pause() : fleetHealingApi.resume(),
    onSuccess: () => invalidateHealing(queryClient),
  });
}

/** Enable/disable a policy. */
export function useSetHealingPolicyEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      fleetHealingApi.setEnabled(id, enabled),
    onSuccess: () => invalidateHealing(queryClient),
  });
}

/** Create a healing policy. */
export function useCreateHealingPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (policy: CreateHealingPolicy) => fleetHealingApi.createPolicy(policy),
    onSuccess: () => invalidateHealing(queryClient),
  });
}

/** Delete a healing policy. */
export function useDeleteHealingPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fleetHealingApi.removePolicy(id),
    onSuccess: () => invalidateHealing(queryClient),
  });
}

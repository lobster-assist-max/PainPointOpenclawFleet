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
  type AgentTurnTrace,
  type DiscoveredGateway,
  type BotTag,
  type MetaLearningConfig,
  type CreateSandboxRequest,
  type CostBudget,
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
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.botHealth(botId!),
    queryFn: () => fleetMonitorApi.botHealth(botId!, selectedCompanyId ?? undefined),
    enabled: !!botId,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** Bot sessions list. */
export function useBotSessions(botId: string | undefined) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.botSessions(botId!),
    queryFn: () => fleetMonitorApi.botSessions(botId!, selectedCompanyId ?? undefined),
    enabled: !!botId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Bot token usage for a date range. */
export function useBotUsage(botId: string | undefined, from?: string, to?: string) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.botUsage(botId!, from, to),
    queryFn: () => fleetMonitorApi.botUsage(botId!, from, to, selectedCompanyId ?? undefined),
    enabled: !!botId,
    staleTime: 60_000,
  });
}

/** Bot identity (name, emoji, avatar). */
export function useBotIdentity(botId: string | undefined) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.botIdentity(botId!),
    queryFn: () => fleetMonitorApi.botIdentity(botId!, selectedCompanyId ?? undefined),
    enabled: !!botId,
    staleTime: 300_000, // identity rarely changes
  });
}

/** Bot channels status. */
export function useBotChannels(botId: string | undefined) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.botChannels(botId!),
    queryFn: () => fleetMonitorApi.botChannels(botId!, selectedCompanyId ?? undefined),
    enabled: !!botId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Bot cron jobs. */
export function useBotCron(botId: string | undefined) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.botCron(botId!),
    queryFn: () => fleetMonitorApi.botCron(botId!, selectedCompanyId ?? undefined),
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

/**
 * Fleet-wide per-channel token-cost breakdown (tenant-scoped). Refetches every
 * 60s. Returns the pre-aggregated `ChannelCostEntry[]` the server computes from
 * each connected bot's session usage.
 */
export function useChannelCosts(from?: string, to?: string) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.costByChannel(selectedCompanyId!, from, to),
    queryFn: () => fleetMonitorApi.costByChannel(selectedCompanyId!, from, to),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
    staleTime: 30_000,
    select: (r) => r.channels,
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
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.botTraces(botId!),
    queryFn: () => fleetMonitorApi.botTraces(botId!, 50, selectedCompanyId ?? undefined),
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

/** Tags scoped to the selected company. */
export function useFleetTags() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.tags(selectedCompanyId ?? undefined),
    queryFn: () => fleetMonitorApi.tags(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });
}

/**
 * List cost budgets for the selected company.
 *
 * The BudgetWidget only reads statuses; this powers the budget MANAGER
 * (create/delete). Without it the entire fleet cost-budget feature (widget,
 * per-bot budget bars, breach alerts, projected forecasting) is unreachable
 * because there was no way to create a budget.
 */
export function useFleetBudgets() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: ["fleet", "budgets-list", selectedCompanyId] as const,
    queryFn: () => fleetMonitorApi.budgets(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    select: (r) => r.budgets,
    staleTime: 30_000,
  });
}

/** Create a cost budget (company-scoped). */
export function useCreateBudget() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (data: {
      scope: CostBudget["scope"];
      scopeId: string;
      monthlyLimitUsd: number;
      action?: CostBudget["action"];
      alertThresholds?: number[];
    }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return fleetMonitorApi.createBudget({
        scope: data.scope,
        scopeId: data.scopeId,
        monthlyLimitUsd: data.monthlyLimitUsd,
        action: data.action ?? "alert_only",
        alertThresholds: data.alertThresholds ?? [0.5, 0.8, 0.95],
        companyId: selectedCompanyId,
      });
    },
    onSuccess: () => {
      // Prefix invalidation refreshes both the manager list and the
      // BudgetWidget's status query (["fleet","budgets-status",companyId]).
      queryClient.invalidateQueries({ queryKey: ["fleet", "budgets-list"] });
      queryClient.invalidateQueries({ queryKey: ["fleet", "budgets-status"] });
    },
  });
}

/** Delete a cost budget (company-scoped ownership guard on the server). */
export function useDeleteBudget() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (id: string) =>
      fleetMonitorApi.deleteBudget(id, selectedCompanyId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fleet", "budgets-list"] });
      queryClient.invalidateQueries({ queryKey: ["fleet", "budgets-status"] });
    },
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
    // Persist the bot as a DB agent FIRST, then use its id as both botId and
    // agentId when connecting. The /connect endpoint requires botId + agentId
    // (the previous call omitted them and 400'd — "Add to Fleet" never actually
    // connected), and using the agent id keeps the live fleet-monitor view and
    // the DB-fallback view (agentToBotStatus, botId = agent.id) pointed at the
    // same bot.
    mutationFn: async (data: {
      gatewayUrl: string;
      token: string;
      identity?: { name?: string; emoji?: string | null; description?: string | null } | null;
      skills?: string[];
    }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const agent = await agentsApi.create(selectedCompanyId, {
        name: data.identity?.name ?? "Bot",
        // `icon` is a lucide icon-name key (rendered by AgentIcon in the
        // standard agent UI) — NOT an emoji. The bot's real emoji is stored in
        // metadata.emoji so agentToBotStatus can surface it on the fleet
        // dashboard without breaking the sidebar's lucide icon lookup.
        icon: "bot",
        title: data.identity?.description ?? "",
        // Must be a valid AGENT_ROLES enum value — the create endpoint
        // validates `role` with z.enum(AGENT_ROLES) and rejects anything else
        // with a 400.
        role: "general",
        adapterType: "openclaw_gateway",
        adapterConfig: { gatewayUrl: data.gatewayUrl },
        runtimeConfig: {
          heartbeat: { enabled: true, intervalSec: 3600, wakeOnDemand: true, cooldownSec: 10, maxConcurrentRuns: 1 },
        },
        // Persist the probed skills (like the onboarding path) so a standalone-
        // connected bot shows its SkillBadges on the dashboard + detail page.
        metadata: {
          fleetBot: true,
          emoji: data.identity?.emoji ?? "",
          skills: data.skills ?? [],
        },
      });
      // If the live connect fails (unlike onboarding's best-effort bulk launch,
      // this single-bot wizard surfaces the error), roll back the just-created
      // DB agent so a failed "Add to Fleet" doesn't leave a phantom dormant bot
      // on the dashboard — and so retrying doesn't create a duplicate agent
      // each attempt. Cleanup is best-effort so it never masks the real error.
      let result;
      try {
        result = await fleetMonitorApi.connect({
          botId: agent.id,
          agentId: agent.id,
          gatewayUrl: data.gatewayUrl,
          token: data.token,
          companyId: selectedCompanyId,
        });
      } catch (err) {
        try {
          await agentsApi.remove(agent.id, selectedCompanyId);
        } catch {
          /* best-effort rollback — surface the original connect error below */
        }
        throw err;
      }
      return { botId: agent.id, result };
    },
    onSuccess: () => {
      if (!selectedCompanyId) return;
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
    mutationFn: (botId: string) =>
      fleetMonitorApi.disconnect(botId, selectedCompanyId ?? undefined),
    onSuccess: () => {
      if (selectedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.fleet.status(selectedCompanyId) });
        // The Dashboard DB fallback reads the agents list; invalidate it so the
        // now-paused agent renders as "dormant" instead of a stale "monitoring".
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
      }
    },
  });
}

/**
 * Reconnect an EXISTING (dormant / previously-disconnected) bot to the live
 * fleet monitor using its stored gateway URL. Unlike useConnectBot this creates
 * NO new DB agent — it reconnects the agent already on record (botId = agentId),
 * so the /connect route flips the agent's DB status back to "active". Used by
 * the Bot Detail "Reconnect" action for a bot showing the DB-fallback banner.
 */
export function useReconnectBot() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (data: { botId: string; gatewayUrl: string; token?: string }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return fleetMonitorApi.connect({
        botId: data.botId,
        agentId: data.botId,
        gatewayUrl: data.gatewayUrl,
        token: data.token ?? "",
        companyId: selectedCompanyId,
      });
    },
    onSuccess: () => {
      if (selectedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.fleet.status(selectedCompanyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
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
    mutationFn: (alertId: string) =>
      fleetAlertsApi.acknowledge(alertId, selectedCompanyId ?? undefined),
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

/** Promote a bot to the next trust level (companyId enforces the tenant guard). */
export function useTrustPromote() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (vars: { botId: string; approvedBy?: string }) =>
      fleetMonitorApi.trustPromote(vars.botId, vars.approvedBy, selectedCompanyId ?? undefined),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.trustProfile(vars.botId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.trustDistribution() });
    },
  });
}

/** Demote a bot one trust level (companyId enforces the tenant guard). */
export function useTrustDemote() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (vars: { botId: string; reason?: string }) =>
      fleetMonitorApi.trustDemote(vars.botId, vars.reason, selectedCompanyId ?? undefined),
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
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.playbookExecutions(status, selectedCompanyId ?? undefined),
    queryFn: () => fleetMonitorApi.playbookExecutions(status, selectedCompanyId ?? undefined),
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
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (vars: { id: string; targetBotId?: string }) =>
      fleetMonitorApi.playbookExecute(vars.id, {
        targetBotId: vars.targetBotId,
        companyId: selectedCompanyId ?? undefined,
      }),
    onSuccess: () => invalidatePlaybookQueries(queryClient),
  });
}

/** Pause a running execution. */
export function usePlaybookPause() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (execId: string) =>
      fleetMonitorApi.playbookPause(execId, selectedCompanyId ?? undefined),
    onSuccess: () => invalidatePlaybookQueries(queryClient),
  });
}

/** Resume a paused execution. */
export function usePlaybookResume() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (execId: string) =>
      fleetMonitorApi.playbookResume(execId, selectedCompanyId ?? undefined),
    onSuccess: () => invalidatePlaybookQueries(queryClient),
  });
}

/** Abort a running execution. */
export function usePlaybookAbort() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (vars: { execId: string; reason?: string }) =>
      fleetMonitorApi.playbookAbort(vars.execId, vars.reason, selectedCompanyId ?? undefined),
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

/**
 * Generate a training-data block (MEMORY.md snippet) for a knowledge gap.
 * Company-scoped so a gap from another tenant's conversations cannot be
 * resolved by id. Read-only on the server, so no cache invalidation needed.
 */
export function useGenerateTrainingData() {
  return useMutation({
    mutationFn: (vars: { gapId: string; companyId?: string }) =>
      fleetMonitorApi.conversationTrainingData(vars.gapId, vars.companyId),
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
    mutationFn: (secretId: string) =>
      fleetMonitorApi.secretPushAll(secretId, companyId ?? undefined),
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
    mutationFn: (secretId: string) =>
      fleetMonitorApi.secretVerifyAll(secretId, companyId ?? undefined),
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
    mutationFn: (findingId: string) =>
      fleetMonitorApi.costOptimizerExecute(findingId, companyId ?? undefined),
    onSuccess: () => {
      if (!companyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.costFindings(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.costBreakdown(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.costSavings(companyId) });
    },
  });
}

/**
 * Dismiss (defer) an optimization finding — persists status="dismissed"
 * server-side so it stays hidden across refreshes. Invalidates findings so the
 * dismissed row disappears from the list on the next refetch.
 */
export function useCostDismiss(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) =>
      fleetMonitorApi.costOptimizerDismiss(findingId, companyId ?? undefined),
    onSuccess: () => {
      if (!companyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.costFindings(companyId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Plugin Inventory
// ---------------------------------------------------------------------------

/**
 * Plugin inventory + drift report for the selected company's connected bots.
 * Scoped by companyId so the matrix/drift don't aggregate across tenants (the
 * Intelligence ▸ Plugins tab is company-scoped). Server caches per-bot for
 * 10 min; refetch every 5 min to pick up plugin config changes.
 */
export function usePluginInventory() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.pluginInventory(selectedCompanyId ?? undefined),
    queryFn: () => fleetMonitorApi.pluginInventory(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
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
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.interBotGraph(selectedCompanyId ?? undefined),
    queryFn: () => fleetMonitorApi.interBotGraph(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Blast radius for a bot. Only fetches when a botId is provided. */
export function useInterBotBlast(botId: string | null) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.interBotBlast(botId ?? "", selectedCompanyId ?? undefined),
    queryFn: () => fleetMonitorApi.interBotBlast(botId as string, selectedCompanyId ?? undefined),
    enabled: !!botId,
    staleTime: 30_000,
  });
}

/** Fleet-wide Conversation Quality Index. Recomputed server-side every 5 min. */
export function useFleetQuality() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.quality(selectedCompanyId ?? undefined),
    queryFn: () => fleetMonitorApi.quality(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
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
  const t = new Date(iso).getTime();
  // Guard against a missing / unparseable timestamp (some gateway sessions omit
  // lastActivityAt) — without this, new Date(undefined) → NaN → "NaN ago".
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
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
  // Claude Sonnet 4 pricing: $3/M input, $15/M output, $0.30/M cached input.
  // Clamp billable input to ≥0 so a session where cached > input can't produce a
  // negative cost — mirrors the server `estimateTokenCostUsd` guard (Build #182).
  const billedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const inputCost = (billedInput / 1_000_000) * 3;
  const cachedCost = (usage.cachedInputTokens / 1_000_000) * 0.3;
  const outputCost = (usage.outputTokens / 1_000_000) * 15;
  return inputCost + cachedCost + outputCost;
}

// ---------------------------------------------------------------------------
// Incident hooks
// ---------------------------------------------------------------------------
// Incidents are attributed to the affected bot's tenant, so these hooks scope
// by the selected company — a tenant never sees another company's incidents.

/** List incidents for the selected company, optionally filtered by status/severity. Refetches every 15s. */
export function useIncidents(status?: string, severity?: string) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.incidents(selectedCompanyId ?? undefined, status, severity),
    queryFn: () => fleetIncidentsApi.list({ companyId: selectedCompanyId!, status, severity }),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** Fleet incident metrics (MTTR/MTTI, open/resolved counts) for the selected company. */
export function useIncidentMetrics() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.incidentMetrics(selectedCompanyId ?? undefined),
    queryFn: () => fleetIncidentsApi.metrics(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

function useInvalidateIncidents() {
  const queryClient = useQueryClient();
  return () => {
    // Prefix invalidation so all companyId-scoped variants refresh.
    queryClient.invalidateQueries({ queryKey: ["fleet", "incidents"] });
    queryClient.invalidateQueries({ queryKey: ["fleet", "incident-metrics"] });
  };
}

/** Acknowledge an incident (scoped to the selected company's ownership guard). */
export function useAcknowledgeIncident() {
  const invalidate = useInvalidateIncidents();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: ({ id, by }: { id: string; by: { userId: string; name: string } }) =>
      fleetIncidentsApi.acknowledge(id, by, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
}

/** Escalate an incident to the next level (scoped to the selected company). */
export function useEscalateIncident() {
  const invalidate = useInvalidateIncidents();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (id: string) => fleetIncidentsApi.escalate(id, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
}

/** Resolve an incident (scoped to the selected company). */
export function useResolveIncident() {
  const invalidate = useInvalidateIncidents();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: ({
      id,
      resolution,
    }: {
      id: string;
      resolution: { summary: string; rootCause?: string; actions?: string[] };
    }) => fleetIncidentsApi.resolve(id, resolution, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Integration hooks
// ---------------------------------------------------------------------------
// Integrations are a global in-memory registry (not company-scoped), so these
// hooks don't gate on companyId.

/** List integrations for the selected company. Refetches every 30s. */
export function useIntegrations(provider?: string, status?: string) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.integrations(provider, status, selectedCompanyId ?? undefined),
    queryFn: () =>
      fleetIntegrationsApi.list({ provider, status, companyId: selectedCompanyId! }),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Recent ingested events for the selected company (or one integration). Refetches every 15s. */
export function useIntegrationEvents(integrationId?: string) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.integrationEvents(integrationId, selectedCompanyId ?? undefined),
    queryFn: () =>
      fleetIntegrationsApi.events({ integrationId, limit: 50, companyId: selectedCompanyId! }),
    enabled: !!selectedCompanyId,
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

/** Register a new integration for the selected company. */
export function useCreateIntegration() {
  const invalidate = useInvalidateIntegrations();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (data: {
      name: string;
      type: "webhook" | "polling" | "streaming";
      provider: string;
      auth: { type: string; token?: string; secret?: string };
      config?: Record<string, unknown>;
    }) => fleetIntegrationsApi.create({ ...data, companyId: selectedCompanyId ?? undefined }),
    onSuccess: invalidate,
  });
}

/** Send a test event through an integration. */
export function useTestIntegration() {
  const invalidate = useInvalidateIntegrations();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (id: string) => fleetIntegrationsApi.test(id, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
}

/** Remove an integration. */
export function useDeleteIntegration() {
  const invalidate = useInvalidateIntegrations();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (id: string) => fleetIntegrationsApi.remove(id, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Compliance & data governance hooks
// ---------------------------------------------------------------------------
// The compliance store is a global in-memory registry (not company-scoped),
// so these hooks don't gate on companyId.

/** Current weighted compliance score + factor breakdown for the selected company. Refetches every 30s. */
export function useComplianceScore() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.complianceScore(selectedCompanyId ?? undefined),
    queryFn: () => fleetComplianceApi.score(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** PII scan results for the selected company (newest first). Refetches every 15s. */
export function useComplianceScans(status?: string) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.complianceScans(status, selectedCompanyId ?? undefined),
    queryFn: () =>
      fleetComplianceApi.scanResults({
        status,
        limit: 20,
        companyId: selectedCompanyId ?? undefined,
      }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** Retention policies for the selected company. */
export function useCompliancePolicies() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.compliancePolicies(selectedCompanyId ?? undefined),
    queryFn: () => fleetComplianceApi.policies(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });
}

/** Compliance audit trail for the selected company (newest first). */
export function useComplianceAudit(action?: string) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.complianceAudit(action, selectedCompanyId ?? undefined),
    queryFn: () =>
      fleetComplianceApi.audit({
        action,
        limit: 50,
        companyId: selectedCompanyId ?? undefined,
      }),
    enabled: !!selectedCompanyId,
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

/** Start a PII scan across the tenant's bots. */
export function useStartComplianceScan() {
  const invalidate = useInvalidateCompliance();
  return useMutation({
    mutationFn: (data: {
      scope?: string;
      targetBotIds?: string[];
      requestedBy?: string;
      companyId?: string;
    }) => fleetComplianceApi.startScan(data),
    onSuccess: invalidate,
  });
}

/** Create a data retention policy, owned by the selected company. */
export function useCreateRetentionPolicy() {
  const invalidate = useInvalidateCompliance();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      dataCategory: string;
      retentionDays: number;
      action: RetentionAction;
      scope?: string;
    }) =>
      fleetComplianceApi.createPolicy({
        ...data,
        companyId: selectedCompanyId ?? undefined,
      }),
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
      companyId?: string;
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
  const { selectedCompanyId } = useCompany();
  const invalidate = useInvalidateDeployments();
  return useMutation({
    mutationFn: (id: string) =>
      fleetDeploymentsApi.execute(id, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
}

/** Pause a running deployment. */
export function usePauseDeployment() {
  const { selectedCompanyId } = useCompany();
  const invalidate = useInvalidateDeployments();
  return useMutation({
    mutationFn: (id: string) =>
      fleetDeploymentsApi.pause(id, undefined, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
}

/** Resume a paused deployment. */
export function useResumeDeployment() {
  const { selectedCompanyId } = useCompany();
  const invalidate = useInvalidateDeployments();
  return useMutation({
    mutationFn: (id: string) =>
      fleetDeploymentsApi.resume(id, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
}

/** Roll back a deployment. */
export function useRollbackDeployment() {
  const { selectedCompanyId } = useCompany();
  const invalidate = useInvalidateDeployments();
  return useMutation({
    mutationFn: (id: string) =>
      fleetDeploymentsApi.rollback(id, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
}

/** Cancel a deployment plan. */
export function useCancelDeployment() {
  const { selectedCompanyId } = useCompany();
  const invalidate = useInvalidateDeployments();
  return useMutation({
    mutationFn: (id: string) =>
      fleetDeploymentsApi.cancel(id, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
}

/** Dry-run a deployment plan (does not mutate state, so no invalidation). */
export function useDryRunDeployment() {
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (id: string) =>
      fleetDeploymentsApi.dryRun(id, selectedCompanyId ?? undefined),
  });
}

// ---------------------------------------------------------------------------
// Anomaly Correlation hooks
// ---------------------------------------------------------------------------
// The correlation engine is a global in-memory singleton fed by the
// fleet-bootstrap `alert.fired` → ingestAlert pipeline, but correlations are
// tenant-partitioned — these hooks scope by the selected company so one
// company never sees another's correlations.

/** List anomaly correlations, optionally filtered by status. Refetches every 15s. */
export function useCorrelations(status?: string) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.correlations(status, selectedCompanyId ?? undefined),
    queryFn: () => fleetMonitorApi.correlations(status, selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** Anomaly correlation statistics (counts, avg confidence, top root causes). */
export function useCorrelationStats() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.correlationStats(selectedCompanyId ?? undefined),
    queryFn: () => fleetMonitorApi.correlationStats(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

function useInvalidateCorrelations() {
  const queryClient = useQueryClient();
  return () => {
    // Prefix invalidation so all companyId-scoped variants refresh.
    queryClient.invalidateQueries({ queryKey: ["fleet", "correlations"] });
    queryClient.invalidateQueries({ queryKey: ["fleet", "correlation-stats"] });
  };
}

/** Mark a correlation as resolved. */
export function useResolveCorrelation() {
  const { selectedCompanyId } = useCompany();
  const invalidate = useInvalidateCorrelations();
  return useMutation({
    mutationFn: ({ id, resolvedBy }: { id: string; resolvedBy?: string }) =>
      fleetMonitorApi.correlationResolve(id, resolvedBy, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
}

/** Mark a correlation as a false positive (recorded for future learning). */
export function useMarkCorrelationFalsePositive() {
  const { selectedCompanyId } = useCompany();
  const invalidate = useInvalidateCorrelations();
  return useMutation({
    mutationFn: (id: string) =>
      fleetMonitorApi.correlationFalsePositive(id, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
}

// ─── Voice Intelligence ────────────────────────────────────────────────────

/** Fleet-wide voice analytics summary, scoped to the selected company. Refetches every 20s. */
export function useVoiceSummary() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.voiceSummary(selectedCompanyId ?? undefined),
    queryFn: () => fleetVoiceApi.summary(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}

/** Currently in-progress voice calls for the selected company. Refetches every 10s (live). */
export function useVoiceActiveCalls() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.voiceActive(selectedCompanyId ?? undefined),
    queryFn: () => fleetVoiceApi.active(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

/** Recent anomalous calls for the selected company, optionally filtered by type. Refetches every 20s. */
export function useVoiceAnomalies(type?: VoiceAnomalyType) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.voiceAnomalies(type, selectedCompanyId ?? undefined),
    queryFn: () => fleetVoiceApi.anomalies(type, selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}

/** Survey completion analytics for the selected company. Refetches every 30s. */
export function useVoiceSurvey() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.voiceSurvey(selectedCompanyId ?? undefined),
    queryFn: () => fleetVoiceApi.survey(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

// ─── Memory Mesh ──────────────────────────────────────────────────────────

/** Fleet-wide memory health report (per-bot stats + distribution). Refetches every 60s. */
export function useMemoryHealth() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.memoryHealth(selectedCompanyId ?? undefined),
    queryFn: () => fleetMemoryMeshApi.health(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Memory mesh summary statistics. Refetches every 30s. */
export function useMemoryStats() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.memoryStats(selectedCompanyId ?? undefined),
    queryFn: () => fleetMemoryMeshApi.stats(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Detected memory conflicts, optionally filtered by status. Refetches every 30s. */
export function useMemoryConflicts(status?: "open" | "resolved" | "dismissed") {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.memoryConflicts(status, selectedCompanyId ?? undefined),
    queryFn: () => fleetMemoryMeshApi.conflicts(status, selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Knowledge gaps — topics some bots know but others don't. Refetches every 60s. */
export function useMemoryGaps() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.memoryGaps(selectedCompanyId ?? undefined),
    queryFn: () => fleetMemoryMeshApi.gaps(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Cross-bot knowledge graph (topics + shared-bot edges). */
export function useMemoryGraph(minConnections?: number) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.memoryGraph(minConnections, selectedCompanyId ?? undefined),
    queryFn: () =>
      fleetMemoryMeshApi.graph({ minConnections, companyId: selectedCompanyId ?? undefined }),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

function useInvalidateMemoryMesh() {
  const queryClient = useQueryClient();
  return () => {
    // Prefix-invalidate so all companyId-scoped variants are refreshed (the keys
    // now carry a trailing companyId dimension — a fully-specified key wouldn't match).
    queryClient.invalidateQueries({ queryKey: ["fleet", "memory-conflicts"] });
    queryClient.invalidateQueries({ queryKey: ["fleet", "memory-stats"] });
    queryClient.invalidateQueries({ queryKey: ["fleet", "memory-health"] });
  };
}

/** Resolve a memory conflict (accept the suggested resolution). */
export function useResolveMemoryConflict() {
  const invalidate = useInvalidateMemoryMesh();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (id: string) =>
      fleetMemoryMeshApi.resolveConflict(id, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
}

/** Dismiss a memory conflict (no action needed). */
export function useDismissMemoryConflict() {
  const invalidate = useInvalidateMemoryMesh();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (id: string) =>
      fleetMemoryMeshApi.dismissConflict(id, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
}

/** Federated memory search across the fleet (on-demand, not auto-polled). */
export function useMemorySearch() {
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: ({ query, options }: { query: string; options?: FederatedSearchOptions }) =>
      // Scope the federated search to the active tenant so results never include
      // another company's private memory content.
      fleetMemoryMeshApi.search(query, {
        ...options,
        companyId: selectedCompanyId ?? undefined,
      }),
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
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.timeMachineBookmarks(selectedCompanyId ?? "", type),
    queryFn: () => fleetTimeMachineApi.bookmarks(selectedCompanyId!, type),
    enabled: !!selectedCompanyId,
  });
}

/** Create a time bookmark scoped to the selected fleet. */
export function useCreateTimeBookmark() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (input: {
      timestamp: string;
      label: string;
      type?: TimeBookmarkType;
      refId?: string;
    }) =>
      fleetTimeMachineApi.createBookmark({
        ...input,
        fleetId: selectedCompanyId!,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["fleet", "time-machine", "bookmarks"],
      });
    },
  });
}

/** Delete a time bookmark owned by the selected fleet. */
export function useDeleteTimeBookmark() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (id: string) =>
      fleetTimeMachineApi.deleteBookmark(id, selectedCompanyId ?? undefined),
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
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.sandboxComparison(id ?? ""),
    queryFn: () => fleetMonitorApi.sandboxComparison(id!, selectedCompanyId ?? undefined),
    enabled: !!id,
    retry: false,
  });
}

/** Promotion gate status for a sandbox. */
export function useSandboxGates(id: string | null) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.sandboxGates(id ?? ""),
    queryFn: () => fleetMonitorApi.sandboxGates(id!, selectedCompanyId ?? undefined),
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
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (id: string) => fleetMonitorApi.sandboxStart(id, selectedCompanyId ?? undefined),
    onSuccess: () => invalidateSandboxes(queryClient),
  });
}

/** Pause a running sandbox. */
export function usePauseSandbox() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (id: string) => fleetMonitorApi.sandboxPause(id, selectedCompanyId ?? undefined),
    onSuccess: () => invalidateSandboxes(queryClient),
  });
}

/** Destroy a sandbox. */
export function useDestroySandbox() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (id: string) => fleetMonitorApi.sandboxDestroy(id, selectedCompanyId ?? undefined),
    onSuccess: () => invalidateSandboxes(queryClient),
  });
}

/** Promote a sandbox's overrides to production (requires all gates passed). */
export function usePromoteSandbox() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: (id: string) => fleetMonitorApi.sandboxPromote(id, selectedCompanyId ?? undefined),
    onSuccess: () => invalidateSandboxes(queryClient),
  });
}

/** Manually approve a promotion gate. */
export function useApproveSandboxGate() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: ({ id, gateName }: { id: string; gateName: string }) =>
      fleetMonitorApi.sandboxApproveGate(id, gateName, selectedCompanyId ?? undefined),
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
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.healingStats(selectedCompanyId ?? undefined),
    queryFn: () => fleetHealingApi.stats(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** Recent remediation attempts (optionally per-bot), scoped to the selected company. Refetches every 15s. */
export function useHealingAttempts(botId?: string) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.healingAttempts(botId, selectedCompanyId ?? undefined),
    queryFn: () => fleetHealingApi.attempts({ botId, companyId: selectedCompanyId ?? undefined }),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** Healing audit log (optionally per-bot), scoped to the selected company. Refetches every 30s. */
export function useHealingAudit(botId?: string) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: queryKeys.fleet.healingAudit(botId, selectedCompanyId ?? undefined),
    queryFn: () => fleetHealingApi.audit({ botId, companyId: selectedCompanyId ?? undefined }),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

function invalidateHealing(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.fleet.healingPolicies() });
  // Prefix invalidation so every companyId-scoped stats/attempt/audit variant refreshes.
  queryClient.invalidateQueries({ queryKey: ["fleet", "healing-stats"] });
  queryClient.invalidateQueries({ queryKey: ["fleet", "healing-attempts"] });
  queryClient.invalidateQueries({ queryKey: ["fleet", "healing-audit"] });
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

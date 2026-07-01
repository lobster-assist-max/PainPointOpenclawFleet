export const queryKeys = {
  companies: {
    all: ["companies"] as const,
    detail: (id: string) => ["companies", id] as const,
    stats: ["companies", "stats"] as const,
  },
  agents: {
    list: (companyId: string) => ["agents", companyId] as const,
    detail: (id: string) => ["agents", "detail", id] as const,
    runtimeState: (id: string) => ["agents", "runtime-state", id] as const,
    taskSessions: (id: string) => ["agents", "task-sessions", id] as const,
    keys: (agentId: string) => ["agents", "keys", agentId] as const,
    configRevisions: (agentId: string) => ["agents", "config-revisions", agentId] as const,
    adapterModels: (companyId: string, adapterType: string) =>
      ["agents", companyId, "adapter-models", adapterType] as const,
  },
  issues: {
    list: (companyId: string) => ["issues", companyId] as const,
    search: (companyId: string, q: string, projectId?: string) =>
      ["issues", companyId, "search", q, projectId ?? "__all-projects__"] as const,
    listAssignedToMe: (companyId: string) => ["issues", companyId, "assigned-to-me"] as const,
    listTouchedByMe: (companyId: string) => ["issues", companyId, "touched-by-me"] as const,
    listUnreadTouchedByMe: (companyId: string) => ["issues", companyId, "unread-touched-by-me"] as const,
    labels: (companyId: string) => ["issues", companyId, "labels"] as const,
    listByProject: (companyId: string, projectId: string) =>
      ["issues", companyId, "project", projectId] as const,
    detail: (id: string) => ["issues", "detail", id] as const,
    comments: (issueId: string) => ["issues", "comments", issueId] as const,
    attachments: (issueId: string) => ["issues", "attachments", issueId] as const,
    documents: (issueId: string) => ["issues", "documents", issueId] as const,
    documentRevisions: (issueId: string, key: string) => ["issues", "document-revisions", issueId, key] as const,
    activity: (issueId: string) => ["issues", "activity", issueId] as const,
    runs: (issueId: string) => ["issues", "runs", issueId] as const,
    approvals: (issueId: string) => ["issues", "approvals", issueId] as const,
    liveRuns: (issueId: string) => ["issues", "live-runs", issueId] as const,
    activeRun: (issueId: string) => ["issues", "active-run", issueId] as const,
    workProducts: (issueId: string) => ["issues", "work-products", issueId] as const,
  },
  executionWorkspaces: {
    list: (companyId: string, filters?: Record<string, string | boolean | undefined>) =>
      ["execution-workspaces", companyId, filters ?? {}] as const,
    detail: (id: string) => ["execution-workspaces", "detail", id] as const,
  },
  projects: {
    list: (companyId: string) => ["projects", companyId] as const,
    detail: (id: string) => ["projects", "detail", id] as const,
  },
  goals: {
    list: (companyId: string) => ["goals", companyId] as const,
    detail: (id: string) => ["goals", "detail", id] as const,
  },
  budgets: {
    overview: (companyId: string) => ["budgets", "overview", companyId] as const,
  },
  approvals: {
    list: (companyId: string, status?: string) =>
      ["approvals", companyId, status] as const,
    detail: (approvalId: string) => ["approvals", "detail", approvalId] as const,
    comments: (approvalId: string) => ["approvals", "comments", approvalId] as const,
    issues: (approvalId: string) => ["approvals", "issues", approvalId] as const,
  },
  access: {
    joinRequests: (companyId: string, status: string = "pending_approval") =>
      ["access", "join-requests", companyId, status] as const,
    invite: (token: string) => ["access", "invite", token] as const,
  },
  auth: {
    session: ["auth", "session"] as const,
  },
  instance: {
    schedulerHeartbeats: ["instance", "scheduler-heartbeats"] as const,
    experimentalSettings: ["instance", "experimental-settings"] as const,
  },
  health: ["health"] as const,
  secrets: {
    list: (companyId: string) => ["secrets", companyId] as const,
    providers: (companyId: string) => ["secret-providers", companyId] as const,
  },
  dashboard: (companyId: string) => ["dashboard", companyId] as const,
  sidebarBadges: (companyId: string) => ["sidebar-badges", companyId] as const,
  activity: (companyId: string) => ["activity", companyId] as const,
  costs: (companyId: string, from?: string, to?: string) =>
    ["costs", companyId, from, to] as const,
  usageByProvider: (companyId: string, from?: string, to?: string) =>
    ["usage-by-provider", companyId, from, to] as const,
  usageByBiller: (companyId: string, from?: string, to?: string) =>
    ["usage-by-biller", companyId, from, to] as const,
  financeSummary: (companyId: string, from?: string, to?: string) =>
    ["finance-summary", companyId, from, to] as const,
  financeByBiller: (companyId: string, from?: string, to?: string) =>
    ["finance-by-biller", companyId, from, to] as const,
  financeByKind: (companyId: string, from?: string, to?: string) =>
    ["finance-by-kind", companyId, from, to] as const,
  financeEvents: (companyId: string, from?: string, to?: string, limit: number = 100) =>
    ["finance-events", companyId, from, to, limit] as const,
  usageWindowSpend: (companyId: string) =>
    ["usage-window-spend", companyId] as const,
  usageQuotaWindows: (companyId: string) =>
    ["usage-quota-windows", companyId] as const,
  heartbeats: (companyId: string, agentId?: string) =>
    ["heartbeats", companyId, agentId] as const,
  runDetail: (runId: string) => ["heartbeat-run", runId] as const,
  runWorkspaceOperations: (runId: string) => ["heartbeat-run", runId, "workspace-operations"] as const,
  liveRuns: (companyId: string) => ["live-runs", companyId] as const,
  runIssues: (runId: string) => ["run-issues", runId] as const,
  org: (companyId: string) => ["org", companyId] as const,
  skills: {
    available: ["skills", "available"] as const,
  },
  plugins: {
    all: ["plugins"] as const,
    examples: ["plugins", "examples"] as const,
    detail: (pluginId: string) => ["plugins", pluginId] as const,
    health: (pluginId: string) => ["plugins", pluginId, "health"] as const,
    uiContributions: ["plugins", "ui-contributions"] as const,
    config: (pluginId: string) => ["plugins", pluginId, "config"] as const,
    dashboard: (pluginId: string) => ["plugins", pluginId, "dashboard"] as const,
    logs: (pluginId: string) => ["plugins", pluginId, "logs"] as const,
  },
  // ── Fleet Monitor ─────────────────────────────────────────────────────
  fleet: {
    status: (companyId: string) => ["fleet", "status", companyId] as const,
    botHealth: (botId: string) => ["fleet", "bot-health", botId] as const,
    botSessions: (botId: string) => ["fleet", "bot-sessions", botId] as const,
    botUsage: (botId: string, from?: string, to?: string) =>
      ["fleet", "bot-usage", botId, from, to] as const,
    botIdentity: (botId: string) => ["fleet", "bot-identity", botId] as const,
    botChannels: (botId: string) => ["fleet", "bot-channels", botId] as const,
    botCron: (botId: string) => ["fleet", "bot-cron", botId] as const,
    botFile: (botId: string, filename: string) =>
      ["fleet", "bot-file", botId, filename] as const,
    alerts: (companyId: string, state?: string) =>
      ["fleet", "alerts", companyId, state] as const,
    botTraces: (botId: string) => ["fleet", "bot-traces", botId] as const,
    heatmap: (companyId: string, granularity: string, botId?: string) =>
      ["fleet", "heatmap", companyId, granularity, botId] as const,
    discovery: () => ["fleet", "discovery"] as const,
    tags: (companyId?: string) => ["fleet", "tags", companyId] as const,
    budgets: () => ["fleet", "budgets"] as const,
    budgetStatuses: () => ["fleet", "budget-statuses"] as const,
    recommendations: (companyId: string) => ["fleet", "recommendations", companyId] as const,
    trustProfile: (botId: string) => ["fleet", "trust-profile", botId] as const,
    trustDistribution: () => ["fleet", "trust-distribution"] as const,
    playbooks: () => ["fleet", "playbooks"] as const,
    playbookStats: () => ["fleet", "playbook-stats"] as const,
    playbookExecutions: (status?: string) =>
      ["fleet", "playbook-executions", status] as const,
    a2aExpertise: (companyId: string) => ["fleet", "a2a-expertise", companyId] as const,
    a2aCollaborations: (companyId: string) =>
      ["fleet", "a2a-collaborations", companyId] as const,
    a2aStats: (companyId: string, periodStart: string, periodEnd: string) =>
      ["fleet", "a2a-stats", companyId, periodStart, periodEnd] as const,
    convTopics: (companyId: string) => ["fleet", "conv-topics", companyId] as const,
    convGaps: (companyId: string) => ["fleet", "conv-gaps", companyId] as const,
    convSatisfaction: (companyId: string, periodStart: string, periodEnd: string) =>
      ["fleet", "conv-satisfaction", companyId, periodStart, periodEnd] as const,
    convFunnel: (companyId: string) => ["fleet", "conv-funnel", companyId] as const,
    convInconsistencies: (companyId: string) =>
      ["fleet", "conv-inconsistencies", companyId] as const,
    vaultSecrets: (companyId: string) => ["fleet", "vault-secrets", companyId] as const,
    vaultHealth: (companyId: string) => ["fleet", "vault-health", companyId] as const,
    costBreakdown: (companyId: string) => ["fleet", "cost-breakdown", companyId] as const,
    costFindings: (companyId: string) => ["fleet", "cost-findings", companyId] as const,
    costSavings: (companyId: string) => ["fleet", "cost-savings", companyId] as const,
    pluginInventory: (companyId?: string) =>
      ["fleet", "plugin-inventory", companyId ?? "all"] as const,
    interBotGraph: () => ["fleet", "inter-bot-graph"] as const,
    interBotBlast: (botId: string) =>
      ["fleet", "inter-bot-blast", botId] as const,
    quality: () => ["fleet", "quality"] as const,
    canaryExperiments: () => ["fleet", "canary-experiments"] as const,
    capacityForecasts: () => ["fleet", "capacity-forecasts"] as const,
    incidents: (companyId?: string, status?: string, severity?: string) =>
      ["fleet", "incidents", companyId ?? "none", status ?? "all", severity ?? "all"] as const,
    incidentMetrics: (companyId?: string) =>
      ["fleet", "incident-metrics", companyId ?? "none"] as const,
    integrations: (provider?: string, status?: string) =>
      ["fleet", "integrations", provider ?? "all", status ?? "all"] as const,
    integrationEvents: (integrationId?: string) =>
      ["fleet", "integration-events", integrationId ?? "all"] as const,
    complianceScore: () => ["fleet", "compliance-score"] as const,
    complianceScans: (status?: string, companyId?: string) =>
      ["fleet", "compliance-scans", status ?? "all", companyId ?? "all"] as const,
    compliancePolicies: () => ["fleet", "compliance-policies"] as const,
    complianceAudit: (action?: string) =>
      ["fleet", "compliance-audit", action ?? "all"] as const,
    deployments: (fleetId?: string, status?: string) =>
      ["fleet", "deployments", fleetId ?? "all", status ?? "all"] as const,
    deploymentStats: (fleetId?: string) =>
      ["fleet", "deployment-stats", fleetId ?? "default"] as const,
    correlations: (status?: string) =>
      ["fleet", "correlations", status ?? "all"] as const,
    correlationStats: () => ["fleet", "correlation-stats"] as const,
    voiceSummary: () => ["fleet", "voice-summary"] as const,
    voiceActive: () => ["fleet", "voice-active"] as const,
    voiceAnomalies: (type?: string) =>
      ["fleet", "voice-anomalies", type ?? "all"] as const,
    voiceSurvey: () => ["fleet", "voice-survey"] as const,
    memoryHealth: (companyId?: string) =>
      ["fleet", "memory-health", companyId ?? "all"] as const,
    memoryStats: (companyId?: string) =>
      ["fleet", "memory-stats", companyId ?? "all"] as const,
    memoryConflicts: (status?: string, companyId?: string) =>
      ["fleet", "memory-conflicts", status ?? "all", companyId ?? "all"] as const,
    memoryGaps: (companyId?: string) =>
      ["fleet", "memory-gaps", companyId ?? "all"] as const,
    memoryGraph: (minConnections?: number, companyId?: string) =>
      ["fleet", "memory-graph", minConnections ?? "all", companyId ?? "all"] as const,
    metaObservables: () => ["fleet", "meta-observables"] as const,
    metaSuggestions: (status?: string) =>
      ["fleet", "meta-suggestions", status ?? "all"] as const,
    metaSensitivity: () => ["fleet", "meta-sensitivity"] as const,
    metaHistory: (limit?: number) =>
      ["fleet", "meta-history", limit ?? "all"] as const,
    metaConfig: () => ["fleet", "meta-config"] as const,
    metaStats: () => ["fleet", "meta-stats"] as const,
    timeMachineReconstruct: (fleetId: string, timestamp: string) =>
      ["fleet", "time-machine", "reconstruct", fleetId, timestamp] as const,
    timeMachineRange: (fleetId: string) =>
      ["fleet", "time-machine", "range", fleetId] as const,
    timeMachineBookmarks: (type?: string) =>
      ["fleet", "time-machine", "bookmarks", type ?? "all"] as const,
    sandboxes: (includeDestroyed?: boolean) =>
      ["fleet", "sandboxes", includeDestroyed ? "all" : "active"] as const,
    sandboxComparison: (id: string) =>
      ["fleet", "sandbox-comparison", id] as const,
    sandboxGates: (id: string) => ["fleet", "sandbox-gates", id] as const,
    healingPolicies: () => ["fleet", "healing-policies"] as const,
    healingStats: () => ["fleet", "healing-stats"] as const,
    healingAttempts: (botId?: string) =>
      ["fleet", "healing-attempts", botId ?? "all"] as const,
    healingAudit: (botId?: string) =>
      ["fleet", "healing-audit", botId ?? "all"] as const,
  },
};

/**
 * Fleet Anomaly Correlation Engine
 *
 * Correlates alerts across bots to identify root causes. Instead of
 * treating each bot's alert independently, this engine detects when
 * multiple alerts share a common cause (e.g., shared host overload,
 * provider outage, network issue).
 *
 * Key capabilities:
 * - Temporal correlation (alerts within configurable time window)
 * - Infrastructure topology awareness (which bots share hosts/providers)
 * - Metric pattern matching (correlated degradation curves)
 * - Root cause inference (infrastructure, provider, channel, config, traffic)
 * - Suggested actions with automated execution support
 * - False positive learning (improve accuracy from human feedback)
 */

import { EventEmitter } from "events";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CorrelatedAlert {
  alertId: string;
  botId: string;
  botName: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: Date;
  severity: "warning" | "critical";
}

export interface CorrelationScores {
  temporalWindow: number; // seconds between first and last alert
  temporalScore: number; // 0-1
  infrastructureScore: number; // 0-1
  metricCorrelation: number; // 0-1
  overallConfidence: number; // 0-1
}

export interface HostInfo {
  ip: string;
  hostname?: string;
  botIds: string[];
  metrics?: {
    cpuUsage?: number;
    memoryUsage?: number;
    diskUsage?: number;
    networkLatency?: number;
  };
}

export interface InfraTopology {
  sharedHost: boolean;
  sharedNetwork: boolean;
  sharedModel: boolean;
  sharedChannel: boolean;
  hostInfo?: HostInfo;
}

export type RootCauseCategory =
  | "infrastructure"
  | "provider"
  | "channel"
  | "config"
  | "traffic"
  | "unknown";

export interface RootCause {
  category: RootCauseCategory;
  description: string;
  confidence: number;
  evidence: string[];
  affectedBots: string[];
}

export interface SuggestedAction {
  action: string;
  priority: "immediate" | "soon" | "later";
  automated: boolean;
  expectedImpact: string;
}

export type CorrelationStatus =
  | "investigating"
  | "confirmed"
  | "resolved"
  | "false_positive";

export interface AnomalyCorrelation {
  id: string;
  detectedAt: Date;
  relatedAlerts: CorrelatedAlert[];
  correlation: CorrelationScores;
  topology: InfraTopology;
  rootCause: RootCause;
  suggestedActions: SuggestedAction[];
  status: CorrelationStatus;
  resolvedAt?: Date;
  resolvedBy?: string;
  notes?: string;
}

export interface InfrastructureTopology {
  hosts: HostInfo[];
  sharedResources: Array<{
    type: "host" | "network" | "model_provider" | "channel" | "database";
    identifier: string;
    dependents: string[]; // bot IDs
  }>;
}

export interface CorrelationConfig {
  enabled: boolean;
  temporalWindowMs: number; // max time between correlated alerts
  minConfidence: number; // minimum confidence to create correlation (0-1)
  minAlerts: number; // minimum alerts to trigger correlation
  autoResolveAfterMs: number; // auto-resolve if no new alerts after this period
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class AnomalyCorrelationEngine extends EventEmitter {
  private correlations: Map<string, AnomalyCorrelation> = new Map();
  private pendingAlerts: CorrelatedAlert[] = []; // buffer for correlation
  private topology: InfrastructureTopology;
  private config: CorrelationConfig;
  private correlationTimer: ReturnType<typeof setInterval> | null = null;
  private falsePositivePatterns: Map<string, number> = new Map(); // pattern → count

  constructor(
    topology?: InfrastructureTopology,
    config?: Partial<CorrelationConfig>,
  ) {
    super();
    this.topology = topology ?? { hosts: [], sharedResources: [] };
    this.config = {
      enabled: true,
      temporalWindowMs: 5 * 60 * 1000, // 5 minutes
      minConfidence: 0.7,
      minAlerts: 2,
      autoResolveAfterMs: 30 * 60 * 1000, // 30 minutes
      ...config,
    };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    if (!this.config.enabled) return;

    // Process pending alerts every 30 seconds
    this.correlationTimer = setInterval(() => this.processPendingAlerts(), 30_000);
    this.emit("started");
  }

  stop(): void {
    if (this.correlationTimer) {
      clearInterval(this.correlationTimer);
      this.correlationTimer = null;
    }
    this.emit("stopped");
  }

  // ── Topology Management ──────────────────────────────────────────────────

  updateTopology(topology: InfrastructureTopology): void {
    this.topology = topology;
    this.emit("topology_updated", topology);
  }

  addHost(host: HostInfo): void {
    const existing = this.topology.hosts.findIndex((h) => h.ip === host.ip);
    if (existing >= 0) {
      this.topology.hosts[existing] = host;
    } else {
      this.topology.hosts.push(host);
    }
  }

  getTopology(): InfrastructureTopology {
    return this.topology;
  }

  /**
   * Infer topology from bot gateway URLs.
   * Bots on the same IP are assumed to share a host.
   */
  inferTopologyFromGateways(
    bots: Array<{ id: string; name: string; gatewayUrl: string }>,
  ): void {
    const hostMap = new Map<string, string[]>();

    for (const bot of bots) {
      try {
        const url = new URL(bot.gatewayUrl);
        const ip = url.hostname;
        const existing = hostMap.get(ip) ?? [];
        existing.push(bot.id);
        hostMap.set(ip, existing);
      } catch {
        console.warn("[fleet] Invalid gateway URL for bot", bot.id, bot.gatewayUrl);
      }
    }

    this.topology.hosts = Array.from(hostMap.entries()).map(([ip, botIds]) => ({
      ip,
      botIds,
    }));

    // Build shared resources
    this.topology.sharedResources = [];
    for (const host of this.topology.hosts) {
      if (host.botIds.length > 1) {
        this.topology.sharedResources.push({
          type: "host",
          identifier: host.ip,
          dependents: host.botIds,
        });
      }
    }
  }

  // ── Alert Ingestion ──────────────────────────────────────────────────────

  ingestAlert(alert: CorrelatedAlert): void {
    this.pendingAlerts.push(alert);
    this.emit("alert_ingested", alert);

    // Immediately check if we can correlate
    this.processPendingAlerts();
  }

  // ── Correlation Processing ───────────────────────────────────────────────

  private processPendingAlerts(): void {
    if (this.pendingAlerts.length < this.config.minAlerts) return;

    const now = Date.now();

    // Remove stale alerts (older than 2x temporal window)
    this.pendingAlerts = this.pendingAlerts.filter(
      (a) => now - a.timestamp.getTime() < this.config.temporalWindowMs * 2,
    );

    // Find clusters of temporally close alerts
    const clusters = this.clusterAlerts(this.pendingAlerts);

    for (const cluster of clusters) {
      if (cluster.length < this.config.minAlerts) continue;

      // Check if these alerts are already part of an existing correlation
      const alertIds = new Set(cluster.map((a) => a.alertId));
      const existingCorrelation = Array.from(this.correlations.values()).find(
        (c) =>
          c.status === "investigating" &&
          c.relatedAlerts.some((a) => alertIds.has(a.alertId)),
      );

      if (existingCorrelation) {
        // Add new alerts to existing correlation
        for (const alert of cluster) {
          if (!existingCorrelation.relatedAlerts.some((a) => a.alertId === alert.alertId)) {
            existingCorrelation.relatedAlerts.push(alert);
          }
        }
        existingCorrelation.correlation = this.calculateCorrelation(existingCorrelation.relatedAlerts);
        existingCorrelation.rootCause = this.inferRootCause(existingCorrelation);
        continue;
      }

      // Calculate correlation scores
      const scores = this.calculateCorrelation(cluster);

      if (scores.overallConfidence < this.config.minConfidence) continue;

      // Check false positive patterns
      const patternKey = this.getPatternKey(cluster);
      const fpCount = this.falsePositivePatterns.get(patternKey) ?? 0;
      if (fpCount >= 3) continue; // Skip patterns that are usually false positives

      // Create new correlation
      const topology = this.analyzeTopology(cluster);
      const correlation: AnomalyCorrelation = {
        id: `corr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        detectedAt: new Date(),
        relatedAlerts: cluster,
        correlation: scores,
        topology,
        rootCause: { category: "unknown", description: "", confidence: 0, evidence: [], affectedBots: [] },
        suggestedActions: [],
        status: "investigating",
      };

      correlation.rootCause = this.inferRootCause(correlation);
      correlation.suggestedActions = this.suggestActions(correlation);

      this.correlations.set(correlation.id, correlation);

      // Remove correlated alerts from pending
      for (const alert of cluster) {
        const idx = this.pendingAlerts.findIndex((a) => a.alertId === alert.alertId);
        if (idx >= 0) this.pendingAlerts.splice(idx, 1);
      }

      this.emit("correlation_detected", correlation);

      // Schedule auto-resolve check
      setTimeout(() => this.checkAutoResolve(correlation.id), this.config.autoResolveAfterMs);
    }
  }

  private clusterAlerts(alerts: CorrelatedAlert[]): CorrelatedAlert[][] {
    if (alerts.length === 0) return [];

    // Sort by timestamp
    const sorted = [...alerts].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const clusters: CorrelatedAlert[][] = [];
    let currentCluster: CorrelatedAlert[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const timeDiff = sorted[i].timestamp.getTime() - sorted[i - 1].timestamp.getTime();

      if (timeDiff <= this.config.temporalWindowMs) {
        currentCluster.push(sorted[i]);
      } else {
        clusters.push(currentCluster);
        currentCluster = [sorted[i]];
      }
    }
    clusters.push(currentCluster);

    return clusters;
  }

  // ── Correlation Calculation ──────────────────────────────────────────────

  private calculateCorrelation(alerts: CorrelatedAlert[]): CorrelationScores {
    if (alerts.length < 2) {
      return { temporalWindow: 0, temporalScore: 0, infrastructureScore: 0, metricCorrelation: 0, overallConfidence: 0 };
    }

    // Temporal score: closer in time = higher score
    const timestamps = alerts.map((a) => a.timestamp.getTime());
    const temporalWindow = (Math.max(...timestamps) - Math.min(...timestamps)) / 1000;
    const maxWindow = this.config.temporalWindowMs / 1000;
    const temporalScore = Math.max(0, 1 - temporalWindow / maxWindow);

    // Infrastructure score: shared resources = higher score
    const botIds = [...new Set(alerts.map((a) => a.botId))];
    let infraScore = 0;
    for (const resource of this.topology.sharedResources) {
      const matchingBots = botIds.filter((id) => resource.dependents.includes(id));
      if (matchingBots.length >= 2) {
        infraScore = Math.max(infraScore, matchingBots.length / botIds.length);
      }
    }

    // Metric correlation: same metric type = higher score
    const metricTypes = alerts.map((a) => a.metric);
    const uniqueMetrics = new Set(metricTypes).size;
    const metricCorrelation = 1 - (uniqueMetrics - 1) / Math.max(1, alerts.length - 1);

    // Overall confidence: weighted combination
    const overallConfidence =
      temporalScore * 0.35 + infraScore * 0.35 + metricCorrelation * 0.3;

    return {
      temporalWindow,
      temporalScore: Math.round(temporalScore * 100) / 100,
      infrastructureScore: Math.round(infraScore * 100) / 100,
      metricCorrelation: Math.round(metricCorrelation * 100) / 100,
      overallConfidence: Math.round(overallConfidence * 100) / 100,
    };
  }

  // ── Topology Analysis ────────────────────────────────────────────────────

  private analyzeTopology(alerts: CorrelatedAlert[]): InfraTopology {
    const botIds = [...new Set(alerts.map((a) => a.botId))];

    let sharedHost = false;
    let hostInfo: HostInfo | undefined;
    let sharedNetwork = false;
    let sharedModel = false;
    let sharedChannel = false;

    for (const resource of this.topology.sharedResources) {
      const matchingBots = botIds.filter((id) => resource.dependents.includes(id));
      if (matchingBots.length >= 2) {
        switch (resource.type) {
          case "host":
            sharedHost = true;
            hostInfo = this.topology.hosts.find((h) => h.ip === resource.identifier);
            break;
          case "network":
            sharedNetwork = true;
            break;
          case "model_provider":
            sharedModel = true;
            break;
          case "channel":
            sharedChannel = true;
            break;
        }
      }
    }

    return { sharedHost, sharedNetwork, sharedModel, sharedChannel, hostInfo };
  }

  // ── Root Cause Inference ─────────────────────────────────────────────────

  private inferRootCause(correlation: AnomalyCorrelation): RootCause {
    const { topology, relatedAlerts } = correlation;
    const affectedBots = [...new Set(relatedAlerts.map((a) => a.botId))];
    const evidence: string[] = [];

    // Infrastructure root cause
    if (topology.sharedHost) {
      evidence.push(`${affectedBots.length} bots share host ${topology.hostInfo?.ip ?? "unknown"}`);
      evidence.push(
        `Alerts within ${correlation.correlation.temporalWindow.toFixed(0)}s window`,
      );

      if (topology.hostInfo?.metrics?.cpuUsage && topology.hostInfo.metrics.cpuUsage > 80) {
        evidence.push(`Host CPU usage: ${topology.hostInfo.metrics.cpuUsage}%`);
      }

      return {
        category: "infrastructure",
        description: `Host overload on ${topology.hostInfo?.ip ?? "shared host"} affecting ${affectedBots.length} bots`,
        confidence: Math.min(0.95, correlation.correlation.overallConfidence + 0.1),
        evidence,
        affectedBots,
      };
    }

    // Provider root cause
    if (topology.sharedModel) {
      evidence.push("Affected bots share the same model provider");
      evidence.push(
        `Response time metrics correlated (score: ${correlation.correlation.metricCorrelation})`,
      );

      return {
        category: "provider",
        description: `Model provider degradation affecting ${affectedBots.length} bots`,
        confidence: correlation.correlation.overallConfidence,
        evidence,
        affectedBots,
      };
    }

    // Channel root cause
    if (topology.sharedChannel) {
      evidence.push("Affected bots share the same messaging channel");

      return {
        category: "channel",
        description: `Messaging channel issue affecting ${affectedBots.length} bots`,
        confidence: correlation.correlation.overallConfidence * 0.9,
        evidence,
        affectedBots,
      };
    }

    // Traffic spike root cause (same time, different infrastructure)
    const allResponseTime = relatedAlerts.every(
      (a) => a.metric.includes("response") || a.metric.includes("latency"),
    );
    if (allResponseTime && !topology.sharedHost) {
      evidence.push("All alerts are response-time related");
      evidence.push("Bots do not share infrastructure");
      evidence.push("Possible traffic spike across the fleet");

      return {
        category: "traffic",
        description: `Fleet-wide traffic spike affecting ${affectedBots.length} bots`,
        confidence: correlation.correlation.overallConfidence * 0.7,
        evidence,
        affectedBots,
      };
    }

    // Unknown
    evidence.push(
      `${relatedAlerts.length} alerts from ${affectedBots.length} bots within ${correlation.correlation.temporalWindow.toFixed(0)}s`,
    );

    return {
      category: "unknown",
      description: `Correlated anomaly across ${affectedBots.length} bots — root cause undetermined`,
      confidence: correlation.correlation.overallConfidence * 0.5,
      evidence,
      affectedBots,
    };
  }

  // ── Action Suggestion ────────────────────────────────────────────────────

  private suggestActions(correlation: AnomalyCorrelation): SuggestedAction[] {
    const actions: SuggestedAction[] = [];
    const { rootCause } = correlation;

    switch (rootCause.category) {
      case "infrastructure":
        actions.push({
          action: "Pause non-critical cron jobs on affected bots",
          priority: "immediate",
          automated: true,
          expectedImpact: "Reduce host load by ~15-30%",
        });
        actions.push({
          action: `Check host ${correlation.topology.hostInfo?.ip ?? ""} CPU/memory usage`,
          priority: "immediate",
          automated: false,
          expectedImpact: "Identify host-level bottleneck",
        });
        if (rootCause.affectedBots.length > 2) {
          actions.push({
            action: "Consider migrating one bot to a different host",
            priority: "soon",
            automated: false,
            expectedImpact: "Reduce host contention permanently",
          });
        }
        break;

      case "provider":
        actions.push({
          action: "Check model provider status page",
          priority: "immediate",
          automated: false,
          expectedImpact: "Confirm provider-side issue",
        });
        actions.push({
          action: "Switch to fallback model provider if available",
          priority: "soon",
          automated: true,
          expectedImpact: "Restore response times to normal",
        });
        break;

      case "channel":
        actions.push({
          action: "Check messaging channel status",
          priority: "immediate",
          automated: false,
          expectedImpact: "Confirm channel-side issue",
        });
        actions.push({
          action: "Enable message queue to buffer during outage",
          priority: "soon",
          automated: true,
          expectedImpact: "Prevent message loss during channel downtime",
        });
        break;

      case "traffic":
        actions.push({
          action: "Enable rate limiting on affected bots",
          priority: "immediate",
          automated: true,
          expectedImpact: "Prevent session overload",
        });
        actions.push({
          action: "Scale routing to distribute load",
          priority: "soon",
          automated: true,
          expectedImpact: "Balance traffic across available bots",
        });
        break;

      default:
        actions.push({
          action: "Investigate individual alerts for common patterns",
          priority: "soon",
          automated: false,
          expectedImpact: "Manual root cause identification",
        });
    }

    return actions;
  }

  // ── Status Management ────────────────────────────────────────────────────

  resolveCorrelation(correlationId: string, resolvedBy?: string): boolean {
    const correlation = this.correlations.get(correlationId);
    if (!correlation || correlation.status === "resolved") return false;

    correlation.status = "resolved";
    correlation.resolvedAt = new Date();
    correlation.resolvedBy = resolvedBy;

    this.emit("correlation_resolved", { correlationId, resolvedBy });
    return true;
  }

  markFalsePositive(correlationId: string): boolean {
    const correlation = this.correlations.get(correlationId);
    if (!correlation) return false;

    correlation.status = "false_positive";

    // Learn from false positive
    const patternKey = this.getPatternKey(correlation.relatedAlerts);
    const count = (this.falsePositivePatterns.get(patternKey) ?? 0) + 1;
    this.falsePositivePatterns.set(patternKey, count);

    this.emit("false_positive_marked", { correlationId, patternKey, learnedCount: count });
    return true;
  }

  private checkAutoResolve(correlationId: string): void {
    const correlation = this.correlations.get(correlationId);
    if (!correlation || correlation.status !== "investigating") return;

    // Check if any new alerts have been added recently
    const latestAlert = correlation.relatedAlerts.reduce(
      (latest, a) => (a.timestamp > latest.timestamp ? a : latest),
      correlation.relatedAlerts[0],
    );

    const timeSinceLastAlert = Date.now() - latestAlert.timestamp.getTime();
    if (timeSinceLastAlert >= this.config.autoResolveAfterMs) {
      correlation.status = "resolved";
      correlation.resolvedAt = new Date();
      correlation.resolvedBy = "auto-resolve";
      correlation.notes = `Auto-resolved: no new alerts for ${Math.round(timeSinceLastAlert / 60000)} minutes`;

      this.emit("correlation_auto_resolved", { correlationId });
    }
  }

  private getPatternKey(alerts: CorrelatedAlert[]): string {
    const botIds = [...new Set(alerts.map((a) => a.botId))].sort().join(",");
    const metrics = [...new Set(alerts.map((a) => a.metric))].sort().join(",");
    return `${botIds}|${metrics}`;
  }

  // ── Query Methods ────────────────────────────────────────────────────────

  getCorrelation(correlationId: string): AnomalyCorrelation | undefined {
    return this.correlations.get(correlationId);
  }

  listCorrelations(status?: CorrelationStatus): AnomalyCorrelation[] {
    let results = Array.from(this.correlations.values());
    if (status) {
      results = results.filter((c) => c.status === status);
    }
    return results.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
  }

  getStats(): {
    total: number;
    active: number;
    resolved: number;
    falsePositives: number;
    avgConfidence: number;
    topRootCauses: Array<{ category: string; count: number }>;
  } {
    const all = Array.from(this.correlations.values());
    const active = all.filter((c) => c.status === "investigating");
    const resolved = all.filter((c) => c.status === "resolved");
    const fps = all.filter((c) => c.status === "false_positive");

    const avgConfidence =
      all.length > 0
        ? all.reduce((sum, c) => sum + c.correlation.overallConfidence, 0) / all.length
        : 0;

    const rootCauseCounts = new Map<string, number>();
    for (const c of all.filter((c) => c.status !== "false_positive")) {
      const count = (rootCauseCounts.get(c.rootCause.category) ?? 0) + 1;
      rootCauseCounts.set(c.rootCause.category, count);
    }

    return {
      total: all.length,
      active: active.length,
      resolved: resolved.length,
      falsePositives: fps.length,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      topRootCauses: Array.from(rootCauseCounts.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
    };
  }
}

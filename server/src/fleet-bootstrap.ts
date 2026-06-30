/**
 * Fleet Bootstrap — Wires fleet monitoring services into the server lifecycle.
 *
 * Handles:
 * - Starting the FleetAlertService evaluation loop
 * - Connecting fleet events to the LiveEvent system
 * - Starting Canary Lab, Quality Engine, and Capacity Planner
 * - Graceful shutdown (3-phase: pause → drain → force-close)
 */

import type { Db } from "@paperclipai/db";
import { logger } from "./middleware/logger.js";
import {
  getFleetMonitorService,
  disposeFleetMonitorService,
} from "./services/fleet-monitor.js";
import { captureFleetSnapshots } from "./services/fleet-snapshot-capture.js";
import { persistDeviceToken } from "./services/fleet-device-token-store.js";
import { estimateTokenCostUsd } from "./services/fleet-pricing.js";
import { getFleetAlertService } from "./services/fleet-alerts.js";
import type { Alert } from "./services/fleet-alerts.js";
import { getIncidentManager } from "./services/fleet-incidents.js";
import { getInterBotGraph, disposeInterBotGraph } from "./services/fleet-inter-bot-graph.js";
import { getFleetRateLimiter, disposeFleetRateLimiter } from "./services/fleet-rate-limiter.js";
import { getCanaryLabEngine, disposeCanaryLabEngine } from "./services/fleet-canary.js";
import { getQualityEngine, disposeQualityEngine } from "./services/fleet-quality.js";
import { getCapacityPlanner, disposeCapacityPlanner } from "./services/fleet-capacity.js";
import { getCustomerJourneyEngine, disposeCustomerJourneyEngine } from "./services/fleet-customer-journey-singleton.js";
import { getMetaLearningEngine, disposeMetaLearningEngine } from "./services/fleet-meta-learning-singleton.js";
import { getAnomalyCorrelationEngine, disposeAnomalyCorrelationEngine } from "./services/fleet-anomaly-correlation-singleton.js";
import { getMemoryMeshEngine, disposeMemoryMeshEngine } from "./services/fleet-memory-mesh-singleton.js";
import { getVoiceIntelligenceEngine, disposeVoiceIntelligenceEngine } from "./services/fleet-voice-intelligence-singleton.js";
import { getHealingPolicyEngine, disposeHealingPolicyEngine } from "./services/fleet-healing.js";
import type { RemediationAction } from "./services/fleet-healing.js";
import { getPlaybookEngine } from "./services/fleet-playbook-engine.js";
import type { PlaybookStep, PlaybookExecution, StepExecutionOutcome } from "./services/fleet-playbook-engine.js";
import {
  refreshFleetMetrics,
  getFleetMetricsSnapshots,
  disposeFleetMetricsProvider,
} from "./services/fleet-metrics-provider.js";
import { publishLiveEvent } from "./services/live-events.js";

let booted = false;
let alertInterval: ReturnType<typeof setInterval> | null = null;
let snapshotInterval: ReturnType<typeof setInterval> | null = null;
let snapshotTimeout: ReturnType<typeof setTimeout> | null = null;
let graphMetaInterval: ReturnType<typeof setInterval> | null = null;
let graphMetaTimeout: ReturnType<typeof setTimeout> | null = null;
let metricsInterval: ReturnType<typeof setInterval> | null = null;
let healingPruneInterval: ReturnType<typeof setInterval> | null = null;

// Refresh the shared bot-metrics cache every 30s — the alert engine and the
// self-healing engine both read it synchronously on their own 30s eval cycles.
const METRICS_REFRESH_INTERVAL_MS = 30 * 1000;
// Prune healing attempts/audit entries older than 24h, hourly.
const HEALING_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

// Capture a snapshot row per connected bot every 15 minutes. The heatmap
// query averages rows into day/hour buckets, so sub-hourly capture just
// smooths the average while making fresh data visible within minutes
// rather than after a full hour.
const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;
// Delay the first capture so bots have time to connect + authenticate
// after server boot (otherwise the first batch records everything as
// "connecting" / score 25).
const SNAPSHOT_INITIAL_DELAY_MS = 90 * 1000;

// Refresh inter-bot graph node metadata (name/emoji/health) every 5 minutes.
// Edges are fed live from agent events (sessions_send/sessions_spawn), but the
// node labels + health come from each bot's identity/health and would otherwise
// stay as raw botIds with health 0. Same 90s initial delay so identities are
// resolvable before the first refresh.
const GRAPH_META_INTERVAL_MS = 5 * 60 * 1000;
const GRAPH_META_INITIAL_DELAY_MS = 90 * 1000;

/**
 * Best-effort substitution of `{{botId}}` / `{{botName}}` / `{{playbookName}}`
 * and any execution-context key into a playbook notification template.
 */
function renderPlaybookTemplate(template: string, execution: PlaybookExecution): string {
  const vars: Record<string, unknown> = {
    botId: execution.targetBotId ?? "",
    botName: execution.targetBotId ?? "",
    playbookName: execution.playbookName,
    ...(execution.context ?? {}),
  };
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? whole : String(value);
  });
}

/**
 * Bootstrap fleet monitoring services after server.listen().
 *
 * Routes are already mounted in app.ts — this function handles the
 * lifecycle concerns that routes can't: event wiring, alert scheduling,
 * and shutdown registration.
 */
export function bootstrapFleet(db?: Db): void {
  if (booted) return;

  const monitor = getFleetMonitorService();
  const alerts = getFleetAlertService();

  // ─── Wire the shared bot-metrics provider ─────────────────────────────
  // CRITICAL: nothing previously called `setMetricsProvider` on the alert
  // engine, so `evaluate()` always early-returned (`if (!metricsProvider)
  // return;`) — NO alert ever fired, which starved the whole downstream chain
  // (alert → incident, alert → anomaly-correlation). The healing engine has the
  // same contract. Both now read the same cache, refreshed in the background.
  alerts.setMetricsProvider(getFleetMetricsSnapshots);
  const refreshMetrics = () => {
    refreshFleetMetrics(monitor).catch((err) => {
      logger.warn({ err }, "[Fleet] metrics refresh failed");
    });
  };
  refreshMetrics();
  metricsInterval = setInterval(refreshMetrics, METRICS_REFRESH_INTERVAL_MS);

  // ─── Start alert evaluation loop (every 30s) ──────────────────────────
  alertInterval = setInterval(() => {
    try {
      alerts.evaluate();
    } catch (err) {
      logger.error({ err }, "[Fleet] Alert evaluation tick failed");
    }
  }, 30_000);

  // ─── Wire alerts → incidents ──────────────────────────────────────────
  // A serious alert (critical/warning) firing opens a fleet incident so the
  // Incidents page reflects live operational events, not just manually-filed
  // ones. Deduped by alert source so the same recurring alert doesn't spawn a
  // pile of duplicate open incidents — one open incident per (rule, bot) until
  // it's resolved. info-severity alerts are skipped (too noisy for incidents).
  alerts.on("alert.fired", (alert: Alert) => {
    try {
      if (alert.severity !== "critical" && alert.severity !== "warning") return;
      const manager = getIncidentManager();
      const source = `alert:${alert.ruleId}:${alert.botId}`;
      if (manager.findOpenIncidentBySource(source)) return;
      manager.createIncident({
        title: alert.ruleName,
        description: alert.message,
        severity: alert.severity === "critical" ? "critical" : "major",
        affectedBots: [alert.botId],
        source,
      });
    } catch (err) {
      logger.error({ err }, "[Fleet] Incident creation from alert failed");
    }
  });

  // ─── Wire circuit-breaker trips → incidents ───────────────────────────
  // FleetMonitorService emits "botCircuitBreaker" when a bot's gateway
  // connection fails repeatedly and the breaker trips ("open") or starts
  // probing for recovery ("half-open"). A tripped breaker means the bot is
  // effectively unreachable — a genuine operational incident — so we open a
  // critical incident, deduped by source so a flapping breaker yields one open
  // incident per bot until it recovers. (We deliberately do NOT wire the
  // noisier "botError" connection-error event here: every failed reconnect
  // attempt emits one, and the breaker is the already-debounced, escalated
  // signal — exactly the right altitude for an incident.) The companion
  // botStateChange listener below auto-resolves the incident when the bot
  // climbs back to "monitoring".
  monitor.on(
    "botCircuitBreaker",
    ({ botId, state }: { botId: string; state: string }) => {
      try {
        if (state !== "open") return; // half-open = recovery probe, not a new incident
        const manager = getIncidentManager();
        const source = `circuit-breaker:${botId}`;
        if (manager.findOpenIncidentBySource(source)) return;
        manager.createIncident({
          title: `Gateway circuit breaker open: ${botId}`,
          description:
            `The gateway connection for ${botId} failed repeatedly and its ` +
            `circuit breaker tripped open. The bot is unreachable until the ` +
            `connection recovers.`,
          severity: "critical",
          affectedBots: [botId],
          source,
        });
      } catch (err) {
        logger.error({ err }, "[Fleet] Incident creation from circuit breaker failed");
      }
    },
  );

  // ─── Start fleet snapshot capture loop ────────────────────────────────
  // Persists each connected bot's health/usage into fleet_snapshots so the
  // Fleet Health Heatmap has real data. Requires a db handle — skipped in
  // contexts where none is provided (e.g. tests).
  if (db) {
    const runCapture = () => {
      captureFleetSnapshots(db).catch((err) => {
        logger.warn({ err }, "[Fleet] snapshot capture batch failed");
      });
    };
    snapshotTimeout = setTimeout(() => {
      runCapture();
      snapshotInterval = setInterval(runCapture, SNAPSHOT_INTERVAL_MS);
    }, SNAPSHOT_INITIAL_DELAY_MS);
  }

  // ─── Wire deviceTokenReceived → persist refreshed device token ─────────
  // The openclaw-gateway adapter authenticates with a device credential; the
  // gateway can hand back a freshly issued/rotated device token during the
  // connection handshake, which the monitor re-emits as "deviceTokenReceived".
  // Before this listener nothing consumed it, so the rotated token was dropped
  // and agents.adapterConfig.deviceToken stayed stale — the next reconnect kept
  // using the old token and could fail auth once it expired. Requires a db
  // handle (skipped in tests, matching the snapshot loop above).
  if (db) {
    monitor.on(
      "deviceTokenReceived",
      ({ botId, deviceToken }: { botId: string; deviceToken: string }) => {
        void persistDeviceToken(db, botId, deviceToken, monitor);
      },
    );
  }

  // ─── Wire monitor events → alert evaluation ───────────────────────────
  // When a bot's health changes, immediately re-evaluate alerts for that bot
  // instead of waiting for the next 30s tick.
  monitor.on(
    "botStateChange",
    ({ botId, to }: { botId: string; from: string; to: string }) => {
      try {
        alerts.evaluate();
        // Close the circuit-breaker incident lifecycle: when a bot climbs back
        // to a healthy "monitoring" state, auto-resolve any open incident the
        // tripped breaker opened above, so recovered bots don't leave a stale
        // critical incident lingering on the Incidents page.
        if (to === "monitoring") {
          const manager = getIncidentManager();
          const open = manager.findOpenIncidentBySource(`circuit-breaker:${botId}`);
          if (open) {
            manager.resolveIncident(open.id, {
              summary: `${botId} reconnected; gateway circuit breaker recovered.`,
              rootCause: "Repeated gateway connection failures tripped the circuit breaker.",
              actions: ["Connection re-established and bot returned to monitoring state."],
            });
          }
        }
      } catch (err) {
        logger.error({ err, botId }, "[Fleet] Alert evaluation for bot failed");
      }
    },
  );

  // ─── Wire monitor events → LiveEvent system ───────────────────────────
  // FleetMonitorService already calls publishLiveEvent() internally for
  // agent.status and activity.logged events. Fleet-specific events
  // (fleet.bot.health, fleet.bot.connected, fleet.alert.triggered) are
  // emitted via the EventEmitter and will be picked up by the
  // LiveUpdatesProvider on the frontend through the existing WS.

  // ─── Initialize inter-bot graph ───────────────────────────────────────
  const graph = getInterBotGraph();

  // ─── Initialize rate limiter ────────────────────────────────────────────
  const rateLimiter = getFleetRateLimiter();

  // ─── Initialize Canary Lab (A/B experiments) ──────────────────────────────
  const canaryLab = getCanaryLabEngine();
  canaryLab.start();

  // Wire monitor data → canary lab sample ingestion
  canaryLab.on("collectSamples", async () => {
    for (const bot of monitor.getAllBots()) {
      try {
        const health = await monitor.getBotHealth(bot.botId);
        // Real average cost per session from live token usage (was hardcoded 0,
        // which made the canary cost-difference guardrail meaningless). total
        // token cost ÷ session count; falls back to 0 when usage is unavailable.
        const usage = await monitor.getBotUsage(bot.botId);
        const sessionCount = usage?.sessions?.length ?? 0;
        const totalCost = usage?.total
          ? estimateTokenCostUsd(
              usage.total.inputTokens,
              usage.total.outputTokens,
              usage.total.cachedInputTokens ?? 0,
            )
          : 0;
        const costPerSession = sessionCount > 0 ? totalCost / sessionCount : 0;
        canaryLab.ingestSample(bot.botId, {
          health_score: health?.ok ? 100 : 0,
          cost_per_session: costPerSession,
          error_rate: health?.ok ? 0 : 1,
        });
      } catch {
        /* RPC failure — skip this bot for this collection cycle */
      }
    }
  });

  // ─── Initialize Quality Engine (CQI) ───────────────────────────────────────
  const qualityEngine = getQualityEngine();
  qualityEngine.start();

  // Wire monitor session data → quality engine computation.
  // The engine emits "computeAll" every 5 min; we feed each connected bot's
  // live sessions, mapping the monitor's BotSessionEntry → RawSessionData.
  // Note: the monitor exposes a limited session shape (no per-turn response
  // times, escalation flags, or returning-user signals), so reliability/
  // experience dimensions fall back to the engine's optimistic defaults while
  // effectiveness/engagement are driven by real session counts + activity.
  const ACTIVE_SESSION_WINDOW_MS = 30 * 60 * 1000; // 30 min since last activity = active
  qualityEngine.on("computeAll", async () => {
    for (const bot of monitor.getAllBots()) {
      try {
        const sessions = await monitor.getBotSessions(bot.botId);
        const now = Date.now();
        qualityEngine.computeForBot(bot.botId, {
          sessions: sessions.map((s) => {
            const lastActivity = s.lastActivityAt
              ? Date.parse(s.lastActivityAt)
              : NaN;
            const active =
              Number.isFinite(lastActivity) &&
              now - lastActivity < ACTIVE_SESSION_WINDOW_MS;
            const messageCount = s.messageCount ?? 0;
            return {
              id: s.sessionKey,
              userId: s.sessionKey,
              active,
              endedNormally: !active,
              escalated: false,
              isReturningUser: false,
              turnCount: messageCount,
              userMessageCount: Math.ceil(messageCount / 2),
              lastUserMessageAt: Number.isFinite(lastActivity)
                ? new Date(lastActivity)
                : undefined,
              responseTimes: [],
            };
          }),
          toolCalls: { total: 0, successful: 0 },
        });
      } catch {
        /* RPC failure — skip this bot for this computation cycle */
      }
    }
  });

  // ─── Initialize Capacity Planner ────────────────────────────────────────────
  const capacityPlanner = getCapacityPlanner();
  capacityPlanner.start();

  // Wire daily cost/session data → capacity planner.
  // cost_usd is modelled as an *incremental* per-interval spend (the saturation
  // projection sums the series), but getBotUsage returns cumulative token totals.
  // We track the previous cumulative fleet cost and push the positive delta each
  // refresh — was hardcoded 0, so the cost forecast never moved. The first
  // refresh has no baseline, so it pushes 0 and seeds the baseline.
  let prevFleetCumulativeCost: number | null = null;
  capacityPlanner.on("refreshData", async () => {
    try {
      let totalSessions = 0;
      let cumulativeCost = 0;
      const bots = monitor.getAllBots();
      for (const bot of bots) {
        try {
          const sessions = await monitor.getBotSessions(bot.botId);
          totalSessions += sessions.length;
        } catch {
          /* RPC failure — skip this bot */
        }
        try {
          const usage = await monitor.getBotUsage(bot.botId);
          if (usage?.total) {
            cumulativeCost += estimateTokenCostUsd(
              usage.total.inputTokens,
              usage.total.outputTokens,
              usage.total.cachedInputTokens ?? 0,
            );
          }
        } catch {
          /* RPC failure — skip this bot's cost */
        }
      }
      // Clamp to 0 so a disconnected bot dropping out of the sum (or a usage
      // reset) can't push a negative spend into the forecast.
      const incrementalCost =
        prevFleetCumulativeCost === null
          ? 0
          : Math.max(0, cumulativeCost - prevFleetCumulativeCost);
      prevFleetCumulativeCost = cumulativeCost;

      capacityPlanner.pushDataPoint("fleet", "cost_usd", incrementalCost);
      capacityPlanner.pushDataPoint("fleet", "session_count", totalSessions);
      capacityPlanner.pushDataPoint("fleet", "active_bots", bots.length);
    } catch (err) {
      logger.error({ err }, "[Fleet] Capacity data push failed");
    }
  });

  // ─── Wire agent events → inter-bot graph ────────────────────────────────
  // Capture sessions_send / sessions_spawn tool calls to build the graph.
  // The monitor emits "botEvent" with the raw FleetGatewayEvent — the previous
  // "webhookEvent" listener matched no emitted event (the monitor only emits
  // botEvent / botStateChange / botError / botCircuitBreaker / deviceTokenReceived),
  // so the inter-bot graph received ZERO edges (only node metadata from the
  // refresh loop below) and always rendered a disconnected fleet. Worse, the old
  // handler also read the wrong nesting: agent tool calls arrive as
  // event.type === "agent" with the tool info at payload.stream === "tool_use"
  // and payload.data.{toolName,args} — NOT top-level payload.toolName/payload.args
  // (see PLAN.md 途徑 1 and FleetGatewayClient.collectTraceEvent). All fields are
  // defensively type-guarded, matching the botEvent journey listener above.
  monitor.on("botEvent", ({ botId, event }: {
    botId: string; event: { type: string; payload?: Record<string, unknown> };
  }) => {
    if (event.type !== "agent") return;
    const payload = event.payload ?? {};
    if (payload.stream !== "tool_use") return;
    const data =
      typeof payload.data === "object" && payload.data !== null
        ? (payload.data as Record<string, unknown>)
        : {};
    const toolName = typeof data.toolName === "string" ? data.toolName : undefined;
    const args =
      typeof data.args === "object" && data.args !== null
        ? (data.args as Record<string, unknown>)
        : {};
    if (toolName === "sessions_send" && typeof args.targetAgentId === "string") {
      graph.addEdge({
        from: botId,
        to: args.targetAgentId,
        type: "message",
        lastSeen: new Date(),
      });
    } else if (toolName === "sessions_spawn" && typeof args.agentId === "string") {
      graph.addEdge({
        from: botId,
        to: args.agentId,
        type: "spawn",
        lastSeen: new Date(),
      });
    }
  });

  // ─── Refresh inter-bot graph node metadata periodically ─────────────────
  // The graph's edges arrive live from agent events above, but each node's
  // display name / emoji / health come from the bot's identity + health RPC.
  // Without this loop, getGraph() returns nodes labelled with raw botIds and
  // healthScore 0 (the widget would render anonymous grey circles).
  const refreshGraphMetadata = async () => {
    for (const bot of monitor.getAllBots()) {
      try {
        const [identity, health] = await Promise.all([
          monitor.getBotIdentity(bot.botId).catch(() => null),
          monitor.getBotHealth(bot.botId).catch(() => null),
        ]);
        const name =
          identity && typeof identity.name === "string"
            ? identity.name
            : bot.botId;
        const emoji =
          identity && typeof identity.emoji === "string"
            ? identity.emoji
            : "🤖";
        // Mirror the snapshot-capture health derivation: monitoring+ok → 100,
        // monitoring+unhealthy → 50, transitional → 25, else → 0.
        let healthScore = 0;
        if (bot.state === "monitoring") healthScore = health?.ok ? 100 : 50;
        else if (bot.state === "connecting" || bot.state === "authenticating") {
          healthScore = 25;
        }
        graph.updateBotMetadata(bot.botId, { name, emoji, healthScore });
      } catch (err) {
        logger.warn(
          { err, botId: bot.botId },
          "[Fleet] inter-bot graph metadata refresh failed for bot",
        );
      }
    }
  };
  graphMetaTimeout = setTimeout(() => {
    refreshGraphMetadata().catch((err) => {
      logger.warn({ err }, "[Fleet] inter-bot graph metadata refresh batch failed");
    });
    graphMetaInterval = setInterval(() => {
      refreshGraphMetadata().catch((err) => {
        logger.warn({ err }, "[Fleet] inter-bot graph metadata refresh batch failed");
      });
    }, GRAPH_META_INTERVAL_MS);
  }, GRAPH_META_INITIAL_DELAY_MS);

  // ─── Initialize Customer Journey Engine ──────────────────────────────────
  const journeyEngine = getCustomerJourneyEngine();
  journeyEngine.start();

  // Wire touchpoints from the monitor's live gateway event stream. The monitor
  // emits "botEvent" with the raw FleetGatewayEvent — the previous "sessionEvent"
  // listener matched no emitted event, so the Customer Journey engine was never
  // fed. We filter for chat events and defensively extract the session/channel
  // metadata (sessionKey is a real gateway-event payload key — see
  // fleet-gateway-client). addTouchpoint itself validates the session key shape
  // (peer sessions only) and skips anything else, so no garbage is recorded.
  const VALID_INTENTS = new Set(["inquiry", "pricing", "technical", "general"]);
  monitor.on("botEvent", ({ botId, event }: {
    botId: string; event: { type: string; payload?: Record<string, unknown> };
  }) => {
    if (event.type !== "chat") return;
    const payload = event.payload ?? {};
    const sessionKey =
      typeof payload.sessionKey === "string" ? payload.sessionKey
      : typeof payload.session === "string" ? payload.session
      : "";
    if (!sessionKey) return; // no session identity → nothing to attribute
    const channel = typeof payload.channel === "string" ? payload.channel : "unknown";
    const intent =
      typeof payload.intent === "string" && VALID_INTENTS.has(payload.intent)
        ? (payload.intent as "inquiry" | "pricing" | "technical" | "general")
        : undefined;
    try {
      journeyEngine.addTouchpoint(sessionKey, botId, botId, channel, {
        summary: typeof payload.summary === "string" ? payload.summary : "",
        intent,
        turnCount: typeof payload.turnCount === "number" ? payload.turnCount : undefined,
        cost: typeof payload.cost === "number" ? payload.cost : undefined,
      });
    } catch (err) {
      logger.error({ err, botId }, "[Fleet] Journey touchpoint ingestion failed");
    }
  });

  // ─── Initialize Meta-Learning Engine ────────────────────────────────────
  const metaLearning = getMetaLearningEngine();
  metaLearning.start();

  // ─── Initialize Anomaly Correlation Engine ──────────────────────────────
  const anomalyCorrelation = getAnomalyCorrelationEngine();

  // Infer topology from connected bots
  const connectedBots = monitor.getAllBots().map((b) => ({
    id: b.botId,
    name: b.botId,
    gatewayUrl: b.gatewayUrl ?? "",
  }));
  anomalyCorrelation.inferTopologyFromGateways(connectedBots);
  anomalyCorrelation.start();

  // Wire alert events → anomaly correlation. The alert service emits
  // "alert.fired" (see FleetAlertService) — the previous "alertTriggered"
  // listener matched no emitted event, so the correlation engine was never fed
  // and the Anomaly page stayed permanently empty. info-severity alerts are
  // skipped (the correlation engine only reasons about warning/critical
  // anomalies and CorrelatedAlert only models those two severities).
  alerts.on("alert.fired", (alert: Alert) => {
    try {
      if (alert.severity !== "warning" && alert.severity !== "critical") return;
      // Refresh topology from currently-connected bots before correlating.
      // The boot-time inference (below) runs before any bot has connected, so
      // without this the shared-host map is empty and the infrastructure
      // correlation dimension never fires. inferTopologyFromGateways is
      // idempotent (it fully rebuilds hosts + sharedResources each call).
      anomalyCorrelation.inferTopologyFromGateways(
        monitor.getAllBots().map((b) => ({
          id: b.botId,
          name: b.botId,
          gatewayUrl: b.gatewayUrl ?? "",
        })),
      );
      anomalyCorrelation.ingestAlert({
        alertId: alert.id,
        botId: alert.botId,
        botName: alert.botId,
        metric: alert.metric,
        value: alert.currentValue,
        threshold: alert.threshold,
        timestamp: new Date(alert.firedAt),
        severity: alert.severity,
      });
    } catch (err) {
      logger.error({ err }, "[Fleet] Anomaly correlation alert ingestion failed");
    }
  });

  // ─── Initialize Memory Mesh Engine ──────────────────────────────────────
  const memoryMesh = getMemoryMeshEngine();
  memoryMesh.start();

  // ─── Initialize Voice Intelligence Engine ───────────────────────────────
  // Starts the anomaly-pruning timer. Call data is populated via the engine's
  // ingestEvent/startCall API once a gateway forwards voice events; until then
  // the Voice page renders its Preview fallback.
  const voiceEngine = getVoiceIntelligenceEngine();
  voiceEngine.startPruning();

  // ─── Initialize Self-Healing Engine ─────────────────────────────────────
  // Evaluates healing policies against the same bot-metrics cache the alert
  // engine reads, every 30s. When a policy triggers, the remediation handler
  // actuates against the live gateway. Auto-Reconnect (the flagship default
  // policy) genuinely reconnects offline bots; notify_operator surfaces a
  // dashboard live event. Actions with no gateway primitive yet
  // (restart_channel/downgrade_model/clear_session_cache/throttle_requests)
  // report an honest failure so the engine escalates to an operator rather than
  // silently faking success.
  const healing = getHealingPolicyEngine();
  healing.setMetricsProvider(getFleetMetricsSnapshots);
  healing.setRemediationHandler(async (botId, action: RemediationAction) => {
    switch (action) {
      case "reconnect":
      case "restart_bot": {
        const client = monitor.getClient(botId);
        if (!client) {
          return { success: false, message: `No active connection for ${botId}` };
        }
        try {
          client.disconnect();
          await client.connect();
          const ok = client.getState() === "monitoring";
          return ok
            ? { success: true, message: `Reconnected ${botId}` }
            : { success: false, message: `Reconnect attempted; state is ${client.getState()}` };
        } catch (err) {
          return { success: false, message: err instanceof Error ? err.message : String(err) };
        }
      }
      case "notify_operator": {
        const companyId = monitor.getBotInfo(botId)?.companyId;
        if (companyId) {
          publishLiveEvent({
            companyId,
            type: "fleet.alert.triggered",
            payload: { botId, source: "self-healing", action: "notify_operator" },
          });
        }
        return { success: true, message: "Operator notified" };
      }
      default:
        // restart_channel, downgrade_model, clear_session_cache, throttle_requests
        return {
          success: false,
          message: `${action} remediation is not yet supported by the gateway`,
        };
    }
  });
  healing.start();
  healingPruneInterval = setInterval(() => {
    try {
      healing.pruneOldEntries();
    } catch (err) {
      logger.warn({ err }, "[Fleet] healing prune failed");
    }
  }, HEALING_PRUNE_INTERVAL_MS);

  // ─── Wire the Ops Playbook step executor → real gateway actions ───────────
  // Playbook executions advance step-by-step in the engine; this executor
  // actuates each non-control step against the live fleet. `check`/`action`
  // steps with method `rpc` issue a real gateway RPC to the execution's target
  // bot; `notification` steps publish a real dashboard LiveEvent. Steps with no
  // gateway primitive yet (http checks, `command`/`deployment`/`rollback`
  // actions, decision branching) complete as honest no-ops with a reason rather
  // than pretending to run — matching the self-healing handler's discipline.
  const playbooks = getPlaybookEngine();
  playbooks.setStepExecutor(async (step: PlaybookStep, ctx): Promise<StepExecutionOutcome> => {
    const botId = ctx.execution.targetBotId;
    switch (step.type) {
      case "check": {
        if (step.check?.method === "rpc" && botId) {
          try {
            const result = await monitor.rpcForBot(botId, step.check.target, {});
            return { ok: true, result: { method: "rpc", target: step.check.target, response: result } };
          } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
          }
        }
        return { ok: true, result: { executed: false, reason: `check method "${step.check?.method ?? "none"}" not actuated`, botId: botId ?? null } };
      }
      case "action": {
        if (step.action?.method === "rpc" && botId) {
          try {
            const result = await monitor.rpcForBot(botId, step.action.target, step.action.params ?? {});
            return { ok: true, result: { method: "rpc", target: step.action.target, response: result } };
          } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
          }
        }
        return { ok: true, result: { executed: false, reason: `action method "${step.action?.method ?? "none"}" not yet supported by the gateway`, botId: botId ?? null } };
      }
      case "notification": {
        const companyId = botId ? monitor.getBotInfo(botId)?.companyId : undefined;
        if (companyId) {
          publishLiveEvent({
            companyId,
            type: "fleet.alert.triggered",
            payload: {
              botId,
              source: "playbook",
              playbook: ctx.playbook.name,
              message: renderPlaybookTemplate(step.notification?.template ?? "", ctx.execution),
              channels: step.notification?.channels ?? [],
            },
          });
          return { ok: true, result: { notified: true, companyId, channels: step.notification?.channels ?? [] } };
        }
        return { ok: true, result: { executed: false, reason: "no company resolved for notification", botId: botId ?? null } };
      }
      default:
        // decision branching is not evaluated by this engine — steps advance linearly.
        return { ok: true, result: { executed: false, reason: `step type "${step.type}" advances without action` } };
    }
  });

  booted = true;
  logger.info("[Fleet] Bootstrap complete — monitoring + alerts + graph + rate-limiter + canary-lab + quality + capacity + journey + meta-learning + anomaly-correlation + memory-mesh + voice + self-healing ready");
}

/**
 * Graceful shutdown: clean up fleet monitoring resources.
 *
 * Phase 1 (immediate): Stop alert evaluation
 * Phase 2 (0-3s): Disconnect all bots (sends WS close frames)
 * Phase 3 (forced): Dispose service instances
 */
export async function shutdownFleet(): Promise<void> {
  if (!booted) return;

  logger.info("[Fleet] Shutting down...");

  // Phase 1: Stop alert loop + snapshot capture
  if (alertInterval) {
    clearInterval(alertInterval);
    alertInterval = null;
  }
  if (snapshotTimeout) {
    clearTimeout(snapshotTimeout);
    snapshotTimeout = null;
  }
  if (snapshotInterval) {
    clearInterval(snapshotInterval);
    snapshotInterval = null;
  }
  if (graphMetaTimeout) {
    clearTimeout(graphMetaTimeout);
    graphMetaTimeout = null;
  }
  if (graphMetaInterval) {
    clearInterval(graphMetaInterval);
    graphMetaInterval = null;
  }
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
  if (healingPruneInterval) {
    clearInterval(healingPruneInterval);
    healingPruneInterval = null;
  }

  // Phase 2: Disconnect all bots gracefully
  const monitor = getFleetMonitorService();
  const botIds = monitor.getAllBots().map((b) => b.botId);
  const disconnectPromises = botIds.map((botId) => {
    try {
      monitor.disconnectBot(botId);
    } catch (err) {
      logger.warn({ err, botId }, "[Fleet] Best-effort disconnect failed");
    }
  });
  await Promise.allSettled(disconnectPromises);

  // Phase 3: Dispose singletons
  disposeCustomerJourneyEngine();
  disposeMetaLearningEngine();
  disposeAnomalyCorrelationEngine();
  disposeMemoryMeshEngine();
  disposeVoiceIntelligenceEngine();
  disposeCanaryLabEngine();
  disposeQualityEngine();
  disposeCapacityPlanner();
  disposeInterBotGraph();
  disposeFleetRateLimiter();
  disposeHealingPolicyEngine();
  disposeFleetMetricsProvider();
  disposeFleetMonitorService();

  booted = false;
  logger.info(
    `[Fleet] Shutdown complete — disconnected ${botIds.length} bot(s)`,
  );
}

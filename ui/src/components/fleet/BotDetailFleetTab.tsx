/**
 * BotDetailFleetTab — Fleet-specific tab for the AgentDetail page.
 *
 * Displays Gateway-level real-time data:
 *   - Connection info (state, URL, protocol, uptime, device ID)
 *   - Health score breakdown (5 dimensions)
 *   - Channel status list
 *   - Active sessions
 *   - Memory viewer (MEMORY.md content)
 *   - Cron jobs
 *
 * Data sourced entirely from Fleet Monitor API hooks.
 */

import { useState } from "react";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  ExternalLink,
  Clock,
  Zap,
  Radio,
  Calendar,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useBotFromFleet,
  useBotHealth,
  useBotSessions,
  useBotChannels,
  useBotCron,
  useDisconnectBot,
  connectionStateLabel,
  timeAgo,
} from "@/hooks/useFleetMonitor";
import { fleetMonitorApi } from "@/api/fleet-monitor";
import {
  botConnectionBadge,
  healthGradeColor,
} from "@/lib/status-colors";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

// ---------------------------------------------------------------------------
// Health bar component
// ---------------------------------------------------------------------------

function HealthBar({ label, icon, score }: { label: string; icon: string; score: number }) {
  const barColor =
    score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : score >= 40 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-5 text-center shrink-0">{icon}</span>
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${score}%` }} />
      </div>
      <span className="w-8 text-right font-mono text-xs">{score}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface BotDetailFleetTabProps {
  agentId: string;
}

export function BotDetailFleetTab({ agentId }: BotDetailFleetTabProps) {
  const bot = useBotFromFleet(agentId);
  const { data: healthData } = useBotHealth(agentId);
  const { data: sessions } = useBotSessions(agentId);
  const { data: channels } = useBotChannels(agentId);
  const { data: cronJobs } = useBotCron(agentId);
  const disconnectMutation = useDisconnectBot();

  // Memory file (MEMORY.md)
  const [memoryRefreshKey, setMemoryRefreshKey] = useState(0);
  const { data: memoryFile, isLoading: memoryLoading } = useQuery({
    queryKey: [...queryKeys.fleet.botFile(agentId, "MEMORY.md"), memoryRefreshKey],
    queryFn: () => fleetMonitorApi.botFile(agentId, "MEMORY.md"),
    staleTime: 120_000,
  });

  if (!bot) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <WifiOff className="h-8 w-8 mb-3" />
        <p className="text-sm">This bot is not connected to the Fleet Monitor.</p>
        <p className="text-xs mt-1">Connect it from the Fleet Monitor page to see live data.</p>
      </div>
    );
  }

  const health = healthData?.health ?? bot.healthScore;
  const stateLabel = connectionStateLabel(bot.connectionState);
  const stateBadge = botConnectionBadge[bot.connectionState] ?? "bg-muted text-muted-foreground";
  const gradeColor = health ? (healthGradeColor[health.grade] ?? "") : "";

  return (
    <div className="space-y-6 pb-8">
      {/* ── Connection Info + Health Breakdown ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Connection Card */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Connection
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">State</span>
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", stateBadge)}>
                {stateLabel}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gateway</span>
              <span className="font-mono text-xs">{bot.gatewayUrl}</span>
            </div>
            {bot.gatewayVersion && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono text-xs">{bot.gatewayVersion}</span>
              </div>
            )}
            {bot.uptime != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uptime</span>
                <span className="text-xs">{formatDuration(bot.uptime)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last event</span>
              <span className="text-xs">{timeAgo(bot.freshness.lastUpdated)}</span>
            </div>
          </div>
        </div>

        {/* Health Breakdown Card */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Health
            {health && (
              <span className={cn("ml-auto text-lg font-bold", gradeColor)}>
                {health.overall}/100 ({health.grade})
              </span>
            )}
          </h3>
          {health ? (
            <div className="space-y-2">
              <HealthBar icon="🔗" label="Connectivity" score={health.breakdown.connectivity} />
              <HealthBar icon="⚡" label="Responsiveness" score={health.breakdown.responsiveness} />
              <HealthBar icon="💰" label="Efficiency" score={health.breakdown.efficiency} />
              <HealthBar icon="📡" label="Channels" score={health.breakdown.channels} />
              <HealthBar icon="⏰" label="Cron" score={health.breakdown.cron} />
              <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                <span>Trend:</span>
                <span>
                  {health.trend === "improving" ? "📈 Improving" : health.trend === "degrading" ? "📉 Degrading" : "→ Stable"}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Health data not yet available.</p>
          )}
        </div>
      </div>

      {/* ── Channels ──────────────────────────────────────────────────── */}
      {channels && channels.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Wifi className="h-4 w-4" />
            Channels
          </h3>
          <div className="divide-y divide-border">
            {channels.map((ch) => (
              <div key={ch.name} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-block w-2 h-2 rounded-full",
                      ch.connected ? "bg-green-500" : "bg-neutral-400",
                    )}
                    style={ch.connected && channelDotHex[ch.type] ? { backgroundColor: channelDotHex[ch.type] } : undefined}
                    aria-label={ch.connected ? "Connected" : "Disconnected"}
                  />
                  <span className="font-medium capitalize">{ch.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{ch.messageCount24h} msgs/24h</span>
                  <span>{ch.connected ? "Connected" : "Disconnected"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Active Sessions ───────────────────────────────────────────── */}
      {sessions && sessions.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Active Sessions ({sessions.length})
          </h3>
          <div className="divide-y divide-border">
            {sessions.slice(0, 10).map((s) => (
              <div key={s.sessionKey} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-mono text-xs">{s.sessionKey}</span>
                  {s.title && <span className="ml-2 text-muted-foreground text-xs">— {s.title}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{s.messageCount} msgs</span>
                  <span>{timeAgo(s.lastActivityAt)}</span>
                </div>
              </div>
            ))}
            {sessions.length > 10 && (
              <div className="py-2 text-xs text-muted-foreground text-center">
                +{sessions.length - 10} more sessions
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Memory Viewer ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Memory (MEMORY.md)
          </h3>
          <button
            onClick={() => setMemoryRefreshKey((k) => k + 1)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
            aria-label="Refresh memory file"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", memoryLoading && "animate-spin")} />
          </button>
        </div>
        {memoryFile?.content ? (
          <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/50 rounded-md p-3 max-h-60 overflow-y-auto">
            {memoryFile.content}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">
            {memoryLoading ? "Loading..." : "No MEMORY.md found for this bot."}
          </p>
        )}
      </div>

      {/* ── Cron Jobs ─────────────────────────────────────────────────── */}
      {cronJobs && cronJobs.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Cron Jobs ({cronJobs.length})
          </h3>
          <div className="divide-y divide-border">
            {cronJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs", job.enabled ? "text-green-600" : "text-muted-foreground")}>
                    {job.enabled ? "●" : "○"}
                  </span>
                  <span className="font-medium">{job.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{job.schedule}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {job.lastRunAt ? (
                    <span>
                      {job.lastRunStatus === "success" ? "✅" : "❌"} {timeAgo(job.lastRunAt)}
                    </span>
                  ) : (
                    <span>Never run</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {bot.gatewayUrl && (
          <a
            href={bot.gatewayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Control UI
          </a>
        )}
        <button
          onClick={() => disconnectMutation.mutate(bot.botId)}
          disabled={disconnectMutation.isPending}
          className="inline-flex items-center gap-1.5 text-sm text-destructive hover:underline disabled:opacity-50"
        >
          <WifiOff className="h-3.5 w-3.5" />
          {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect Bot"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Channel type → hex color for dot indicators */
const channelDotHex: Record<string, string> = {
  line: "#00B900",
  telegram: "#26A5E4",
  discord: "#5865F2",
  whatsapp: "#25D366",
  slack: "#4A154B",
  web: "#D4A373",
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

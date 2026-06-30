/**
 * Fleet Memory Mesh page.
 *
 * Surfaces cross-bot memory federation: a fleet-wide health report (per-bot
 * memory counts, staleness, topic coverage), detected memory conflicts (where
 * two bots hold contradictory facts about the same topic), knowledge gaps
 * (topics one bot is missing that peers know), and an on-demand federated
 * semantic search across every connected bot's memory.
 *
 * Data is fed live by the MemoryMeshEngine, which scans each connected bot's
 * memory via gateway RPC every 15 minutes (started in fleet-bootstrap). Until a
 * bot has been scanned its memory is empty, so a cold fleet shows empty states
 * rather than mock data.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router";
import {
  useMemoryHealth,
  useMemoryStats,
  useMemoryConflicts,
  useMemoryGaps,
  useMemorySearch,
  useResolveMemoryConflict,
  useDismissMemoryConflict,
  useFleetStatus,
} from "@/hooks/useFleetMonitor";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn } from "@/lib/utils";
import type {
  MemoryConflict,
  BotMemoryStats,
  MemoryGap,
} from "@/api/fleet-monitor";
import {
  AlertTriangle,
  CheckCircle2,
  Share2,
  Search,
  Lightbulb,
  Database,
  Loader2,
  XCircle,
} from "lucide-react";

type TabKey = "overview" | "conflicts" | "gaps" | "search";

const TAB_ITEMS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "conflicts", label: "Conflicts" },
  { key: "gaps", label: "Knowledge Gaps" },
  { key: "search", label: "Federated Search" },
];

function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "high":
      return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    case "medium":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    default:
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300";
  }
}

const DISTRIBUTION_LABEL: Record<string, { label: string; cls: string }> = {
  balanced: {
    label: "Balanced",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  },
  concentrated: {
    label: "Concentrated",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  },
  fragmented: {
    label: "Fragmented",
    cls: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  },
};

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground/70">{hint}</div>}
    </div>
  );
}

function ProgressBar({ label, pct }: { label: string; pct: number }) {
  const clamped = Math.round(Math.max(0, Math.min(100, pct)));
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 text-[10px] text-muted-foreground truncate">{label}</span>
      <div
        className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${clamped}%`}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${clamped}%` }} />
      </div>
      <span className="w-9 text-right text-[10px] tabular-nums text-muted-foreground">{clamped}%</span>
    </div>
  );
}

function BotStatsRow({
  stats,
  botLabel,
}: {
  stats: BotMemoryStats;
  botLabel: (botId: string) => { emoji: string; name: string };
}) {
  const { emoji } = botLabel(stats.botId);
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link
          to={`/bots/${stats.botId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <span>{emoji}</span>
          {stats.botName}
        </Link>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{stats.totalMemories}</span> memories
          </span>
          <span>
            avg <span className="font-semibold text-foreground">{stats.avgAgeDays.toFixed(0)}d</span> old
          </span>
          {stats.staleCount > 0 && (
            <span className="text-amber-600 dark:text-amber-400">{stats.staleCount} stale</span>
          )}
          {stats.conflictCount > 0 && (
            <span className="text-red-600 dark:text-red-400">{stats.conflictCount} conflicts</span>
          )}
        </div>
      </div>
      {stats.coverageTopics.length > 0 && (
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          {stats.coverageTopics.slice(0, 8).map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground"
            >
              {t}
            </span>
          ))}
          {stats.coverageTopics.length > 8 && (
            <span className="text-[10px] text-muted-foreground">
              +{stats.coverageTopics.length - 8} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ConflictCard({
  conflict,
  botLabel,
  onResolve,
  onDismiss,
  busy,
}: {
  conflict: MemoryConflict;
  botLabel: (botId: string) => { emoji: string; name: string };
  onResolve: (id: string) => void;
  onDismiss: (id: string) => void;
  busy: boolean;
}) {
  const isOpen = conflict.status === "open";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={cn(
            "h-4 w-4 flex-shrink-0 mt-0.5",
            conflict.severity === "high"
              ? "text-red-500"
              : conflict.severity === "medium"
                ? "text-amber-500"
                : "text-blue-500",
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{conflict.topic}</span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                severityBadgeClass(conflict.severity),
              )}
            >
              {conflict.severity}
            </span>
            {!isOpen && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                {conflict.status}
              </span>
            )}
          </div>

          {/* Conflicting memories */}
          <div className="mt-2 space-y-1.5">
            {conflict.conflictingMemories.map((m, i) => {
              const { emoji, name } = botLabel(m.botId);
              return (
                <div
                  key={i}
                  className="rounded-md border border-border bg-muted/30 p-2 text-[11px]"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span>{emoji}</span>
                    <span className="font-medium text-foreground">{m.botName || name}</span>
                    <span className="text-muted-foreground">
                      · {Math.round(m.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="text-muted-foreground">{m.content}</p>
                </div>
              );
            })}
          </div>

          {/* Suggested resolution */}
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Lightbulb className="h-3 w-3 text-primary flex-shrink-0 mt-0.5" />
            <span>{conflict.suggestedResolution}</span>
          </div>
        </div>

        {/* Actions */}
        {isOpen && (
          <div className="flex-shrink-0 flex flex-col gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => onResolve(conflict.id)}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="h-3 w-3" /> Resolve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDismiss(conflict.id)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XCircle className="h-3 w-3" /> Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GapCard({
  gap,
  botLabel,
}: {
  gap: MemoryGap;
  botLabel: (botId: string) => { emoji: string; name: string };
}) {
  const { emoji } = botLabel(gap.botId);
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <Link
          to={`/bots/${gap.botId}`}
          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
        >
          <span>{emoji}</span>
          {gap.botName}
        </Link>
        <span className="text-muted-foreground">is missing</span>
        <span className="inline-flex items-center rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          {gap.missingTopic}
        </span>
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">
        Known by:{" "}
        {gap.knownBy.map((name, i) => (
          <span key={name} className="text-foreground font-medium">
            {name}
            {i < gap.knownBy.length - 1 ? ", " : ""}
          </span>
        ))}
      </div>
      <div className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground/90">
        <Lightbulb className="h-3 w-3 text-primary flex-shrink-0 mt-0.5" />
        <span>{gap.suggestion}</span>
      </div>
    </div>
  );
}

export function MemoryMesh() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: health, isLoading: healthLoading, isError: healthError } = useMemoryHealth();
  const { data: stats } = useMemoryStats();
  const conflictsQuery = useMemoryConflicts("open");
  const gapsQuery = useMemoryGaps();
  const { data: fleet } = useFleetStatus();

  const searchMutation = useMemorySearch();
  const resolveMutation = useResolveMemoryConflict();
  const dismissMutation = useDismissMemoryConflict();
  const conflictBusy = resolveMutation.isPending || dismissMutation.isPending;
  const conflictError = resolveMutation.error ?? dismissMutation.error;

  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Memory Mesh" }]);
  }, [setBreadcrumbs]);

  // Build a botId → emoji/name lookup from live fleet status.
  const botLabel = useMemo(() => {
    const map = new Map<string, { emoji: string; name: string }>();
    for (const bot of fleet?.bots ?? []) {
      map.set(bot.botId, { emoji: bot.emoji ?? "\u{1F916}", name: bot.name ?? bot.botId });
    }
    return (botId: string) => map.get(botId) ?? { emoji: "\u{1F916}", name: botId };
  }, [fleet]);

  const conflicts = conflictsQuery.data?.conflicts ?? [];
  const gaps = gapsQuery.data?.gaps ?? [];
  const searchResult = searchMutation.data;

  const handleSearch = () => {
    const q = searchQuery.trim();
    if (!q) return;
    searchMutation.mutate({ query: q, options: { topK: 5, synthesize: false } });
  };

  const distribution = health
    ? DISTRIBUTION_LABEL[health.fleet.knowledgeDistribution] ?? {
        label: health.fleet.knowledgeDistribution,
        cls: "bg-muted text-muted-foreground",
      }
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            Memory Mesh
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cross-bot memory federation — health, conflicts, knowledge gaps &amp; federated search
          </p>
        </div>
        {distribution && (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
              distribution.cls,
            )}
          >
            {distribution.label} knowledge
          </span>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Memories" value={String(stats?.totalMemories ?? 0)} />
        <MetricCard label="Bots Scanned" value={String(stats?.totalBots ?? 0)} />
        <MetricCard
          label="Open Conflicts"
          value={String(stats?.totalConflicts ?? 0)}
          hint="contradictory facts"
        />
        <MetricCard
          label="Unique Topics"
          value={String(health?.fleet.uniqueTopics ?? 0)}
          hint={health ? `${Math.round(health.fleet.crossBotOverlap * 100)}% cross-bot overlap` : undefined}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TAB_ITEMS.map((tab) => {
          const count =
            tab.key === "conflicts" ? conflicts.length : tab.key === "gaps" ? gaps.length : 0;
          return (
            <button
              type="button"
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              aria-pressed={activeTab === tab.key}
              className={cn(
                "relative px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                activeTab === tab.key
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1.5 inline-flex items-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-foreground">
                  {count}
                </span>
              )}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      {/* Mutation error banner */}
      {conflictError && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          {conflictError instanceof Error ? conflictError.message : "Action failed"}
        </div>
      )}

      {/* ── Overview ── */}
      {activeTab === "overview" && (
        <div className="space-y-3">
          {healthLoading ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading memory health...
            </div>
          ) : healthError ? (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-3 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Failed to load memory health. The fleet monitor may be offline.
            </div>
          ) : !health || health.perBot.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <Database className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium text-foreground">No bot memories scanned yet</p>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
                The memory mesh scans each connected bot's memory every 15 minutes. Once bots are
                connected and scanned, their memory stats appear here.
              </p>
            </div>
          ) : (
            <>
              {/* Fleet distribution bars */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Fleet knowledge distribution
                </div>
                <ProgressBar
                  label="Cross-bot overlap"
                  pct={health.fleet.crossBotOverlap * 100}
                />
                <ProgressBar label="Conflict rate" pct={health.fleet.conflictRate * 100} />
              </div>
              {/* Per-bot rows */}
              <div className="space-y-2">
                {health.perBot.map((s) => (
                  <BotStatsRow key={s.botId} stats={s} botLabel={botLabel} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Conflicts ── */}
      {activeTab === "conflicts" && (
        <div className="space-y-2">
          {conflictsQuery.isLoading ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading conflicts...
            </div>
          ) : conflictsQuery.isError ? (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-3 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Failed to load conflicts. The fleet monitor may be offline.
            </div>
          ) : conflicts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm font-medium text-foreground">No open memory conflicts</p>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
                When two bots hold contradictory facts about the same topic, the conflict surfaces
                here with a suggested resolution.
              </p>
            </div>
          ) : (
            conflicts.map((c) => (
              <ConflictCard
                key={c.id}
                conflict={c}
                botLabel={botLabel}
                onResolve={(id) => resolveMutation.mutate(id)}
                onDismiss={(id) => dismissMutation.mutate(id)}
                busy={conflictBusy}
              />
            ))
          )}
        </div>
      )}

      {/* ── Knowledge Gaps ── */}
      {activeTab === "gaps" && (
        <div className="space-y-2">
          {gapsQuery.isLoading ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading gaps...
            </div>
          ) : gapsQuery.isError ? (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-3 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Failed to load knowledge gaps. The fleet monitor may be offline.
            </div>
          ) : gaps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <div className="text-3xl mb-2">🧠</div>
              <p className="text-sm font-medium text-foreground">No knowledge gaps detected</p>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
                Topics that some bots know but others are missing will appear here, with a
                suggested knowledge-transfer task.
              </p>
            </div>
          ) : (
            gaps.map((g, i) => <GapCard key={`${g.botId}-${g.missingTopic}-${i}`} gap={g} botLabel={botLabel} />)
          )}
        </div>
      )}

      {/* ── Federated Search ── */}
      {activeTab === "search" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="Search across every bot's memory…"
                aria-label="Federated memory search query"
                className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              disabled={searchMutation.isPending || searchQuery.trim().length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {searchMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              Search
            </button>
          </div>

          {searchMutation.isError && (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {searchMutation.error instanceof Error
                ? searchMutation.error.message
                : "Search failed. The fleet monitor may be offline."}
            </div>
          )}

          {searchResult && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                {searchResult.totalResults} result{searchResult.totalResults !== 1 ? "s" : ""} across{" "}
                {searchResult.results.length} bot{searchResult.results.length !== 1 ? "s" : ""} ·{" "}
                {searchResult.searchTimeMs}ms
              </div>
              {searchResult.synthesis && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
                  <span className="font-semibold text-primary">Synthesis: </span>
                  {searchResult.synthesis}
                </div>
              )}
              {searchResult.results.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No matching memories found.
                </div>
              ) : (
                searchResult.results.map((bot) => {
                  const { emoji } = botLabel(bot.botId);
                  return (
                    <div key={bot.botId} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <Link
                          to={`/bots/${bot.botId}`}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                        >
                          <span>{emoji}</span>
                          {bot.botName}
                        </Link>
                        <span className="text-[10px] text-muted-foreground">{bot.searchTimeMs}ms</span>
                      </div>
                      <div className="space-y-1.5">
                        {bot.memories.map((m, i) => (
                          <div
                            key={i}
                            className="rounded-md border border-border bg-muted/30 p-2 text-[11px]"
                          >
                            <div className="flex items-center gap-2 mb-0.5 text-[10px] text-muted-foreground">
                              <span className="font-semibold text-primary">
                                {Math.round(m.similarity * 100)}% match
                              </span>
                              <span>· {m.source}</span>
                              {m.tags && m.tags.length > 0 && (
                                <span>· {m.tags.slice(0, 3).join(", ")}</span>
                              )}
                            </div>
                            <p className="text-foreground">{m.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {!searchResult && !searchMutation.isPending && (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <Search className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium text-foreground">Search the fleet's collective memory</p>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
                Run a semantic query across every connected bot's memory at once — find which bot
                knows about a customer, a decision, or a past incident.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Fleet Time Machine page.
 *
 * Point-in-time reconstruction of the fleet from persisted history. Pick any
 * timestamp and the server finds the nearest `fleet_snapshots` row per bot at
 * or before that moment (captured every 15 min) plus the alerts that were
 * active then (`fleet_alert_history`). Only fields with a real historical
 * source are shown — health, connection state, sessions, token usage, channels,
 * and active alerts. A "compare to now" diff highlights what changed since.
 *
 * Bookmarks let operators pin notable moments (incidents, deployments,
 * anomalies) for one-click recall.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router";
import {
  useTimeMachineReconstruct,
  useTimeMachineRange,
  useTimeMachineBookmarks,
  useCreateTimeBookmark,
  useDeleteTimeBookmark,
  timeAgo,
} from "@/hooks/useFleetMonitor";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn } from "@/lib/utils";
import type {
  FleetTimePoint,
  ReconstructedBot,
  TimeBookmark,
  TimeBookmarkType,
  TimePointConfidence,
} from "@/api/fleet-monitor";
import {
  AlertTriangle,
  Bookmark,
  BookmarkPlus,
  Clock,
  History,
  Loader2,
  Trash2,
} from "lucide-react";

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const CONFIDENCE_META: Record<
  TimePointConfidence,
  { label: string; cls: string }
> = {
  exact: {
    label: "Exact",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  },
  interpolated: {
    label: "Interpolated",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  },
  best_effort: {
    label: "Best effort",
    cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  },
  no_data: {
    label: "No data",
    cls: "bg-muted text-muted-foreground",
  },
};

const BOOKMARK_TYPE_META: Record<TimeBookmarkType, { label: string; cls: string }> = {
  incident: { label: "Incident", cls: "text-red-600 dark:text-red-400" },
  deployment: { label: "Deployment", cls: "text-blue-600 dark:text-blue-400" },
  anomaly: { label: "Anomaly", cls: "text-amber-600 dark:text-amber-400" },
  manual: { label: "Manual", cls: "text-muted-foreground" },
};

function gradeColor(score: number): string {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  if (score >= 40) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtAge(minutes: number): string {
  if (minutes < 1) return "live";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (24 * 60))}d`;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
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

function BotRow({ bot }: { bot: ReconstructedBot }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          to={`/bots/${bot.botId}`}
          className="flex min-w-0 items-center gap-2 hover:underline"
        >
          <span className="text-base">{bot.botEmoji || "🤖"}</span>
          <span className="truncate text-sm font-medium text-foreground">{bot.botName}</span>
        </Link>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className={cn("text-sm font-semibold tabular-nums", gradeColor(bot.healthScore))}>
            {bot.healthScore}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {bot.connectionState}
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>Sessions: <span className="text-foreground">{bot.activeSessions}</span></span>
        <span>Tokens/1h: <span className="text-foreground">{fmtTokens(bot.tokenUsage1h)}</span></span>
        <span>Channels: <span className="text-foreground">{bot.connectedChannels}/{bot.totalChannels}</span></span>
        {bot.latencyMs > 0 && (
          <span>Latency: <span className="text-foreground">{bot.latencyMs}ms</span></span>
        )}
        <span>Snapshot: <span className="text-foreground">{fmtAge(bot.snapshotAgeMinutes)} old</span></span>
      </div>
      {bot.activeAlerts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {bot.activeAlerts.map((a, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                a.severity === "critical"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
              )}
            >
              <AlertTriangle className="h-3 w-3" />
              {a.rule}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function TimeMachine() {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Time Machine" }]);
  }, [setBreadcrumbs]);
  const { selectedCompanyId } = useCompany();

  // Default to "now" so the first reconstruction shows the latest snapshot.
  const [localInput, setLocalInput] = useState(() => toLocalInput(new Date()));
  const timestampIso = useMemo(() => {
    const d = new Date(localInput);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }, [localInput]);

  const reconstructQuery = useTimeMachineReconstruct(timestampIso);
  const rangeQuery = useTimeMachineRange();
  const bookmarksQuery = useTimeMachineBookmarks();
  const createBookmark = useCreateTimeBookmark();
  const deleteBookmark = useDeleteTimeBookmark();

  const [bookmarkLabel, setBookmarkLabel] = useState("");
  const [bookmarkType, setBookmarkType] = useState<TimeBookmarkType>("manual");

  const point: FleetTimePoint | undefined = reconstructQuery.data?.point;
  const range = rangeQuery.data?.range;
  const bookmarks: TimeBookmark[] = bookmarksQuery.data?.bookmarks ?? [];

  const jumpRelative = (hoursBack: number) => {
    setLocalInput(toLocalInput(new Date(Date.now() - hoursBack * 60 * 60 * 1000)));
  };

  const handleCreateBookmark = () => {
    if (!timestampIso || !bookmarkLabel.trim()) return;
    createBookmark.mutate(
      { timestamp: timestampIso, label: bookmarkLabel.trim(), type: bookmarkType },
      { onSuccess: () => setBookmarkLabel("") },
    );
  };

  if (!selectedCompanyId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select a fleet to use the Time Machine.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1">
      {/* Header */}
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Time Machine</h1>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Reconstruct the fleet's recorded state at any past moment from 15-minute
        snapshots. {range?.hasHistory
          ? `History available from ${new Date(range.earliest).toLocaleString()}.`
          : "No snapshot history captured yet — reconstructions accrue as bots stay connected."}
      </p>

      {/* Time picker */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="tm-timestamp"
              className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Reconstruct at
            </label>
            <input
              id="tm-timestamp"
              type="datetime-local"
              value={localInput}
              max={toLocalInput(new Date())}
              onChange={(e) => setLocalInput(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {[
              { label: "Now", h: 0 },
              { label: "-1h", h: 1 },
              { label: "-6h", h: 6 },
              { label: "-24h", h: 24 },
              { label: "-7d", h: 24 * 7 },
            ].map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => jumpRelative(q.h)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {q.label}
              </button>
            ))}
          </div>
          {point && (
            <span
              className={cn(
                "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium",
                CONFIDENCE_META[point.confidence].cls,
              )}
            >
              <Clock className="h-3 w-3" />
              {CONFIDENCE_META[point.confidence].label}
              {point.dataAge.snapshotsFound &&
                ` · nearest ${fmtAge(point.dataAge.nearestSnapshotMinutes)}`}
            </span>
          )}
        </div>
      </div>

      {/* Reconstruction */}
      {reconstructQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reconstructing fleet state…
        </div>
      ) : reconstructQuery.isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
          <AlertTriangle className="h-4 w-4" /> Failed to reconstruct fleet state. The
          fleet monitor may be offline.
        </div>
      ) : point && point.bots.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Bots" value={String(point.fleet.totalBots)} />
            <StatCard label="Online" value={`${point.fleet.onlineBots}/${point.fleet.totalBots}`} />
            <StatCard
              label="Fleet Health"
              value={`${point.fleet.overallHealthScore}`}
              hint={`Grade ${point.fleet.overallHealthGrade}`}
            />
            <StatCard
              label="Reconstructed"
              value={new Date(point.timestamp).toLocaleString()}
            />
          </div>
          <div className="space-y-2">
            {point.bots.map((b) => (
              <BotRow key={b.botId} bot={b} />
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No snapshot recorded at or before this time. Snapshots are captured every
          15 minutes while bots are connected — pick a more recent time or wait for
          history to accrue.
        </div>
      )}

      {/* Bookmarks */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Bookmarks</h2>
        </div>

        {/* Create */}
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            <label htmlFor="tm-bm-label" className="sr-only">
              Bookmark label
            </label>
            <input
              id="tm-bm-label"
              type="text"
              value={bookmarkLabel}
              onChange={(e) => setBookmarkLabel(e.target.value)}
              placeholder="Label this moment…"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            />
          </div>
          <div>
            <label htmlFor="tm-bm-type" className="sr-only">
              Bookmark type
            </label>
            <select
              id="tm-bm-type"
              value={bookmarkType}
              onChange={(e) => setBookmarkType(e.target.value as TimeBookmarkType)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            >
              <option value="manual">Manual</option>
              <option value="incident">Incident</option>
              <option value="deployment">Deployment</option>
              <option value="anomaly">Anomaly</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleCreateBookmark}
            disabled={!bookmarkLabel.trim() || !timestampIso || createBookmark.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <BookmarkPlus className="h-4 w-4" />
            Bookmark
          </button>
        </div>

        {createBookmark.isError && (
          <div className="mb-2 text-xs text-red-600 dark:text-red-400">
            Failed to create bookmark.
          </div>
        )}

        {/* List */}
        {bookmarks.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            No bookmarks yet. Pin a moment above to jump back to it later.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {bookmarks.map((bm) => (
              <li
                key={bm.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => setLocalInput(toLocalInput(new Date(bm.timestamp)))}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left hover:underline"
                >
                  <Bookmark
                    className={cn("h-3.5 w-3.5 flex-shrink-0", BOOKMARK_TYPE_META[bm.type].cls)}
                  />
                  <span className="truncate text-sm text-foreground">{bm.label}</span>
                  <span className={cn("flex-shrink-0 text-[10px]", BOOKMARK_TYPE_META[bm.type].cls)}>
                    {BOOKMARK_TYPE_META[bm.type].label}
                  </span>
                  <span className="flex-shrink-0 text-[10px] text-muted-foreground">
                    {new Date(bm.timestamp).toLocaleString()} · {timeAgo(bm.createdAt)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteBookmark.mutate(bm.id)}
                  aria-label={`Delete bookmark ${bm.label}`}
                  className="flex-shrink-0 rounded p-1 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

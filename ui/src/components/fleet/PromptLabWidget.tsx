/**
 * PromptLabWidget — Prompt version management, genome analysis,
 * A/B testing, and cross-pollination for fleet bots.
 *
 * Features:
 * - Prompt version list with create/diff
 * - Prompt genome radar chart (pure CSS bars, no chart lib)
 * - A/B test status card
 * - Cross-pollination suggestion card
 *
 * Uses design tokens from design-tokens.ts and glassmorphism card styles.
 */

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

// ─── Types (mirrors server types) ──────────────────────────────────────────

interface PromptVersionSummary {
  version: number;
  changeDescription: string;
  createdBy: string;
  createdAt: string;
  hash: string;
}

interface PromptVersion {
  version: number;
  identityMd: string;
  soulMd: string;
  changeDescription: string;
  createdBy: string;
  createdAt: string;
  hash: string;
}

interface PromptGenomeTrait {
  trait: string;
  strength: number;
  evidence: string[];
}

interface PromptGenome {
  botId: string;
  version: number;
  traits: PromptGenomeTrait[];
  analyzedAt: string;
}

type ABTestStatus = "running" | "completed" | "stopped";

interface ABTestMetrics {
  sessions: number;
  avgSatisfaction: number;
  avgResolutionRate: number;
  avgResponseTime: number;
}

interface ABTestResult {
  testId: string;
  botId: string;
  controlVersion: number;
  treatmentVersion: number;
  trafficSplit: number;
  minSessions: number;
  status: ABTestStatus;
  startedAt: string;
  completedAt: string | null;
  controlMetrics: ABTestMetrics;
  treatmentMetrics: ABTestMetrics;
  winner: "control" | "treatment" | "inconclusive" | null;
  pValue: number | null;
}

interface CrossPollinationResult {
  sourceBotId: string;
  targetBotId: string;
  traits: string[];
  mergedIdentityMd: string;
  mergedSoulMd: string;
  changeDescription: string;
  confidence: number;
}

interface DiffResult {
  added: string[];
  removed: string[];
  unchanged: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const API_BASE = "/api/fleet-monitor";

const CARD =
  "bg-card/90 backdrop-blur-md rounded-2xl border border-border/50 shadow-sm";

const CARD_ELEVATED =
  "bg-card/95 backdrop-blur-xl rounded-2xl border border-primary/20 shadow-lg";

const BTN_PRIMARY =
  "bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-xl hover:bg-primary/80 transition-all duration-200 disabled:opacity-50";

const BTN_SECONDARY =
  "bg-muted text-foreground text-sm font-medium px-3 py-1.5 rounded-lg border border-border hover:border-primary/40 transition-colors duration-200";

const BADGE_TEAL =
  "bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 text-xs font-medium px-2 py-0.5 rounded-full";

// ─── API helpers ────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body: { error?: string } = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Simple horizontal bar chart for genome traits (no external chart lib). */
function GenomeRadarBars({ traits }: { traits: PromptGenomeTrait[] }) {
  return (
    <div className="space-y-2">
      {traits.map((t) => (
        <div key={t.trait} className="flex items-center gap-3">
          <span className="w-28 text-xs text-foreground/70 text-right capitalize truncate">
            {t.trait.replace(/_/g, " ")}
          </span>
          <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                t.strength >= 70
                  ? "bg-gradient-to-r from-[#D4A373] to-[#B08968] dark:from-[#C4956A] dark:to-[#9A7B5B]"
                  : t.strength >= 40
                    ? "bg-gradient-to-r from-teal-500 to-teal-700 dark:from-teal-400 dark:to-teal-600"
                    : "bg-muted-foreground/30",
              )}
              style={{ width: `${t.strength}%` }}
            />
          </div>
          <span className="w-8 text-xs text-foreground/60 tabular-nums">
            {t.strength}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: ABTestStatus }) {
  const styles: Record<ABTestStatus, string> = {
    running: "bg-green-100 text-green-700",
    completed: "bg-blue-100 text-blue-700",
    stopped: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function MetricBar({
  label,
  control,
  treatment,
}: {
  label: string;
  control: number;
  treatment: number;
}) {
  const max = Math.max(control, treatment, 1);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-foreground/70">
        <span>{label}</span>
        <span className="tabular-nums">
          {control.toFixed(1)} vs {treatment.toFixed(1)}
        </span>
      </div>
      <div className="flex gap-1">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-700 dark:bg-teal-500 rounded-full transition-all duration-300"
            style={{ width: `${(control / max) * 100}%` }}
          />
        </div>
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(treatment / max) * 100}%` }}
          />
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-foreground/50">
        <span>Control</span>
        <span>Treatment</span>
      </div>
    </div>
  );
}

function DiffView({
  identity,
  soul,
}: {
  identity: DiffResult;
  soul: DiffResult;
}) {
  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="text-foreground/70 font-medium mb-1">Identity diff</div>
        <div className="space-y-0.5 font-mono max-h-32 overflow-y-auto">
          {identity.removed.map((l, i) => (
            <div key={`r-${i}`} className="text-red-600 bg-red-50 px-2 py-0.5 rounded">
              - {l}
            </div>
          ))}
          {identity.added.map((l, i) => (
            <div key={`a-${i}`} className="text-green-700 bg-green-50 px-2 py-0.5 rounded">
              + {l}
            </div>
          ))}
          {identity.added.length === 0 && identity.removed.length === 0 && (
            <div className="text-foreground/50 italic">No changes</div>
          )}
        </div>
      </div>
      <div>
        <div className="text-foreground/70 font-medium mb-1">Soul diff</div>
        <div className="space-y-0.5 font-mono max-h-32 overflow-y-auto">
          {soul.removed.map((l, i) => (
            <div key={`r-${i}`} className="text-red-600 bg-red-50 px-2 py-0.5 rounded">
              - {l}
            </div>
          ))}
          {soul.added.map((l, i) => (
            <div key={`a-${i}`} className="text-green-700 bg-green-50 px-2 py-0.5 rounded">
              + {l}
            </div>
          ))}
          {soul.added.length === 0 && soul.removed.length === 0 && (
            <div className="text-foreground/50 italic">No changes</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface PromptLabWidgetProps {
  botId: string;
  allBotIds?: string[];
  className?: string;
}

export function PromptLabWidget({
  botId,
  allBotIds = [],
  className,
}: PromptLabWidgetProps) {
  // ─── State ──────────────────────────────────────────────────────────────

  const [versions, setVersions] = useState<PromptVersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create version form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    identityMd: "",
    soulMd: "",
    changeDescription: "",
    createdBy: "",
  });
  const [creating, setCreating] = useState(false);

  // Diff
  const [diffFrom, setDiffFrom] = useState<number | null>(null);
  const [diffTo, setDiffTo] = useState<number | null>(null);
  const [diffResult, setDiffResult] = useState<{
    identity: DiffResult;
    soul: DiffResult;
  } | null>(null);
  const [diffing, setDiffing] = useState(false);

  // Genome
  const [genome, setGenome] = useState<PromptGenome | null>(null);
  const [analyzingGenome, setAnalyzingGenome] = useState(false);

  // A/B test
  const [activeTest, setActiveTest] = useState<ABTestResult | null>(null);
  const [testForm, setTestForm] = useState({
    controlVersion: "",
    treatmentVersion: "",
    trafficSplit: "0.5",
    minSessions: "100",
  });
  const [startingTest, setStartingTest] = useState(false);

  // Cross-pollination
  const [crossSource, setCrossSource] = useState("");
  const [crossTraits, setCrossTraits] = useState("");
  const [crossResult, setCrossResult] = useState<CrossPollinationResult | null>(null);
  const [crossLoading, setCrossLoading] = useState(false);

  // ─── Data fetching ──────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<{
          ok: boolean;
          versions: PromptVersionSummary[];
        }>(`/prompts/${encodeURIComponent(botId)}/versions`);
        if (!cancelled) {
          setVersions(data.versions);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [botId]);

  // ─── Actions ────────────────────────────────────────────────────────────

  async function handleCreate() {
    setCreating(true);
    try {
      const data = await apiFetch<{ ok: boolean; version: PromptVersion }>(
        `/prompts/${encodeURIComponent(botId)}/versions`,
        {
          method: "POST",
          body: JSON.stringify(createForm),
        },
      );
      setVersions((prev) => [
        {
          version: data.version.version,
          changeDescription: data.version.changeDescription,
          createdBy: data.version.createdBy,
          createdAt: data.version.createdAt,
          hash: data.version.hash,
        },
        ...prev,
      ]);
      setCreateForm({ identityMd: "", soulMd: "", changeDescription: "", createdBy: "" });
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleDiff() {
    if (diffFrom == null || diffTo == null) return;
    setDiffing(true);
    setDiffResult(null);
    try {
      const data = await apiFetch<{
        ok: boolean;
        identity: DiffResult;
        soul: DiffResult;
      }>(`/prompts/${encodeURIComponent(botId)}/diff`, {
        method: "POST",
        body: JSON.stringify({ from: diffFrom, to: diffTo }),
      });
      setDiffResult({ identity: data.identity, soul: data.soul });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiffing(false);
    }
  }

  async function handleAnalyzeGenome() {
    setAnalyzingGenome(true);
    try {
      const data = await apiFetch<{ ok: boolean; genome: PromptGenome }>(
        `/prompts/${encodeURIComponent(botId)}/genome`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setGenome(data.genome);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzingGenome(false);
    }
  }

  async function handleStartTest() {
    setStartingTest(true);
    try {
      const data = await apiFetch<{ ok: boolean; test: ABTestResult }>(
        `/prompts/${encodeURIComponent(botId)}/test`,
        {
          method: "POST",
          body: JSON.stringify({
            controlVersion: parseInt(testForm.controlVersion, 10),
            treatmentVersion: parseInt(testForm.treatmentVersion, 10),
            trafficSplit: parseFloat(testForm.trafficSplit),
            minSessions: parseInt(testForm.minSessions, 10),
          }),
        },
      );
      setActiveTest(data.test);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStartingTest(false);
    }
  }

  async function handleCrossPollinate() {
    if (!crossSource || !crossTraits) return;
    setCrossLoading(true);
    setCrossResult(null);
    try {
      const data = await apiFetch<{
        ok: boolean;
        result: CrossPollinationResult;
      }>("/prompts/crosspolinate", {
        method: "POST",
        body: JSON.stringify({
          sourceBotId: crossSource,
          targetBotId: botId,
          traits: crossTraits.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      setCrossResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCrossLoading(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white text-sm">
            P
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Prompt Lab</h3>
            <p className="text-xs text-foreground/50">
              {botId} — {versions.length} version{versions.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <button
          type="button" className={BTN_PRIMARY} onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "New Version"}
        </button>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600 ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Create version form ───────────────────────────────────────────── */}
      {showCreate && (
        <div className={`${CARD_ELEVATED} p-4 space-y-3`}>
          <h4 className="text-sm font-medium text-foreground">Create Prompt Version</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-foreground/60 mb-1">
                Identity Markdown
              </label>
              <textarea
                className="w-full h-24 bg-background border border-border rounded-xl px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:border-primary transition-colors"
                placeholder="# Bot Identity..."
                value={createForm.identityMd}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, identityMd: e.target.value }))
                }
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-foreground/60 mb-1">
                Soul Markdown
              </label>
              <textarea
                className="w-full h-24 bg-background border border-border rounded-xl px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:border-primary transition-colors"
                placeholder="# Bot Soul..."
                value={createForm.soulMd}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, soulMd: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-xs text-foreground/60 mb-1">
                Change Description
              </label>
              <input
                type="text"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                placeholder="What changed?"
                value={createForm.changeDescription}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, changeDescription: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-xs text-foreground/60 mb-1">
                Created By
              </label>
              <input
                type="text"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                placeholder="Your name"
                value={createForm.createdBy}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, createdBy: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={handleCreate}
              disabled={
                creating ||
                !createForm.identityMd ||
                !createForm.soulMd ||
                !createForm.changeDescription ||
                !createForm.createdBy
              }
            >
              {creating ? "Saving..." : "Save Version"}
            </button>
          </div>
        </div>
      )}

      {/* ── Version list ──────────────────────────────────────────────────── */}
      <div className={`${CARD} p-4 space-y-3`}>
        <h4 className="text-sm font-medium text-foreground">Prompt Versions</h4>

        {loading && (
          <div className="text-sm text-foreground/50 py-6 text-center">
            Loading versions...
          </div>
        )}

        {!loading && versions.length === 0 && (
          <div className="text-sm text-foreground/50 py-6 text-center">
            No prompt versions yet. Create your first version above.
          </div>
        )}

        {!loading && versions.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {versions.map((v) => (
              <div
                key={v.version}
                className="flex items-center gap-3 px-3 py-2 rounded-xl bg-background/60 border border-border/30 hover:border-primary/30 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-teal-800 dark:text-teal-200 text-sm font-bold tabular-nums">
                  v{v.version}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground truncate">
                    {v.changeDescription}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-foreground/50">
                    <span>{v.createdBy}</span>
                    <span>·</span>
                    <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                    <span className={BADGE_TEAL}>{v.hash.slice(0, 8)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Diff controls */}
        {versions.length >= 2 && (
          <div className="pt-2 border-t border-border/50 space-y-2">
            <div className="text-xs text-foreground/60 font-medium">
              Compare Versions
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Compare from version"
                className="bg-background border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                value={diffFrom ?? ""}
                onChange={(e) => setDiffFrom(e.target.value ? parseInt(e.target.value, 10) : null)}
              >
                <option value="">From...</option>
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version}
                  </option>
                ))}
              </select>
              <span className="text-foreground/40 text-sm">vs</span>
              <select
                aria-label="Compare to version"
                className="bg-background border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                value={diffTo ?? ""}
                onChange={(e) => setDiffTo(e.target.value ? parseInt(e.target.value, 10) : null)}
              >
                <option value="">To...</option>
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={BTN_SECONDARY}
                onClick={handleDiff}
                disabled={diffFrom == null || diffTo == null || diffing}
              >
                {diffing ? "Comparing..." : "Diff"}
              </button>
            </div>
            {diffResult && (
              <DiffView identity={diffResult.identity} soul={diffResult.soul} />
            )}
          </div>
        )}
      </div>

      {/* ── Prompt Genome ─────────────────────────────────────────────────── */}
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground">Prompt Genome</h4>
          <button
            type="button"
            className={BTN_SECONDARY}
            onClick={handleAnalyzeGenome}
            disabled={analyzingGenome || versions.length === 0}
          >
            {analyzingGenome ? "Analyzing..." : "Analyze"}
          </button>
        </div>

        {!genome && !analyzingGenome && (
          <div className="text-xs text-foreground/50 py-4 text-center">
            Analyze the latest prompt to extract personality traits.
          </div>
        )}

        {genome && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-foreground/50">
              <span className={BADGE_TEAL}>v{genome.version}</span>
              <span>Analyzed {new Date(genome.analyzedAt).toLocaleString()}</span>
            </div>
            <GenomeRadarBars traits={genome.traits} />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {genome.traits
                .filter((t) => t.strength > 0)
                .map((t) => (
                  <span
                    key={t.trait}
                    className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full"
                    title={`Evidence: ${t.evidence.join(", ")}`}
                  >
                    {t.trait.replace(/_/g, " ")}
                    <span className="font-bold">{t.strength}</span>
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* ── A/B Test ──────────────────────────────────────────────────────── */}
      <div className={`${CARD} p-4 space-y-3`}>
        <h4 className="text-sm font-medium text-foreground">A/B Prompt Test</h4>

        {activeTest ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusBadge status={activeTest.status} />
              <span className="text-xs text-foreground/50">
                v{activeTest.controlVersion} vs v{activeTest.treatmentVersion}
              </span>
              <span className="text-xs text-foreground/50 ml-auto">
                Split: {(activeTest.trafficSplit * 100).toFixed(0)}%
              </span>
            </div>

            {/* Progress bar — sessions collected vs minimum */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-foreground/50">
                <span>Sessions collected</span>
                <span>
                  {activeTest.controlMetrics.sessions + activeTest.treatmentMetrics.sessions} / {activeTest.minSessions}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-teal-700 dark:from-teal-400 dark:to-teal-600 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(
                      100,
                      ((activeTest.controlMetrics.sessions +
                        activeTest.treatmentMetrics.sessions) /
                        activeTest.minSessions) *
                        100,
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Metric comparisons */}
            <div className="space-y-3">
              <MetricBar
                label="Satisfaction"
                control={activeTest.controlMetrics.avgSatisfaction}
                treatment={activeTest.treatmentMetrics.avgSatisfaction}
              />
              <MetricBar
                label="Resolution Rate"
                control={activeTest.controlMetrics.avgResolutionRate}
                treatment={activeTest.treatmentMetrics.avgResolutionRate}
              />
              <MetricBar
                label="Response Time (s)"
                control={activeTest.controlMetrics.avgResponseTime}
                treatment={activeTest.treatmentMetrics.avgResponseTime}
              />
            </div>

            {/* Winner */}
            {activeTest.winner && (
              <div
                className={`text-center py-2 rounded-xl text-sm font-medium ${
                  activeTest.winner === "treatment"
                    ? "bg-green-50 text-green-700"
                    : activeTest.winner === "control"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-muted text-foreground/60"
                }`}
              >
                {activeTest.winner === "treatment"
                  ? "Treatment wins!"
                  : activeTest.winner === "control"
                    ? "Control wins"
                    : "Inconclusive"}
                {activeTest.pValue != null && (
                  <span className="ml-2 text-xs opacity-70">
                    p={activeTest.pValue < 0.001 ? "<0.001" : activeTest.pValue.toFixed(3)}
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              className="text-xs text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:text-teal-200 transition-colors"
              onClick={() => setActiveTest(null)}
            >
              Clear test
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {versions.length < 2 ? (
              <div className="text-xs text-foreground/50 py-4 text-center">
                Need at least 2 prompt versions to run an A/B test.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="prompt-lab-control-version" className="block text-xs text-foreground/60 mb-1">
                      Control Version
                    </label>
                    <select
                      id="prompt-lab-control-version"
                      className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                      value={testForm.controlVersion}
                      onChange={(e) =>
                        setTestForm((f) => ({ ...f, controlVersion: e.target.value }))
                      }
                    >
                      <option value="">Select...</option>
                      {versions.map((v) => (
                        <option key={v.version} value={v.version}>
                          v{v.version}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="prompt-lab-treatment-version" className="block text-xs text-foreground/60 mb-1">
                      Treatment Version
                    </label>
                    <select
                      id="prompt-lab-treatment-version"
                      className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                      value={testForm.treatmentVersion}
                      onChange={(e) =>
                        setTestForm((f) => ({
                          ...f,
                          treatmentVersion: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select...</option>
                      {versions.map((v) => (
                        <option key={v.version} value={v.version}>
                          v{v.version}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-foreground/60 mb-1">
                      Traffic Split
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      max="0.9"
                      step="0.1"
                      className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                      value={testForm.trafficSplit}
                      onChange={(e) =>
                        setTestForm((f) => ({ ...f, trafficSplit: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-foreground/60 mb-1">
                      Min Sessions
                    </label>
                    <input
                      type="number"
                      min="10"
                      className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                      value={testForm.minSessions}
                      onChange={(e) =>
                        setTestForm((f) => ({ ...f, minSessions: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  onClick={handleStartTest}
                  disabled={
                    startingTest ||
                    !testForm.controlVersion ||
                    !testForm.treatmentVersion ||
                    testForm.controlVersion === testForm.treatmentVersion
                  }
                >
                  {startingTest ? "Starting..." : "Start A/B Test"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Cross-Pollination ─────────────────────────────────────────────── */}
      <div className={`${CARD} p-4 space-y-3`}>
        <h4 className="text-sm font-medium text-foreground">Cross-Pollination</h4>
        <p className="text-xs text-foreground/50">
          Transfer personality traits from another bot's prompt into this bot.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="prompt-lab-source-bot" className="block text-xs text-foreground/60 mb-1">
              Source Bot
            </label>
            {allBotIds.length > 0 ? (
              <select
                id="prompt-lab-source-bot"
                className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                value={crossSource}
                onChange={(e) => setCrossSource(e.target.value)}
              >
                <option value="">Select bot...</option>
                {allBotIds
                  .filter((id) => id !== botId)
                  .map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
              </select>
            ) : (
              <input
                type="text"
                className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                placeholder="Bot ID"
                value={crossSource}
                onChange={(e) => setCrossSource(e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="block text-xs text-foreground/60 mb-1">
              Traits (comma-separated)
            </label>
            <input
              type="text"
              className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
              placeholder="empathy, humor, brevity"
              value={crossTraits}
              onChange={(e) => setCrossTraits(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          className={BTN_SECONDARY}
          onClick={handleCrossPollinate}
          disabled={crossLoading || !crossSource || !crossTraits}
        >
          {crossLoading ? "Transferring..." : "Preview Transfer"}
        </button>

        {crossResult && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <span className={BADGE_TEAL}>
                {crossResult.traits.join(", ")}
              </span>
              <span className="text-xs text-foreground/50">
                from {crossResult.sourceBotId}
              </span>
            </div>

            {/* Confidence indicator */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-foreground/60">Confidence:</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-32">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    crossResult.confidence >= 0.7
                      ? "bg-teal-500 dark:bg-teal-400"
                      : crossResult.confidence >= 0.4
                        ? "bg-[#D4A373] dark:bg-[#C4956A]"
                        : "bg-red-500 dark:bg-red-400",
                  )}
                  style={{ width: `${crossResult.confidence * 100}%` }}
                />
              </div>
              <span className="text-xs text-foreground/50 tabular-nums">
                {(crossResult.confidence * 100).toFixed(0)}%
              </span>
            </div>

            <div className="text-xs text-foreground/60">
              {crossResult.changeDescription}
            </div>

            {/* Preview of merged content */}
            <details className="text-xs">
              <summary className="text-teal-600 dark:text-teal-400 cursor-pointer hover:text-teal-800 dark:text-teal-200 transition-colors">
                Preview merged identity
              </summary>
              <pre className="mt-1 bg-white/60 dark:bg-stone-800/60 rounded-lg p-2 font-mono text-foreground/70 max-h-32 overflow-y-auto whitespace-pre-wrap">
                {crossResult.mergedIdentityMd}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

export default PromptLabWidget;

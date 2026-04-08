/**
 * CommandCenter — Fleet Command Center for orchestrating pipeline
 * deployments across multiple bots.
 *
 * Sections:
 *   1. Pipeline Template Selector (card grid)
 *   2. Target Bot Selection (checkboxes + tag filter + "Select All Online")
 *   3. Pipeline Builder (visual step sequence, add/remove steps)
 *   4. Pipeline Execution Visualization:
 *      - Step progress indicator (circles + connecting lines, colored by status)
 *      - Current step detail panel (gate condition, delay progress)
 *      - Execution log (timestamped entries)
 *   5. Rate limit status bar (per-gateway config writes remaining)
 *   6. Control buttons (Execute, Pause, Abort, Rollback, Save as Template)
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Save,
  Trash2,
  ChevronRight,
  ChevronDown,
  Check,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  Terminal,
  Filter,
  Zap,
  Settings2,
  LayoutTemplate,
  ArrowUpDown,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useFleetStatus, useFleetTags } from "@/hooks/useFleetMonitor";
import { api } from "@/api/client";
import { fleetCardStyles, fleetInfoStyles, gradients } from "./design-tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineStepType =
  | "config_write"
  | "health_gate"
  | "delay"
  | "canary_check"
  | "notification"
  | "rollback_checkpoint"
  | "custom_script";

export type PipelineStepStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "paused";

export type PipelineStatus =
  | "draft"
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "aborted"
  | "rolling_back";

export interface PipelineStepConfig {
  /** For config_write: the config path and value */
  configPath?: string;
  configValue?: string;
  /** For health_gate: minimum score to proceed */
  healthThreshold?: number;
  /** For delay: wait duration in seconds */
  delaySeconds?: number;
  /** For canary_check: percentage of bots to target first */
  canaryPercent?: number;
  /** For notification: message template */
  notificationMessage?: string;
  /** For custom_script: the script content */
  script?: string;
}

export interface PipelineStep {
  id: string;
  type: PipelineStepType;
  label: string;
  config: PipelineStepConfig;
  status: PipelineStepStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  steps: Omit<PipelineStep, "id" | "status" | "startedAt" | "completedAt" | "error">[];
  tags: string[];
  createdAt: string;
}

export interface PipelineExecution {
  id: string;
  templateId: string | null;
  name: string;
  status: PipelineStatus;
  targetBotIds: string[];
  steps: PipelineStep[];
  currentStepIndex: number;
  startedAt: string | null;
  completedAt: string | null;
  rateLimits: Record<string, { remaining: number; limit: number; resetsAt: string }>;
  log: PipelineLogEntry[];
}

export interface PipelineLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  stepId?: string;
  message: string;
}

// ---------------------------------------------------------------------------
// API Client extensions for Fleet Command
// ---------------------------------------------------------------------------

const fleetCommandApi = {
  templates: () =>
    api.get<{ ok: boolean; templates: PipelineTemplate[] }>("/fleet-command/templates"),

  pipelineStatus: (pipelineId: string) =>
    api.get<{ ok: boolean; pipeline: PipelineExecution }>(
      `/fleet-command/pipelines/${encodeURIComponent(pipelineId)}`,
    ),

  execute: (data: {
    name: string;
    templateId?: string;
    targetBotIds: string[];
    steps: Omit<PipelineStep, "id" | "status" | "startedAt" | "completedAt" | "error">[];
  }) => api.post<{ ok: boolean; pipelineId: string }>("/fleet-command/pipelines/execute", data),

  pause: (pipelineId: string) =>
    api.post<{ ok: boolean }>(
      `/fleet-command/pipelines/${encodeURIComponent(pipelineId)}/pause`,
      {},
    ),

  abort: (pipelineId: string) =>
    api.post<{ ok: boolean }>(
      `/fleet-command/pipelines/${encodeURIComponent(pipelineId)}/abort`,
      {},
    ),

  rollback: (pipelineId: string) =>
    api.post<{ ok: boolean }>(
      `/fleet-command/pipelines/${encodeURIComponent(pipelineId)}/rollback`,
      {},
    ),

  saveTemplate: (data: {
    name: string;
    description: string;
    steps: Omit<PipelineStep, "id" | "status" | "startedAt" | "completedAt" | "error">[];
  }) =>
    api.post<{ ok: boolean; template: PipelineTemplate }>(
      "/fleet-command/templates",
      data,
    ),
};

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

const commandQueryKeys = {
  templates: () => ["fleet", "command-templates"] as const,
  pipelineStatus: (id: string) => ["fleet", "command-pipeline", id] as const,
};

// ---------------------------------------------------------------------------
// React Query Hooks
// ---------------------------------------------------------------------------

/** Fetch available pipeline templates. */
export function useFleetCommandTemplates() {
  return useQuery({
    queryKey: commandQueryKeys.templates(),
    queryFn: () => fleetCommandApi.templates(),
    staleTime: 60_000,
  });
}

/** Poll pipeline execution status every 3s while running. */
export function useFleetCommandStatus(pipelineId: string | null) {
  return useQuery({
    queryKey: commandQueryKeys.pipelineStatus(pipelineId!),
    queryFn: () => fleetCommandApi.pipelineStatus(pipelineId!),
    enabled: !!pipelineId,
    refetchInterval: 3_000,
    staleTime: 1_000,
  });
}

/** Execute a pipeline across selected bots. */
export function useExecutePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fleetCommandApi.execute,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fleet", "command-pipeline"] });
    },
  });
}

/** Pause a running pipeline. */
export function usePausePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fleetCommandApi.pause,
    onSuccess: (_data, pipelineId) => {
      queryClient.invalidateQueries({
        queryKey: commandQueryKeys.pipelineStatus(pipelineId),
      });
    },
  });
}

/** Abort a running pipeline. */
export function useAbortPipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fleetCommandApi.abort,
    onSuccess: (_data, pipelineId) => {
      queryClient.invalidateQueries({
        queryKey: commandQueryKeys.pipelineStatus(pipelineId),
      });
    },
  });
}

/** Rollback a pipeline to the last checkpoint. */
function useRollbackPipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fleetCommandApi.rollback,
    onSuccess: (_data, pipelineId) => {
      queryClient.invalidateQueries({
        queryKey: commandQueryKeys.pipelineStatus(pipelineId),
      });
    },
  });
}

/** Save current pipeline steps as a reusable template. */
function useSaveTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fleetCommandApi.saveTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commandQueryKeys.templates() });
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STEP_TYPE_META: Record<
  PipelineStepType,
  { label: string; icon: typeof Play; color: string }
> = {
  config_write: { label: "Config Write", icon: Settings2, color: "text-[#D4A373]" },
  health_gate: { label: "Health Gate", icon: CheckCircle2, color: "text-[#2A9D8F]" },
  delay: { label: "Delay", icon: Clock, color: "text-[#B08968]" },
  canary_check: { label: "Canary Check", icon: AlertTriangle, color: "text-amber-500" },
  notification: { label: "Notification", icon: Terminal, color: "text-[#264653]" },
  rollback_checkpoint: { label: "Checkpoint", icon: Save, color: "text-indigo-500" },
  custom_script: { label: "Custom Script", icon: Zap, color: "text-purple-500" },
};

const STATUS_COLORS: Record<PipelineStepStatus, string> = {
  pending: "bg-gray-300 border-gray-300",
  running: "bg-[#D4A373] border-[#D4A373] animate-pulse",
  succeeded: "bg-[#2A9D8F] border-[#2A9D8F]",
  failed: "bg-red-500 border-red-500",
  skipped: "bg-gray-400 border-gray-400",
  paused: "bg-amber-400 border-amber-400",
};

const LOG_LEVEL_STYLES: Record<string, string> = {
  info: "text-[#264653]",
  warn: "text-amber-600",
  error: "text-red-600 font-medium",
  success: "text-[#2A9D8F] font-medium",
};

function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// 1. Pipeline Template Selector
// ---------------------------------------------------------------------------

function TemplateSelector({
  onSelect,
}: {
  onSelect: (template: PipelineTemplate) => void;
}) {
  const { data, isLoading } = useFleetCommandTemplates();
  const templates = data?.templates ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-[#D4A373]" />
        <span className="ml-2 text-sm text-muted-foreground">Loading templates...</span>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-8">
        <LayoutTemplate className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No templates yet. Build a pipeline below and save it as a template.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {templates.map((tpl) => (
        <button
          key={tpl.id}
          onClick={() => onSelect(tpl)}
          className={cn(
            fleetCardStyles.interactive,
            "text-left p-4 group",
          )}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl">{tpl.icon}</span>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold truncate group-hover:text-[#D4A373] transition-colors">
                {tpl.name}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {tpl.description}
              </p>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground">
                  {tpl.steps.length} step{tpl.steps.length !== 1 ? "s" : ""}
                </span>
                {tpl.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className={fleetInfoStyles.badge}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Target Bot Selection
// ---------------------------------------------------------------------------

function TargetBotSelector({
  selectedBotIds,
  onSelectionChange,
}: {
  selectedBotIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}) {
  const { data: fleetData } = useFleetStatus();
  const { data: tagsData } = useFleetTags();
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const bots = fleetData?.bots ?? [];
  const allTags = useMemo(() => {
    const tags = tagsData?.tags ?? [];
    const uniqueLabels = [...new Set(tags.map((t) => t.tag))];
    return uniqueLabels.sort();
  }, [tagsData]);

  const tagsByBot = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const tag of tagsData?.tags ?? []) {
      const existing = map.get(tag.botId) ?? [];
      existing.push(tag.tag);
      map.set(tag.botId, existing);
    }
    return map;
  }, [tagsData]);

  const filteredBots = useMemo(() => {
    let result = bots;
    if (tagFilter) {
      result = result.filter((b) => tagsByBot.get(b.botId)?.includes(tagFilter));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (b) => b.name.toLowerCase().includes(q) || b.botId.toLowerCase().includes(q),
      );
    }
    return result;
  }, [bots, tagFilter, tagsByBot, searchQuery]);

  const onlineBots = useMemo(
    () => filteredBots.filter((b) => b.connectionState === "monitoring"),
    [filteredBots],
  );

  const toggleBot = useCallback(
    (botId: string) => {
      const next = new Set(selectedBotIds);
      if (next.has(botId)) next.delete(botId);
      else next.add(botId);
      onSelectionChange(next);
    },
    [selectedBotIds, onSelectionChange],
  );

  const selectAllOnline = useCallback(() => {
    const next = new Set(selectedBotIds);
    for (const b of onlineBots) next.add(b.botId);
    onSelectionChange(next);
  }, [onlineBots, selectedBotIds, onSelectionChange]);

  const deselectAll = useCallback(() => {
    onSelectionChange(new Set());
  }, [onSelectionChange]);

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <input
            type="text"
            placeholder="Search bots..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Tag filter */}
        <div className="relative">
          <select
            value={tagFilter ?? ""}
            onChange={(e) => setTagFilter(e.target.value || null)}
            className="rounded-lg border bg-background px-3 py-1.5 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
          <Filter className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>

        <button
          onClick={selectAllOnline}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#2A9D8F]/30 bg-[#E0F2F1] px-3 py-1.5 text-xs font-medium text-[#264653] hover:bg-[#2A9D8F]/20 transition-colors"
        >
          <Check className="h-3 w-3" />
          Select All Online ({onlineBots.length})
        </button>

        {selectedBotIds.size > 0 && (
          <button
            onClick={deselectAll}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <XCircle className="h-3 w-3" />
            Clear ({selectedBotIds.size})
          </button>
        )}
      </div>

      {/* Bot checkbox grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[240px] overflow-y-auto pr-1">
        {filteredBots.map((bot) => {
          const isOnline = bot.connectionState === "monitoring";
          const isSelected = selectedBotIds.has(bot.botId);
          const botTags = tagsByBot.get(bot.botId) ?? [];

          return (
            <label
              key={bot.botId}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-all duration-200",
                isSelected
                  ? "border-[#D4A373]/50 bg-[#D4A373]/5 shadow-sm"
                  : "border-[#E0E0E0]/50 hover:border-[#D4A373]/20",
                !isOnline && "opacity-60",
              )}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleBot(bot.botId)}
                className="h-4 w-4 rounded border-gray-300 text-[#D4A373] focus:ring-[#D4A373]/50 accent-[#D4A373]"
              />
              <span className="text-lg shrink-0">{bot.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{bot.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      isOnline ? "bg-[#2A9D8F]" : "bg-gray-400",
                    )}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {isOnline ? "Online" : bot.connectionState}
                  </span>
                  {botTags.slice(0, 2).map((tag) => (
                    <span key={tag} className={cn(fleetInfoStyles.badge, "text-[9px] px-1.5")}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {filteredBots.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No bots match the current filters.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Pipeline Builder
// ---------------------------------------------------------------------------

function PipelineBuilder({
  steps,
  onStepsChange,
}: {
  steps: PipelineStep[];
  onStepsChange: (steps: PipelineStep[]) => void;
}) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  const addStep = useCallback(
    (type: PipelineStepType) => {
      const meta = STEP_TYPE_META[type];
      const newStep: PipelineStep = {
        id: generateStepId(),
        type,
        label: meta.label,
        config: getDefaultConfig(type),
        status: "pending",
      };
      onStepsChange([...steps, newStep]);
      setExpandedStepId(newStep.id);
    },
    [steps, onStepsChange],
  );

  const removeStep = useCallback(
    (stepId: string) => {
      onStepsChange(steps.filter((s) => s.id !== stepId));
      if (expandedStepId === stepId) setExpandedStepId(null);
    },
    [steps, onStepsChange, expandedStepId],
  );

  const updateStepConfig = useCallback(
    (stepId: string, config: Partial<PipelineStepConfig>) => {
      onStepsChange(
        steps.map((s) =>
          s.id === stepId ? { ...s, config: { ...s.config, ...config } } : s,
        ),
      );
    },
    [steps, onStepsChange],
  );

  const updateStepLabel = useCallback(
    (stepId: string, label: string) => {
      onStepsChange(steps.map((s) => (s.id === stepId ? { ...s, label } : s)));
    },
    [steps, onStepsChange],
  );

  const moveStep = useCallback(
    (index: number, direction: "up" | "down") => {
      const newSteps = [...steps];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newSteps.length) return;
      [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
      onStepsChange(newSteps);
    },
    [steps, onStepsChange],
  );

  return (
    <div className="space-y-3">
      {/* Step list with visual connectors */}
      {steps.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          No steps yet. Add a step from the toolbar below.
        </div>
      ) : (
        <div className="space-y-0">
          {steps.map((step, idx) => {
            const meta = STEP_TYPE_META[step.type];
            const Icon = meta.icon;
            const isExpanded = expandedStepId === step.id;
            const isLast = idx === steps.length - 1;

            return (
              <div key={step.id} className="relative">
                {/* Connector line */}
                {!isLast && (
                  <div className="absolute left-5 top-[44px] bottom-0 w-px bg-[#E0E0E0]" />
                )}

                <div
                  className={cn(
                    "relative rounded-xl border p-3 mb-2 transition-all duration-200",
                    isExpanded
                      ? "border-[#D4A373]/40 bg-[#FAF9F6]/95 shadow-sm"
                      : "border-[#E0E0E0]/50 hover:border-[#D4A373]/20",
                  )}
                >
                  {/* Step header */}
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0",
                        "bg-gradient-to-br from-[#D4A373] to-[#B08968]",
                      )}
                    >
                      {idx + 1}
                    </div>

                    <Icon className={cn("h-4 w-4 shrink-0", meta.color)} />

                    <button
                      onClick={() =>
                        setExpandedStepId(isExpanded ? null : step.id)
                      }
                      className="flex-1 text-left min-w-0"
                    >
                      <span className="text-sm font-medium truncate block">
                        {step.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {meta.label}
                      </span>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => moveStep(idx, "up")}
                        disabled={idx === 0}
                        className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                        title="Move up"
                        aria-label="Move step up"
                      >
                        <ArrowUpDown className="h-3 w-3 rotate-180" />
                      </button>
                      <button
                        onClick={() => moveStep(idx, "down")}
                        disabled={isLast}
                        className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                        title="Move down"
                        aria-label="Move step down"
                      >
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => removeStep(step.id)}
                        className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                        title="Remove step"
                        aria-label="Remove step"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() =>
                          setExpandedStepId(isExpanded ? null : step.id)
                        }
                        className="p-1 rounded hover:bg-muted transition-colors"
                        aria-label={isExpanded ? "Collapse step details" : "Expand step details"}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Step config (expanded) */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-[#E0E0E0]/50 space-y-3">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">
                          Step Label
                        </label>
                        <input
                          type="text"
                          value={step.label}
                          onChange={(e) => updateStepLabel(step.id, e.target.value)}
                          className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <StepConfigEditor
                        type={step.type}
                        config={step.config}
                        onChange={(c) => updateStepConfig(step.id, c)}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add step toolbar */}
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[#E0E0E0]/50">
        <span className="text-xs text-muted-foreground mr-1">Add step:</span>
        {(Object.keys(STEP_TYPE_META) as PipelineStepType[]).map((type) => {
          const meta = STEP_TYPE_META[type];
          const Icon = meta.icon;
          return (
            <button
              key={type}
              onClick={() => addStep(type)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E0E0E0]/50 px-2.5 py-1.5 text-xs font-medium hover:border-[#D4A373]/30 hover:bg-[#D4A373]/5 transition-all duration-200"
              title={meta.label}
            >
              <Icon className={cn("h-3 w-3", meta.color)} />
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step Config Editor (per-type config fields)
// ---------------------------------------------------------------------------

function StepConfigEditor({
  type,
  config,
  onChange,
}: {
  type: PipelineStepType;
  config: PipelineStepConfig;
  onChange: (config: Partial<PipelineStepConfig>) => void;
}) {
  switch (type) {
    case "config_write":
      return (
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Config Path</label>
            <input
              type="text"
              placeholder="e.g. agent.model"
              value={config.configPath ?? ""}
              onChange={(e) => onChange({ configPath: e.target.value })}
              className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Value</label>
            <input
              type="text"
              placeholder="New config value"
              value={config.configValue ?? ""}
              onChange={(e) => onChange({ configValue: e.target.value })}
              className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      );

    case "health_gate":
      return (
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Min Health Score (0-100)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={config.healthThreshold ?? 70}
            onChange={(e) => onChange({ healthThreshold: Number(e.target.value) })}
            className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Pipeline will pause if any target bot drops below this score.
          </p>
        </div>
      );

    case "delay":
      return (
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Delay (seconds)
          </label>
          <input
            type="number"
            min={1}
            value={config.delaySeconds ?? 30}
            onChange={(e) => onChange({ delaySeconds: Number(e.target.value) })}
            className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Wait period before proceeding to the next step (e.g. soak time).
          </p>
        </div>
      );

    case "canary_check":
      return (
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Canary Percentage (%)
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={config.canaryPercent ?? 10}
            onChange={(e) => onChange({ canaryPercent: Number(e.target.value) })}
            className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Deploy to this percentage of bots first, then verify before rolling out to the rest.
          </p>
        </div>
      );

    case "notification":
      return (
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Notification Message
          </label>
          <textarea
            rows={3}
            placeholder="Pipeline step completed: {{stepLabel}} on {{botCount}} bots"
            value={config.notificationMessage ?? ""}
            onChange={(e) => onChange({ notificationMessage: e.target.value })}
            className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm mt-1 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      );

    case "rollback_checkpoint":
      return (
        <p className="text-xs text-muted-foreground">
          Creates a snapshot of current bot configurations. If a later step fails,
          you can rollback to this checkpoint.
        </p>
      );

    case "custom_script":
      return (
        <div>
          <label className="text-xs font-medium text-muted-foreground">Script</label>
          <textarea
            rows={5}
            placeholder="// Custom script executed on each target bot..."
            value={config.script ?? ""}
            onChange={(e) => onChange({ script: e.target.value })}
            className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm mt-1 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      );
  }
}

function getDefaultConfig(type: PipelineStepType): PipelineStepConfig {
  switch (type) {
    case "config_write":
      return { configPath: "", configValue: "" };
    case "health_gate":
      return { healthThreshold: 70 };
    case "delay":
      return { delaySeconds: 30 };
    case "canary_check":
      return { canaryPercent: 10 };
    case "notification":
      return { notificationMessage: "" };
    case "rollback_checkpoint":
      return {};
    case "custom_script":
      return { script: "" };
  }
}

// ---------------------------------------------------------------------------
// 4a. Step Progress Indicator
// ---------------------------------------------------------------------------

function StepProgressIndicator({
  steps,
  currentStepIndex,
  onStepClick,
}: {
  steps: PipelineStep[];
  currentStepIndex: number;
  onStepClick?: (stepIndex: number) => void;
}) {
  if (steps.length === 0) return null;

  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-2">
      {steps.map((step, idx) => {
        const meta = STEP_TYPE_META[step.type];
        const Icon = meta.icon;
        const isCurrent = idx === currentStepIndex;

        return (
          <div key={step.id} className="flex items-center shrink-0">
            {/* Step circle */}
            <button
              onClick={() => onStepClick?.(idx)}
              className={cn(
                "relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300",
                STATUS_COLORS[step.status],
                isCurrent && "ring-2 ring-[#D4A373]/40 ring-offset-2",
              )}
              title={`${step.label} — ${step.status}`}
            >
              {step.status === "running" ? (
                <Loader2 className="h-4 w-4 text-white animate-spin" />
              ) : step.status === "succeeded" ? (
                <CheckCircle2 className="h-4 w-4 text-white" />
              ) : step.status === "failed" ? (
                <XCircle className="h-4 w-4 text-white" />
              ) : (
                <Icon className="h-4 w-4 text-white" />
              )}
            </button>

            {/* Step label below */}
            <div className="absolute mt-14 -ml-2 w-16 text-center pointer-events-none" />

            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "w-8 h-0.5 transition-colors duration-300",
                  step.status === "succeeded"
                    ? "bg-[#2A9D8F]"
                    : step.status === "failed"
                      ? "bg-red-300"
                      : "bg-[#E0E0E0]",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4b. Current Step Detail Panel
// ---------------------------------------------------------------------------

function CurrentStepDetail({ step }: { step: PipelineStep | null }) {
  if (!step) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No step currently active.
      </div>
    );
  }

  const meta = STEP_TYPE_META[step.type];
  const Icon = meta.icon;
  const elapsed = step.startedAt
    ? Math.round((Date.now() - new Date(step.startedAt).getTime()) / 1000)
    : 0;

  return (
    <div className={cn(fleetCardStyles.elevated, "p-4 space-y-3")}>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center",
            "bg-gradient-to-br from-[#D4A373] to-[#B08968]",
          )}
        >
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold">{step.label}</h4>
          <p className="text-[10px] text-muted-foreground">{meta.label}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase",
            step.status === "running"
              ? "bg-[#D4A373]/10 text-[#D4A373]"
              : step.status === "succeeded"
                ? "bg-[#E0F2F1] text-[#264653]"
                : step.status === "failed"
                  ? "bg-red-100 text-red-700"
                  : step.status === "paused"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-gray-100 text-gray-600",
          )}
        >
          {step.status}
        </span>
      </div>

      {/* Step-specific detail */}
      {step.type === "health_gate" && step.config.healthThreshold != null && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Gate condition:</span>
          <span className="font-medium">
            All bots health &ge; {step.config.healthThreshold}
          </span>
        </div>
      )}

      {step.type === "delay" && step.config.delaySeconds != null && step.status === "running" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Delay progress</span>
            <span className="font-medium">
              {Math.min(elapsed, step.config.delaySeconds)}s / {step.config.delaySeconds}s
            </span>
          </div>
          <div className="w-full h-2 bg-[#E0E0E0]/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#D4A373] to-[#B08968] rounded-full transition-all duration-1000"
              style={{
                width: `${Math.min(100, (elapsed / step.config.delaySeconds) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {step.type === "canary_check" && step.config.canaryPercent != null && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Canary scope:</span>
          <span className="font-medium">{step.config.canaryPercent}% of target bots</span>
        </div>
      )}

      {step.type === "config_write" && (
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Path:</span>
            <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
              {step.config.configPath || "(not set)"}
            </code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Value:</span>
            <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
              {step.config.configValue || "(not set)"}
            </code>
          </div>
        </div>
      )}

      {step.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {step.error}
        </div>
      )}

      {step.startedAt && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          Started {new Date(step.startedAt).toLocaleTimeString()}
          {step.completedAt && (
            <span className="ml-2">
              Completed {new Date(step.completedAt).toLocaleTimeString()}
            </span>
          )}
          {!step.completedAt && step.startedAt && (
            <span className="ml-2">Elapsed: {elapsed}s</span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4c. Execution Log
// ---------------------------------------------------------------------------

function ExecutionLog({ entries }: { entries: PipelineLogEntry[] }) {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        Execution log will appear here when the pipeline runs.
      </div>
    );
  }

  return (
    <div className="max-h-[200px] overflow-y-auto bg-[#2C2420] rounded-xl p-3 font-mono text-xs space-y-0.5">
      {entries.map((entry, idx) => (
        <div key={idx} className="flex items-start gap-2">
          <span className="text-[#B08968] shrink-0 tabular-nums">
            {new Date(entry.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          <span
            className={cn(
              "uppercase font-semibold w-7 shrink-0 text-[10px]",
              entry.level === "info"
                ? "text-[#2A9D8F]"
                : entry.level === "warn"
                  ? "text-[#D4A373]"
                  : entry.level === "error"
                    ? "text-red-400"
                    : "text-emerald-400",
            )}
          >
            {entry.level === "success" ? "OK" : entry.level.toUpperCase()}
          </span>
          <span className="text-[#FAF9F6]/90 break-all">{entry.message}</span>
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Rate Limit Status Bar
// ---------------------------------------------------------------------------

function RateLimitBar({
  rateLimits,
}: {
  rateLimits: Record<string, { remaining: number; limit: number; resetsAt: string }>;
}) {
  const entries = Object.entries(rateLimits);
  if (entries.length === 0) return null;

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <span className="text-xs font-medium text-muted-foreground shrink-0">
        Rate Limits:
      </span>
      {entries.map(([gateway, rl]) => {
        const pct = rl.limit > 0 ? (rl.remaining / rl.limit) * 100 : 100;
        const isLow = pct < 20;
        const isCritical = pct < 5;

        return (
          <div key={gateway} className="flex items-center gap-2">
            <span className="text-xs truncate max-w-[120px]" title={gateway}>
              {gateway}
            </span>
            <div className="w-20 h-1.5 bg-[#E0E0E0]/50 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  isCritical
                    ? "bg-red-500"
                    : isLow
                      ? "bg-amber-400"
                      : "bg-[#2A9D8F]",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span
              className={cn(
                "text-[10px] tabular-nums font-medium",
                isCritical
                  ? "text-red-500"
                  : isLow
                    ? "text-amber-600"
                    : "text-muted-foreground",
              )}
            >
              {rl.remaining}/{rl.limit}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Control Buttons
// ---------------------------------------------------------------------------

function PipelineControls({
  pipelineStatus,
  pipelineId,
  canExecute,
  onExecute,
  onSaveTemplate,
}: {
  pipelineStatus: PipelineStatus | null;
  pipelineId: string | null;
  canExecute: boolean;
  onExecute: () => void;
  onSaveTemplate: () => void;
}) {
  const pauseMutation = usePausePipeline();
  const abortMutation = useAbortPipeline();
  const rollbackMutation = useRollbackPipeline();

  const isRunning = pipelineStatus === "running";
  const isPaused = pipelineStatus === "paused";
  const isActive = isRunning || isPaused;
  const isTerminal =
    pipelineStatus === "completed" ||
    pipelineStatus === "failed" ||
    pipelineStatus === "aborted";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Execute / Resume */}
      {(!isActive || isPaused) && (
        <button
          disabled={!canExecute || pauseMutation.isPending}
          onClick={onExecute}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200",
            canExecute
              ? cn(
                  gradients.primary,
                  "text-white hover:shadow-lg hover:shadow-[#D4A373]/20",
                  gradients.primaryHover,
                )
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          <Play className="h-4 w-4" />
          {isPaused ? "Resume" : "Execute Pipeline"}
        </button>
      )}

      {/* Pause */}
      {isRunning && pipelineId && (
        <button
          disabled={pauseMutation.isPending}
          onClick={() => pauseMutation.mutate(pipelineId)}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
        >
          {pauseMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Pause className="h-4 w-4" />
          )}
          Pause
        </button>
      )}

      {/* Abort */}
      {isActive && pipelineId && (
        <button
          disabled={abortMutation.isPending}
          onClick={() => abortMutation.mutate(pipelineId)}
          className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
        >
          {abortMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          Abort
        </button>
      )}

      {/* Rollback */}
      {(isTerminal || isPaused) && pipelineId && (
        <button
          disabled={rollbackMutation.isPending}
          onClick={() => rollbackMutation.mutate(pipelineId)}
          className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          {rollbackMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          Rollback
        </button>
      )}

      {/* Save as Template */}
      <button
        onClick={onSaveTemplate}
        className="inline-flex items-center gap-2 rounded-xl border border-[#E0E0E0]/50 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-[#D4A373]/30 transition-all duration-200 ml-auto"
      >
        <Save className="h-4 w-4" />
        Save as Template
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save Template Dialog
// ---------------------------------------------------------------------------

function SaveTemplateDialog({
  open,
  onClose,
  steps,
}: {
  open: boolean;
  onClose: () => void;
  steps: PipelineStep[];
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const saveMutation = useSaveTemplate();

  const handleSave = useCallback(() => {
    if (!name.trim()) return;
    saveMutation.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        steps: steps.map((s) => ({ type: s.type, label: s.label, config: s.config })),
      },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          onClose();
        },
      },
    );
  }, [name, description, steps, saveMutation, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className={cn(fleetCardStyles.elevated, "relative z-10 w-full max-w-md p-6 space-y-4")}>
        <h3 className="text-base font-semibold">Save Pipeline Template</h3>
        <p className="text-sm text-muted-foreground">
          Save this {steps.length}-step pipeline as a reusable template.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Template Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Safe Model Rollout"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this pipeline do?"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm mt-1 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!name.trim() || saveMutation.isPending}
            onClick={handleSave}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
              name.trim()
                ? cn(gradients.primary, "text-white hover:shadow-lg hover:shadow-[#D4A373]/20")
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Template
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible Section wrapper
// ---------------------------------------------------------------------------

function Section({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn(fleetCardStyles.default, "overflow-hidden")}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 w-full px-5 py-4 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component — CommandCenter
// ---------------------------------------------------------------------------

export function CommandCenter() {
  // ── Local state ──────────────────────────────────────────────────────
  const [pipelineName, setPipelineName] = useState("Untitled Pipeline");
  const [selectedBotIds, setSelectedBotIds] = useState<Set<string>>(new Set());
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);

  // ── Remote data ──────────────────────────────────────────────────────
  const executeMutation = useExecutePipeline();
  const { data: pipelineData } = useFleetCommandStatus(activePipelineId);
  const pipeline = pipelineData?.pipeline ?? null;

  // Sync remote pipeline state into local steps when running
  useEffect(() => {
    if (pipeline) {
      setSteps(pipeline.steps);
    }
  }, [pipeline]);

  // ── Derived ──────────────────────────────────────────────────────────
  const pipelineStatus = pipeline?.status ?? (activePipelineId ? "queued" : null);
  const currentStep =
    pipeline && pipeline.currentStepIndex >= 0
      ? pipeline.steps[pipeline.currentStepIndex]
      : selectedStepIndex != null
        ? steps[selectedStepIndex]
        : null;
  const canExecute = steps.length > 0 && selectedBotIds.size > 0 && !executeMutation.isPending;

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleTemplateSelect = useCallback((template: PipelineTemplate) => {
    setPipelineName(template.name);
    setSteps(
      template.steps.map((s) => ({
        ...s,
        id: generateStepId(),
        status: "pending" as const,
      })),
    );
    setActivePipelineId(null);
  }, []);

  const handleExecute = useCallback(() => {
    executeMutation.mutate(
      {
        name: pipelineName,
        targetBotIds: Array.from(selectedBotIds),
        steps: steps.map((s) => ({ type: s.type, label: s.label, config: s.config })),
      },
      {
        onSuccess: (result) => {
          setActivePipelineId(result.pipelineId);
        },
      },
    );
  }, [pipelineName, selectedBotIds, steps, executeMutation]);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#2C2420]">Fleet Command Center</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Build and execute deployment pipelines across your fleet.
          </p>
        </div>

        {/* Pipeline name */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
            className="rounded-lg border bg-background px-3 py-1.5 text-sm font-medium text-right w-[200px] focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Section 1: Template Selector */}
      <Section
        title="Pipeline Templates"
        subtitle="Start from a pre-built template or build from scratch"
        defaultOpen={steps.length === 0}
      >
        <TemplateSelector onSelect={handleTemplateSelect} />
      </Section>

      {/* Section 2: Target Bot Selection */}
      <Section
        title="Target Bots"
        subtitle={`${selectedBotIds.size} bot${selectedBotIds.size !== 1 ? "s" : ""} selected`}
      >
        <TargetBotSelector
          selectedBotIds={selectedBotIds}
          onSelectionChange={setSelectedBotIds}
        />
      </Section>

      {/* Section 3: Pipeline Builder */}
      <Section
        title="Pipeline Steps"
        subtitle={`${steps.length} step${steps.length !== 1 ? "s" : ""} configured`}
      >
        <PipelineBuilder steps={steps} onStepsChange={setSteps} />
      </Section>

      {/* Section 4: Execution Visualization (shown when pipeline exists) */}
      {(activePipelineId || steps.length > 0) && (
        <Section
          title="Execution"
          subtitle={
            pipelineStatus
              ? `Status: ${pipelineStatus}`
              : "Configure steps and select bots to execute"
          }
        >
          <div className="space-y-4">
            {/* 4a. Step progress indicator */}
            <StepProgressIndicator
              steps={steps}
              currentStepIndex={pipeline?.currentStepIndex ?? -1}
              onStepClick={setSelectedStepIndex}
            />

            {/* 4b. Current step detail */}
            <CurrentStepDetail step={currentStep ?? null} />

            {/* 5. Rate limit status bar */}
            {pipeline?.rateLimits && (
              <RateLimitBar rateLimits={pipeline.rateLimits} />
            )}

            {/* 4c. Execution log */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">
                Execution Log
              </h4>
              <ExecutionLog entries={pipeline?.log ?? []} />
            </div>
          </div>
        </Section>
      )}

      {/* Section 6: Control Buttons */}
      <div className={cn(fleetCardStyles.default, "px-5 py-4")}>
        <PipelineControls
          pipelineStatus={pipelineStatus as PipelineStatus | null}
          pipelineId={activePipelineId}
          canExecute={canExecute}
          onExecute={handleExecute}
          onSaveTemplate={() => setShowSaveDialog(true)}
        />
      </div>

      {/* Save Template Dialog */}
      <SaveTemplateDialog
        open={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        steps={steps}
      />
    </div>
  );
}

export default CommandCenter;

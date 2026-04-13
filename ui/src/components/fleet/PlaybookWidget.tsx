/**
 * Playbook Widget
 *
 * Displays operational playbooks, active executions, and the playbook library.
 * Supports launching playbooks and viewing step-by-step progress.
 *
 * Pain Point brand: gold-brown #D4A373, off-white #FAF9F6, dark-brown #2C2420
 * @see Planning #20
 */

import { useState } from "react";
import {
  BookOpen,
  Play,
  Pause,
  Square,
  CheckCircle2,
  Circle,
  Loader2,
  Clock,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PlaybookStep {
  id: string;
  name: string;
  type: string;
  description: string;
}

interface Playbook {
  id: string;
  name: string;
  description: string;
  tags: string[];
  steps: PlaybookStep[];
  metadata: {
    timesExecuted: number;
    avgDurationMinutes: number;
    successRate: number;
  };
}

interface StepResult {
  stepId: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  notes?: string;
}

interface PlaybookExecution {
  id: string;
  playbookName: string;
  triggeredBy: "auto" | "manual";
  targetBotId?: string;
  status: "running" | "paused" | "waiting_approval" | "completed" | "failed" | "aborted";
  startedAt: string;
  stepResults: StepResult[];
  currentStepIndex: number;
}

// ─── Mock data ──────────────────────────────────────────────────────────────

const MOCK_PLAYBOOKS: Playbook[] = [
  {
    id: "pb-fleet-total-outage",
    name: "fleet-total-outage",
    description: "All bots offline — systematic diagnosis and recovery",
    tags: ["P1", "outage", "critical"],
    steps: [
      { id: "s1", name: "Ping Gateway Host", type: "check", description: "Verify gateway reachability" },
      { id: "s2", name: "Check Gateway Process", type: "check", description: "Verify process alive" },
      { id: "s3", name: "Diagnose", type: "decision", description: "Branch on reachability" },
      { id: "s4a", name: "Restart Gateway", type: "action", description: "Restart dead process" },
      { id: "s5", name: "Reconnect Bots", type: "action", description: "Reconnect all bots" },
      { id: "s6", name: "Verify Recovery", type: "check", description: "Confirm recovery" },
      { id: "s7", name: "Notify Team", type: "notification", description: "Send notification" },
    ],
    metadata: { timesExecuted: 2, avgDurationMinutes: 12, successRate: 100 },
  },
  {
    id: "pb-bot-unresponsive",
    name: "bot-unresponsive",
    description: "Single bot unresponsive — diagnose and recover",
    tags: ["P2", "bot", "availability"],
    steps: [
      { id: "s1", name: "Ping Gateway", type: "check", description: "Check gateway" },
      { id: "s2", name: "Health Check", type: "check", description: "Detailed health" },
      { id: "s3", name: "CPU Check", type: "decision", description: "Branch on CPU" },
      { id: "s4a", name: "Restart Bot Process", type: "action", description: "Restart bot" },
      { id: "s5", name: "Verify Recovery", type: "check", description: "Confirm recovery" },
      { id: "s6", name: "Update Incident", type: "notification", description: "Update incident" },
    ],
    metadata: { timesExecuted: 8, avgDurationMinutes: 4, successRate: 88 },
  },
  {
    id: "pb-cqi-degradation",
    name: "cqi-degradation",
    description: "Bot CQI declining — investigate and remediate",
    tags: ["P3", "quality"],
    steps: [
      { id: "s1", name: "Check Prompt Changes", type: "check", description: "Recent SOUL.md changes" },
      { id: "s2", name: "Check Config", type: "check", description: "Config drift" },
      { id: "s3", name: "Compare Timeline", type: "check", description: "Time Machine comparison" },
      { id: "s4", name: "Correlate", type: "decision", description: "Changes correlated?" },
      { id: "s5a", name: "Rollback", type: "approval", description: "Request rollback approval" },
      { id: "s6", name: "Report", type: "notification", description: "Send findings" },
    ],
    metadata: { timesExecuted: 5, avgDurationMinutes: 25, successRate: 80 },
  },
  {
    id: "pb-new-bot-validation",
    name: "new-bot-validation",
    description: "Validate newly connected bot",
    tags: ["onboarding"],
    steps: [
      { id: "s1", name: "Verify Connection", type: "check", description: "Gateway stable" },
      { id: "s2", name: "Read Identity", type: "check", description: "SOUL.md check" },
      { id: "s3", name: "List Skills", type: "check", description: "Enumerate skills" },
      { id: "s4", name: "Test Send", type: "action", description: "Send test message" },
      { id: "s5", name: "Assign Trust", type: "action", description: "Set L0" },
      { id: "s6", name: "Confirm", type: "notification", description: "Notify team" },
    ],
    metadata: { timesExecuted: 12, avgDurationMinutes: 6, successRate: 92 },
  },
];

const MOCK_ACTIVE_EXECUTION: PlaybookExecution = {
  id: "EXEC-0001",
  playbookName: "bot-unresponsive",
  triggeredBy: "auto",
  targetBotId: "boar-01",
  status: "running",
  startedAt: new Date(Date.now() - 120_000).toISOString(),
  stepResults: [
    { stepId: "s1", status: "success" },
    { stepId: "s2", status: "success" },
    { stepId: "s3", status: "success" },
    { stepId: "s4a", status: "running" },
    { stepId: "s5", status: "pending" },
    { stepId: "s6", status: "pending" },
  ],
  currentStepIndex: 3,
};

// ─── Step Status Icon ───────────────────────────────────────────────────────

function StepIcon({ status }: { status: StepResult["status"] }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case "running":
      return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
    case "failed":
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    case "skipped":
      return <Circle className="w-4 h-4 text-muted-foreground" />;
    default:
      return <Circle className="w-4 h-4 text-border dark:text-stone-600" />;
  }
}

// ─── Tag Color ──────────────────────────────────────────────────────────────

function tagColor(tag: string): string {
  if (tag === "P1" || tag === "critical") return "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400";
  if (tag === "P2") return "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400";
  if (tag === "P3") return "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400";
  if (tag === "outage" || tag === "availability") return "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400";
  if (tag === "onboarding") return "bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300";
  return "bg-primary/10 dark:bg-amber-900/20 text-primary dark:text-amber-400";
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PlaybookWidget() {
  const [selectedPlaybook, setSelectedPlaybook] = useState<string | null>(null);
  const playbooks = MOCK_PLAYBOOKS;
  const activeExecution = MOCK_ACTIVE_EXECUTION;

  return (
    <div className="space-y-4">
      {/* Active Execution */}
      {activeExecution && (
        <div className="bg-background/95 dark:bg-stone-900/95 backdrop-blur-xl rounded-2xl border border-primary/20 dark:border-amber-700/20 shadow-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-semibold text-foreground">
                Running: "{activeExecution.playbookName}" for 🐗
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                {activeExecution.status}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button" className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors" title="Pause" aria-label="Pause execution">
                <Pause className="w-4 h-4 text-foreground/50" />
              </button>
              <button
                type="button" className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="Abort" aria-label="Abort execution">
                <Square className="w-4 h-4 text-red-500/50" />
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {activeExecution.stepResults.map((sr, i) => {
              const playbook = playbooks.find((p) => p.name === activeExecution.playbookName);
              const step = playbook?.steps[i];
              return (
                <div key={sr.stepId} className="flex items-center gap-2 text-sm">
                  <StepIcon status={sr.status} />
                  <span className={`${sr.status === "pending" ? "text-foreground/30" : "text-foreground/70"}`}>
                    Step {i + 1}: {step?.name ?? sr.stepId}
                  </span>
                  {sr.status === "success" && (
                    <span className="text-xs text-emerald-500">✓</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Playbook Library */}
      <div className="bg-background/95 dark:bg-stone-900/95 backdrop-blur-xl rounded-2xl border border-primary/20 dark:border-amber-700/20 shadow-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Ops Playbooks</h3>
            <span className="rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide ml-2">Preview</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>Library: {playbooks.length}</span>
            <span>Success Rate: {Math.round(playbooks.reduce((s, p) => s + p.metadata.successRate, 0) / playbooks.length)}%</span>
          </div>
        </div>

        <div className="space-y-2">
          {playbooks.map((pb) => (
            <div key={pb.id}>
              <button
                type="button"
                onClick={() => setSelectedPlaybook(selectedPlaybook === pb.id ? null : pb.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-300 ${
                  selectedPlaybook === pb.id
                    ? "bg-primary/10 dark:bg-amber-900/20 border border-primary/30 dark:border-amber-700/30"
                    : "bg-background/50 dark:bg-stone-800/50 hover:bg-background/80 dark:hover:bg-stone-800/80 border border-transparent"
                }`}
              >
                <BookOpen className="w-4 h-4 text-primary/60" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground">{pb.name}</span>
                    {pb.tags.map((tag) => (
                      <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded-full ${tagColor(tag)}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{pb.description}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
                  <span>Used {pb.metadata.timesExecuted}x</span>
                  <span className="text-muted-foreground/30">|</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {pb.metadata.avgDurationMinutes}m
                  </span>
                </div>
                <ChevronRight
                  className={`w-4 h-4 text-muted-foreground/40 transition-transform ${
                    selectedPlaybook === pb.id ? "rotate-90" : ""
                  }`}
                />
              </button>

              {selectedPlaybook === pb.id && (
                <div className="ml-8 mt-2 mb-2 p-3 rounded-lg bg-background/70 dark:bg-stone-800/70 border border-border/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {pb.steps.length} steps
                    </span>
                    <button
                      type="button" className="text-xs px-3 py-1 rounded-full bg-primary text-white hover:bg-primary/80 transition-colors flex items-center gap-1">
                      <Play className="w-3 h-3" /> Run Playbook
                    </button>
                  </div>
                  {pb.steps.map((step, i) => (
                    <div key={step.id} className="flex items-center gap-2 text-xs py-1 text-foreground/60">
                      <span className="w-5 text-right text-foreground/30">{i + 1}.</span>
                      <span className={`w-16 ${
                        step.type === "check" ? "text-teal-600 dark:text-teal-400" :
                        step.type === "action" ? "text-primary" :
                        step.type === "decision" ? "text-teal-800 dark:text-teal-300" :
                        step.type === "approval" ? "text-orange-500" :
                        "text-muted-foreground"
                      }`}>
                        [{step.type}]
                      </span>
                      <span>{step.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

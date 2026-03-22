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
  Shield,
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
      return <CheckCircle2 className="w-4 h-4 text-[#27BD74]" />;
    case "running":
      return <Loader2 className="w-4 h-4 text-[#D4A373] animate-spin" />;
    case "failed":
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    case "skipped":
      return <Circle className="w-4 h-4 text-[#948F8C]" />;
    default:
      return <Circle className="w-4 h-4 text-[#E0E0E0]" />;
  }
}

// ─── Tag Color ──────────────────────────────────────────────────────────────

function tagColor(tag: string): string {
  if (tag === "P1" || tag === "critical") return "bg-red-100 text-red-700";
  if (tag === "P2") return "bg-orange-100 text-orange-700";
  if (tag === "P3") return "bg-amber-100 text-amber-700";
  if (tag === "outage" || tag === "availability") return "bg-red-50 text-red-600";
  if (tag === "onboarding") return "bg-[#E0F2F1] text-[#264653]";
  return "bg-[#D4A373]/10 text-[#9A7B5B]";
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
        <div className="bg-[#FAF9F6]/95 backdrop-blur-xl rounded-2xl border border-[#D4A373]/20 shadow-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-[#27BD74]" />
              <span className="text-sm font-semibold text-[#2C2420]">
                Running: "{activeExecution.playbookName}" for 🐗
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#27BD74]/10 text-[#27BD74]">
                {activeExecution.status}
              </span>
            </div>
            <div className="flex gap-2">
              <button className="p-1.5 rounded-lg hover:bg-[#D4A373]/10 transition-colors" title="Pause" aria-label="Pause execution">
                <Pause className="w-4 h-4 text-[#2C2420]/50" />
              </button>
              <button className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="Abort" aria-label="Abort execution">
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
                  <span className={`${sr.status === "pending" ? "text-[#2C2420]/30" : "text-[#2C2420]/70"}`}>
                    Step {i + 1}: {step?.name ?? sr.stepId}
                  </span>
                  {sr.status === "success" && (
                    <span className="text-xs text-[#27BD74]">✓</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Playbook Library */}
      <div className="bg-[#FAF9F6]/95 backdrop-blur-xl rounded-2xl border border-[#D4A373]/20 shadow-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#D4A373]" />
            <h3 className="text-lg font-semibold text-[#2C2420]">Ops Playbooks</h3>
            <span className="rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide ml-2">Preview</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-[#2C2420]/60">
            <span>Library: {playbooks.length}</span>
            <span>Success Rate: {Math.round(playbooks.reduce((s, p) => s + p.metadata.successRate, 0) / playbooks.length)}%</span>
          </div>
        </div>

        <div className="space-y-2">
          {playbooks.map((pb) => (
            <div key={pb.id}>
              <button
                onClick={() => setSelectedPlaybook(selectedPlaybook === pb.id ? null : pb.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-300 ${
                  selectedPlaybook === pb.id
                    ? "bg-[#D4A373]/10 border border-[#D4A373]/30"
                    : "bg-[#FAF9F6]/50 hover:bg-[#FAF9F6]/80 border border-transparent"
                }`}
              >
                <BookOpen className="w-4 h-4 text-[#D4A373]/60" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-[#2C2420]">{pb.name}</span>
                    {pb.tags.map((tag) => (
                      <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded-full ${tagColor(tag)}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-[#2C2420]/50 mt-0.5">{pb.description}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#2C2420]/40">
                  <span>Used {pb.metadata.timesExecuted}x</span>
                  <span className="text-[#2C2420]/20">|</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {pb.metadata.avgDurationMinutes}m
                  </span>
                </div>
                <ChevronRight
                  className={`w-4 h-4 text-[#2C2420]/20 transition-transform ${
                    selectedPlaybook === pb.id ? "rotate-90" : ""
                  }`}
                />
              </button>

              {selectedPlaybook === pb.id && (
                <div className="ml-8 mt-2 mb-2 p-3 rounded-lg bg-[#FAF9F6]/70 border border-[#E0E0E0]/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-[#2C2420]/60">
                      {pb.steps.length} steps
                    </span>
                    <button className="text-xs px-3 py-1 rounded-full bg-[#D4A373] text-white hover:bg-[#B08968] transition-colors flex items-center gap-1">
                      <Play className="w-3 h-3" /> Run Playbook
                    </button>
                  </div>
                  {pb.steps.map((step, i) => (
                    <div key={step.id} className="flex items-center gap-2 text-xs py-1 text-[#2C2420]/60">
                      <span className="w-5 text-right text-[#2C2420]/30">{i + 1}.</span>
                      <span className={`w-16 ${
                        step.type === "check" ? "text-[#30A1A8]" :
                        step.type === "action" ? "text-[#D4A373]" :
                        step.type === "decision" ? "text-[#264653]" :
                        step.type === "approval" ? "text-orange-500" :
                        "text-[#948F8C]"
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

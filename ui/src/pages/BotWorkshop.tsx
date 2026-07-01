/**
 * BotWorkshop — Visual editor for bot personality, memory, and skills.
 *
 * Turns Fleet from a read-only dashboard into a read-write workshop.
 * Uses design-tokens for dark mode support.
 */

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { workshopApi } from "@/api/fleet-workshop";
import { useCompany } from "@/context/CompanyContext";
import { fleetCardStyles, gradients } from "@/components/fleet/design-tokens";
import {
  FileText,
  Brain,
  Wrench,
  History,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  Check,
} from "lucide-react";

// ─── Card aliases from design tokens ──────────────────────────────────

const card = fleetCardStyles.default;
const cardElevated = fleetCardStyles.elevated;

// ─── Tabs ──────────────────────────────────────────────────────────────────

type WorkshopTab = "personality" | "memory" | "skills" | "versions";

const TABS: Array<{ key: WorkshopTab; label: string; icon: typeof FileText }> = [
  { key: "personality", label: "Personality", icon: FileText },
  { key: "memory", label: "Memory", icon: Brain },
  { key: "skills", label: "Skills", icon: Wrench },
  { key: "versions", label: "History", icon: History },
];

// ─── Main Component ────────────────────────────────────────────────────────

export default function BotWorkshop() {
  const { agentId } = useParams<{ agentId: string }>();
  const botId = agentId ?? "";
  const { selectedCompanyId } = useCompany();
  // Sent on every workshop request so the server can reject reads/writes to a
  // bot owned by another company (cross-tenant IDOR guard).
  const companyId = selectedCompanyId ?? undefined;
  const [activeTab, setActiveTab] = useState<WorkshopTab>("personality");

  if (!botId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No bot selected.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", gradients.primary)}>
          <Wrench className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Bot Workshop
          </h1>
          <p className="text-sm text-muted-foreground">
            Edit personality, manage memory, and install skills
          </p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className={cn(card, "p-1 flex gap-1")}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              type="button"
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              aria-pressed={isActive}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "personality" && <PersonalityEditor botId={botId} companyId={companyId} />}
      {activeTab === "memory" && <MemoryManager botId={botId} companyId={companyId} />}
      {activeTab === "skills" && <SkillManager botId={botId} companyId={companyId} />}
      {activeTab === "versions" && <VersionHistory botId={botId} companyId={companyId} />}
    </div>
  );
}

// ─── Personality Editor ────────────────────────────────────────────────────

function PersonalityEditor({ botId, companyId }: { botId: string; companyId?: string }) {
  const queryClient = useQueryClient();

  const soulQuery = useQuery({
    queryKey: ["workshop", botId, "SOUL.md"],
    queryFn: () => workshopApi.getFile(botId, "SOUL.md", companyId),
  });

  const identityQuery = useQuery({
    queryKey: ["workshop", botId, "IDENTITY.md"],
    queryFn: () => workshopApi.getFile(botId, "IDENTITY.md", companyId),
  });

  const [soulContent, setSoulContent] = useState("");
  const [identityContent, setIdentityContent] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (soulQuery.data?.file?.content) {
      setSoulContent(soulQuery.data.file.content);
    }
  }, [soulQuery.data]);

  useEffect(() => {
    if (identityQuery.data?.file?.content) {
      setIdentityContent(identityQuery.data.file.content);
    }
  }, [identityQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await Promise.all([
        workshopApi.setFile(botId, "SOUL.md", soulContent, companyId),
        workshopApi.setFile(botId, "IDENTITY.md", identityContent, companyId),
      ]);
    },
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["workshop", botId] });
    },
  });

  const handleChange = useCallback(
    (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setter(e.target.value);
      setDirty(true);
    },
    [],
  );

  const isLoading = soulQuery.isLoading || identityQuery.isLoading;
  const loadError = soulQuery.error || identityQuery.error;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={cn(card, "p-6 text-center")}>
        <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-400" />
        <p className="text-sm font-medium text-foreground">Failed to load personality files</p>
        <p className="text-xs mt-1 text-muted-foreground">
          {loadError instanceof Error ? loadError.message : "Unknown error"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {saveMutation.isError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">
            Failed to save: {saveMutation.error instanceof Error ? saveMutation.error.message : "Unknown error"}
          </p>
        </div>
      )}

      {/* SOUL.md Editor */}
      <div className={cardElevated}>
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm text-foreground">
                SOUL.md
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                Personality
              </span>
            </div>
            {dirty && (
              <span className="text-xs flex items-center gap-1 text-primary">
                <AlertTriangle className="w-3 h-3" />
                Unsaved changes
              </span>
            )}
          </div>
        </div>
        <textarea
          className="w-full p-4 bg-transparent font-mono text-sm resize-none focus:outline-none min-h-[200px] text-foreground"
          aria-label="SOUL.md editor"
          value={soulContent}
          onChange={handleChange(setSoulContent)}
          placeholder="# Bot Soul\n\nDescribe this bot's personality, tone, and behavior..."
        />
      </div>

      {/* IDENTITY.md Editor */}
      <div className={cardElevated}>
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span className="font-medium text-sm text-foreground">
              IDENTITY.md
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300">
              Identity
            </span>
          </div>
        </div>
        <textarea
          className="w-full p-4 bg-transparent font-mono text-sm resize-none focus:outline-none min-h-[150px] text-foreground"
          aria-label="IDENTITY.md editor"
          value={identityContent}
          onChange={handleChange(setIdentityContent)}
          placeholder="# Bot Identity\n\nDescribe who this bot is..."
        />
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => {
            setSoulContent(soulQuery.data?.file?.content ?? "");
            setIdentityContent(identityQuery.data?.file?.content ?? "");
            setDirty(false);
          }}
          disabled={!dirty}
          className="rounded-xl border-border"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Discard
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          className={cn("rounded-xl text-white", gradients.primary)}
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : saveMutation.isSuccess ? (
            <Check className="w-4 h-4 mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Push to Bot
        </Button>
      </div>
    </div>
  );
}

// ─── Memory Manager ────────────────────────────────────────────────────────

function MemoryManager({ botId, companyId }: { botId: string; companyId?: string }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newMemory, setNewMemory] = useState({ name: "", type: "reference", description: "", content: "" });

  const memoriesQuery = useQuery({
    queryKey: ["workshop", botId, "memories"],
    queryFn: () => workshopApi.listMemories(botId, companyId),
  });

  const injectMutation = useMutation({
    mutationFn: () => workshopApi.injectMemory(botId, newMemory, companyId),
    onSuccess: () => {
      setShowAdd(false);
      setNewMemory({ name: "", type: "reference", description: "", content: "" });
      queryClient.invalidateQueries({ queryKey: ["workshop", botId, "memories"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (path: string) => workshopApi.removeMemory(botId, path, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workshop", botId, "memories"] });
    },
  });

  const memories = memoriesQuery.data?.memories ?? [];
  const typeColorClasses: Record<string, { dot: string; badge: string }> = {
    user: { dot: "bg-primary", badge: "bg-primary/15 text-primary" },
    feedback: { dot: "bg-teal-600 dark:bg-teal-400", badge: "bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300" },
    project: { dot: "bg-amber-700 dark:bg-amber-500", badge: "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400" },
    reference: { dot: "bg-slate-700 dark:bg-slate-400", badge: "bg-slate-100 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300" },
    unknown: { dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground" },
  };

  const mutationError = injectMutation.isError || removeMutation.isError;
  const mutationErrorMsg = injectMutation.error ?? removeMutation.error;

  return (
    <div className="space-y-4">
      {mutationError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">
            {mutationErrorMsg instanceof Error ? mutationErrorMsg.message : "Operation failed"}
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {memories.length} memory {memories.length === 1 ? "entry" : "entries"}
        </div>
        <Button
          size="sm"
          onClick={() => setShowAdd(!showAdd)}
          className={cn("rounded-xl text-white", gradients.primary)}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Memory
        </Button>
      </div>

      {/* Add Memory Form */}
      {showAdd && (
        <div className={cn(cardElevated, "p-4 space-y-3")}>
          <div className="grid grid-cols-2 gap-3">
            <input
              className="px-3 py-2 rounded-xl border border-border bg-background/50 text-sm text-foreground"
              placeholder="Memory name"
              aria-label="Memory name"
              value={newMemory.name}
              onChange={(e) => setNewMemory((p) => ({ ...p, name: e.target.value }))}
            />
            <select
              className="px-3 py-2 rounded-xl border border-border bg-background/50 text-sm text-foreground"
              aria-label="Memory type"
              value={newMemory.type}
              onChange={(e) => setNewMemory((p) => ({ ...p, type: e.target.value }))}
            >
              <option value="user">User</option>
              <option value="feedback">Feedback</option>
              <option value="project">Project</option>
              <option value="reference">Reference</option>
            </select>
          </div>
          <input
            className="w-full px-3 py-2 rounded-xl border border-border bg-background/50 text-sm text-foreground"
            placeholder="Short description"
            aria-label="Memory description"
            value={newMemory.description}
            onChange={(e) => setNewMemory((p) => ({ ...p, description: e.target.value }))}
          />
          <textarea
            className="w-full px-3 py-2 rounded-xl border border-border bg-background/50 text-sm font-mono min-h-[100px] resize-none text-foreground"
            placeholder="Memory content..."
            aria-label="Memory content"
            value={newMemory.content}
            onChange={(e) => setNewMemory((p) => ({ ...p, content: e.target.value }))}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => injectMutation.mutate()}
              disabled={!newMemory.name || !newMemory.content || injectMutation.isPending}
              className={cn("rounded-xl text-white", gradients.primary)}
            >
              {injectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Inject"}
            </Button>
          </div>
        </div>
      )}

      {/* Memory List */}
      {memoriesQuery.isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : memoriesQuery.error ? (
        <div className={cn(card, "p-6 text-center")}>
          <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-400" />
          <p className="text-sm font-medium text-foreground">Failed to load memories</p>
          <p className="text-xs mt-1 text-muted-foreground">
            {memoriesQuery.error instanceof Error ? memoriesQuery.error.message : "Unknown error"}
          </p>
        </div>
      ) : memories.length === 0 ? (
        <div className={cn(card, "p-8 text-center")}>
          <Brain className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No memories found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => {
            const tc = typeColorClasses[m.type] ?? typeColorClasses.unknown;
            return (
              <div key={m.path} className={cn(card, "p-4 flex items-start gap-3 group")}>
                <div
                  className={cn("w-2 h-2 rounded-full mt-2 shrink-0", tc.dot)}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground">
                      {m.name}
                    </span>
                    <span className={cn("text-xs px-1.5 py-0.5 rounded-full", tc.badge)}>
                      {m.type}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5 truncate text-muted-foreground">
                    {m.description || m.path}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeMutation.mutate(m.path.replace("memory/", ""))}
                  aria-label={`Remove ${m.name} from memory`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Skill Manager ─────────────────────────────────────────────────────────

function SkillManager({ botId, companyId }: { botId: string; companyId?: string }) {
  const skillsQuery = useQuery({
    queryKey: ["workshop", botId, "skills"],
    queryFn: () => workshopApi.listSkills(botId, companyId),
  });

  const skills = skillsQuery.data?.skills ?? [];
  const statusColorClasses: Record<string, string> = {
    active: "bg-teal-600 dark:bg-teal-400",
    inactive: "bg-muted-foreground",
    error: "bg-red-500",
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {skills.length} skill{skills.length === 1 ? "" : "s"} installed
      </div>

      {skillsQuery.isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : skillsQuery.error ? (
        <div className={cn(card, "p-6 text-center")}>
          <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-400" />
          <p className="text-sm font-medium text-foreground">Failed to load skills</p>
          <p className="text-xs mt-1 text-muted-foreground">
            {skillsQuery.error instanceof Error ? skillsQuery.error.message : "Unknown error"}
          </p>
        </div>
      ) : skills.length === 0 ? (
        <div className={cn(card, "p-8 text-center")}>
          <Wrench className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No skills detected</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {skills.map((s) => (
            <div key={s.name} className={cn(card, "p-4 hover:-translate-y-0.5")}>
              <div className="flex items-center gap-2">
                <div
                  className={cn("w-2 h-2 rounded-full", statusColorClasses[s.status] ?? "bg-muted-foreground")}
                  aria-label={`Status: ${s.status}`}
                />
                <span className="font-medium text-sm truncate text-foreground">
                  {s.name}
                </span>
              </div>
              {s.version && (
                <p className="text-xs mt-1 text-muted-foreground">
                  v{s.version}
                </p>
              )}
              {s.description && (
                <p className="text-xs mt-1 truncate text-muted-foreground/80">
                  {s.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Version History ───────────────────────────────────────────────────────

function VersionHistory({ botId, companyId }: { botId: string; companyId?: string }) {
  const queryClient = useQueryClient();

  const versionsQuery = useQuery({
    queryKey: ["workshop", botId, "versions"],
    queryFn: () => workshopApi.getVersions(botId, companyId),
  });

  const rollbackMutation = useMutation({
    mutationFn: (versionId: string) => workshopApi.rollback(botId, versionId, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workshop", botId] });
    },
  });

  const versions = versionsQuery.data?.versions ?? [];

  return (
    <div className="space-y-4">
      {rollbackMutation.isError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">
            Rollback failed: {rollbackMutation.error instanceof Error ? rollbackMutation.error.message : "Unknown error"}
          </p>
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        {versions.length} personality version{versions.length === 1 ? "" : "s"}
      </div>

      {versionsQuery.isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : versionsQuery.error ? (
        <div className={cn(card, "p-6 text-center")}>
          <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-400" />
          <p className="text-sm font-medium text-foreground">Failed to load version history</p>
          <p className="text-xs mt-1 text-muted-foreground">
            {versionsQuery.error instanceof Error ? versionsQuery.error.message : "Unknown error"}
          </p>
        </div>
      ) : versions.length === 0 ? (
        <div className={cn(card, "p-8 text-center")}>
          <History className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No versions yet. Edit SOUL.md or IDENTITY.md to create the first snapshot.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {versions.map((v, i) => (
            <div key={v.id} className={cn(card, "p-4 flex items-center gap-4")}>
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold",
                  i === 0
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/20 text-primary",
                )}
              >
                v{v.version}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-foreground">
                  {v.changeDescription}
                </p>
                <p className="text-xs text-muted-foreground">
                  by {v.createdBy} &middot;{" "}
                  {new Date(v.createdAt).toLocaleString()}
                </p>
              </div>
              {i > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => rollbackMutation.mutate(v.id)}
                  disabled={rollbackMutation.isPending}
                  className="rounded-xl text-xs"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Rollback
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

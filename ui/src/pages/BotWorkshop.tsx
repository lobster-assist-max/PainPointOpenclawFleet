/**
 * BotWorkshop — Visual editor for bot personality, memory, and skills.
 *
 * Turns Fleet from a read-only dashboard into a read-write workshop.
 * Uses Pain Point brand colors + glassmorphism cards.
 */

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  workshopApi,
  type BotWorkshopFile,
  type PersonalityVersion,
  type MemoryEntry,
  type SkillEntry,
} from "@/api/fleet-workshop";
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

// ─── Design tokens (inline for self-contained component) ───────────────

const brand = {
  primary: "#D4A373",
  secondary: "#B08968",
  foreground: "#2C2420",
  background: "#FAF9F6",
  border: "#E0E0E0",
  tealMedium: "#2A9D8F",
};

const card = cn(
  "bg-[#FAF9F6]/90 backdrop-blur-md rounded-2xl border border-[#E0E0E0]/50",
  "shadow-sm transition-all duration-300",
);

const cardElevated = cn(
  "bg-[#FAF9F6]/95 backdrop-blur-xl rounded-2xl border border-[#D4A373]/20",
  "shadow-lg transition-all duration-300",
);

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
  const [activeTab, setActiveTab] = useState<WorkshopTab>("personality");

  if (!botId) {
    return (
      <div className="flex items-center justify-center h-64 text-[#2C2420]/60">
        No bot selected.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${brand.primary}, ${brand.secondary})` }}
        >
          <Wrench className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: brand.foreground }}>
            Bot Workshop
          </h1>
          <p className="text-sm" style={{ color: `${brand.foreground}99` }}>
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
                  ? "bg-[#D4A373] text-white shadow-sm"
                  : "text-[#2C2420]/60 hover:text-[#2C2420] hover:bg-[#FAF9F6]",
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "personality" && <PersonalityEditor botId={botId} />}
      {activeTab === "memory" && <MemoryManager botId={botId} />}
      {activeTab === "skills" && <SkillManager botId={botId} />}
      {activeTab === "versions" && <VersionHistory botId={botId} />}
    </div>
  );
}

// ─── Personality Editor ────────────────────────────────────────────────────

function PersonalityEditor({ botId }: { botId: string }) {
  const queryClient = useQueryClient();

  const soulQuery = useQuery({
    queryKey: ["workshop", botId, "SOUL.md"],
    queryFn: () => workshopApi.getFile(botId, "SOUL.md"),
  });

  const identityQuery = useQuery({
    queryKey: ["workshop", botId, "IDENTITY.md"],
    queryFn: () => workshopApi.getFile(botId, "IDENTITY.md"),
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
        workshopApi.setFile(botId, "SOUL.md", soulContent),
        workshopApi.setFile(botId, "IDENTITY.md", identityContent),
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
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: brand.primary }} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={cn(card, "p-6 text-center")}>
        <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-400" />
        <p className="text-sm font-medium" style={{ color: brand.foreground }}>Failed to load personality files</p>
        <p className="text-xs mt-1" style={{ color: `${brand.foreground}60` }}>
          {loadError instanceof Error ? loadError.message : "Unknown error"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* SOUL.md Editor */}
      <div className={cardElevated}>
        <div className="p-4 border-b border-[#E0E0E0]/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" style={{ color: brand.primary }} />
              <span className="font-medium text-sm" style={{ color: brand.foreground }}>
                SOUL.md
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${brand.primary}20`, color: brand.primary }}>
                Personality
              </span>
            </div>
            {dirty && (
              <span className="text-xs flex items-center gap-1" style={{ color: brand.primary }}>
                <AlertTriangle className="w-3 h-3" />
                Unsaved changes
              </span>
            )}
          </div>
        </div>
        <textarea
          className="w-full p-4 bg-transparent font-mono text-sm resize-none focus:outline-none min-h-[200px]"
          style={{ color: brand.foreground }}
          aria-label="SOUL.md editor"
          value={soulContent}
          onChange={handleChange(setSoulContent)}
          placeholder="# Bot Soul\n\nDescribe this bot's personality, tone, and behavior..."
        />
      </div>

      {/* IDENTITY.md Editor */}
      <div className={cardElevated}>
        <div className="p-4 border-b border-[#E0E0E0]/50">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" style={{ color: brand.tealMedium }} />
            <span className="font-medium text-sm" style={{ color: brand.foreground }}>
              IDENTITY.md
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${brand.tealMedium}20`, color: brand.tealMedium }}>
              Identity
            </span>
          </div>
        </div>
        <textarea
          className="w-full p-4 bg-transparent font-mono text-sm resize-none focus:outline-none min-h-[150px]"
          style={{ color: brand.foreground }}
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
          className="rounded-xl border-[#E0E0E0]"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Discard
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          className="rounded-xl text-white"
          style={{ background: `linear-gradient(135deg, ${brand.primary}, ${brand.secondary})` }}
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

function MemoryManager({ botId }: { botId: string }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newMemory, setNewMemory] = useState({ name: "", type: "reference", description: "", content: "" });

  const memoriesQuery = useQuery({
    queryKey: ["workshop", botId, "memories"],
    queryFn: () => workshopApi.listMemories(botId),
  });

  const injectMutation = useMutation({
    mutationFn: () => workshopApi.injectMemory(botId, newMemory),
    onSuccess: () => {
      setShowAdd(false);
      setNewMemory({ name: "", type: "reference", description: "", content: "" });
      queryClient.invalidateQueries({ queryKey: ["workshop", botId, "memories"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (path: string) => workshopApi.removeMemory(botId, path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workshop", botId, "memories"] });
    },
  });

  const memories = memoriesQuery.data?.memories ?? [];
  const typeColors: Record<string, string> = {
    user: brand.primary,
    feedback: brand.tealMedium,
    project: brand.secondary,
    reference: "#264653",
    unknown: "#999",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm" style={{ color: `${brand.foreground}99` }}>
          {memories.length} memory {memories.length === 1 ? "entry" : "entries"}
        </div>
        <Button
          size="sm"
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-xl text-white"
          style={{ background: brand.primary }}
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
              className="px-3 py-2 rounded-xl border border-[#E0E0E0] bg-white/50 text-sm"
              placeholder="Memory name"
              aria-label="Memory name"
              value={newMemory.name}
              onChange={(e) => setNewMemory((p) => ({ ...p, name: e.target.value }))}
            />
            <select
              className="px-3 py-2 rounded-xl border border-[#E0E0E0] bg-white/50 text-sm"
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
            className="w-full px-3 py-2 rounded-xl border border-[#E0E0E0] bg-white/50 text-sm"
            placeholder="Short description"
            aria-label="Memory description"
            value={newMemory.description}
            onChange={(e) => setNewMemory((p) => ({ ...p, description: e.target.value }))}
          />
          <textarea
            className="w-full px-3 py-2 rounded-xl border border-[#E0E0E0] bg-white/50 text-sm font-mono min-h-[100px] resize-none"
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
              className="rounded-xl text-white"
              style={{ background: brand.primary }}
            >
              {injectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Inject"}
            </Button>
          </div>
        </div>
      )}

      {/* Memory List */}
      {memoriesQuery.isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: brand.primary }} />
        </div>
      ) : memoriesQuery.error ? (
        <div className={cn(card, "p-6 text-center")}>
          <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-400" />
          <p className="text-sm font-medium" style={{ color: brand.foreground }}>Failed to load memories</p>
          <p className="text-xs mt-1" style={{ color: `${brand.foreground}60` }}>
            {memoriesQuery.error instanceof Error ? memoriesQuery.error.message : "Unknown error"}
          </p>
        </div>
      ) : memories.length === 0 ? (
        <div className={cn(card, "p-8 text-center")}>
          <Brain className="w-8 h-8 mx-auto mb-2" style={{ color: `${brand.foreground}40` }} />
          <p className="text-sm" style={{ color: `${brand.foreground}60` }}>No memories found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => (
            <div key={m.path} className={cn(card, "p-4 flex items-start gap-3 group")}>
              <div
                className="w-2 h-2 rounded-full mt-2 shrink-0"
                style={{ background: typeColors[m.type] ?? "#999" }}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm" style={{ color: brand.foreground }}>
                    {m.name}
                  </span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      background: `${typeColors[m.type] ?? "#999"}15`,
                      color: typeColors[m.type] ?? "#999",
                    }}
                  >
                    {m.type}
                  </span>
                </div>
                <p className="text-xs mt-0.5 truncate" style={{ color: `${brand.foreground}80` }}>
                  {m.description || m.path}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeMutation.mutate(m.path.replace("memory/", ""))}
                aria-label={`Remove ${m.name} from memory`}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Skill Manager ─────────────────────────────────────────────────────────

function SkillManager({ botId }: { botId: string }) {
  const skillsQuery = useQuery({
    queryKey: ["workshop", botId, "skills"],
    queryFn: () => workshopApi.listSkills(botId),
  });

  const skills = skillsQuery.data?.skills ?? [];
  const statusColors: Record<string, string> = {
    active: brand.tealMedium,
    inactive: "#999",
    error: "#E63946",
  };

  return (
    <div className="space-y-4">
      <div className="text-sm" style={{ color: `${brand.foreground}99` }}>
        {skills.length} skill{skills.length === 1 ? "" : "s"} installed
      </div>

      {skillsQuery.isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: brand.primary }} />
        </div>
      ) : skillsQuery.error ? (
        <div className={cn(card, "p-6 text-center")}>
          <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-400" />
          <p className="text-sm font-medium" style={{ color: brand.foreground }}>Failed to load skills</p>
          <p className="text-xs mt-1" style={{ color: `${brand.foreground}60` }}>
            {skillsQuery.error instanceof Error ? skillsQuery.error.message : "Unknown error"}
          </p>
        </div>
      ) : skills.length === 0 ? (
        <div className={cn(card, "p-8 text-center")}>
          <Wrench className="w-8 h-8 mx-auto mb-2" style={{ color: `${brand.foreground}40` }} />
          <p className="text-sm" style={{ color: `${brand.foreground}60` }}>No skills detected</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {skills.map((s) => (
            <div key={s.name} className={cn(card, "p-4 hover:-translate-y-0.5")}>
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: statusColors[s.status] ?? "#999" }}
                  aria-label={`Status: ${s.status}`}
                />
                <span className="font-medium text-sm truncate" style={{ color: brand.foreground }}>
                  {s.name}
                </span>
              </div>
              {s.version && (
                <p className="text-xs mt-1" style={{ color: `${brand.foreground}60` }}>
                  v{s.version}
                </p>
              )}
              {s.description && (
                <p className="text-xs mt-1 truncate" style={{ color: `${brand.foreground}80` }}>
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

function VersionHistory({ botId }: { botId: string }) {
  const queryClient = useQueryClient();

  const versionsQuery = useQuery({
    queryKey: ["workshop", botId, "versions"],
    queryFn: () => workshopApi.getVersions(botId),
  });

  const rollbackMutation = useMutation({
    mutationFn: (versionId: string) => workshopApi.rollback(botId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workshop", botId] });
    },
  });

  const versions = versionsQuery.data?.versions ?? [];

  return (
    <div className="space-y-4">
      <div className="text-sm" style={{ color: `${brand.foreground}99` }}>
        {versions.length} personality version{versions.length === 1 ? "" : "s"}
      </div>

      {versionsQuery.isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: brand.primary }} />
        </div>
      ) : versionsQuery.error ? (
        <div className={cn(card, "p-6 text-center")}>
          <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-400" />
          <p className="text-sm font-medium" style={{ color: brand.foreground }}>Failed to load version history</p>
          <p className="text-xs mt-1" style={{ color: `${brand.foreground}60` }}>
            {versionsQuery.error instanceof Error ? versionsQuery.error.message : "Unknown error"}
          </p>
        </div>
      ) : versions.length === 0 ? (
        <div className={cn(card, "p-8 text-center")}>
          <History className="w-8 h-8 mx-auto mb-2" style={{ color: `${brand.foreground}40` }} />
          <p className="text-sm" style={{ color: `${brand.foreground}60` }}>
            No versions yet. Edit SOUL.md or IDENTITY.md to create the first snapshot.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {versions.map((v, i) => (
            <div key={v.id} className={cn(card, "p-4 flex items-center gap-4")}>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                style={{
                  background: i === 0 ? brand.primary : `${brand.primary}20`,
                  color: i === 0 ? "white" : brand.primary,
                }}
              >
                v{v.version}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: brand.foreground }}>
                  {v.changeDescription}
                </p>
                <p className="text-xs" style={{ color: `${brand.foreground}60` }}>
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

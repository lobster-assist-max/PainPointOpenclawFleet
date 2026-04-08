/**
 * FleetBotWorkshopService — Read/write bot workspace files via OpenClaw Gateway.
 *
 * Turns Fleet from a read-only dashboard into a read-write workshop.
 * Uses OpenClaw Gateway RPC methods:
 * - agents.files.list — list workspace files
 * - agents.files.get  — read a file
 * - agents.files.set  — write a file
 * - skills.status     — list installed skills
 * - skills.install    — install a skill
 *
 * Also manages personality versioning (stored in Supabase) and
 * personality A/B tests (integrated with Canary Lab).
 */

import { randomUUID } from "node:crypto";
import { getFleetMonitorService } from "./fleet-monitor.js";
import { logger } from "../middleware/logger.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface BotWorkshopFile {
  path: string;
  content: string;
  lastModified: string | null;
  sizeBytes: number;
  type: "soul" | "identity" | "memory" | "heartbeat" | "skill" | "state" | "tools" | "other";
}

export interface PersonalityVersion {
  id: string;
  botId: string;
  version: number;
  soulMd: string;
  identityMd: string;
  createdAt: string;
  createdBy: string;
  changeDescription: string;
}

export interface PersonalityDiff {
  fromVersion: number;
  toVersion: number;
  hunks: Array<{
    file: "SOUL.md" | "IDENTITY.md";
    added: string[];
    removed: string[];
  }>;
}

export interface MemoryEntry {
  path: string;
  name: string;
  type: "user" | "feedback" | "project" | "reference" | "unknown";
  description: string;
  content: string;
}

export interface SkillEntry {
  name: string;
  status: "active" | "inactive" | "error";
  version?: string;
  description?: string;
}

// ─── File type detection ───────────────────────────────────────────────────

function classifyFile(path: string): BotWorkshopFile["type"] {
  const lower = path.toLowerCase();
  if (lower === "soul.md" || lower.endsWith("/soul.md")) return "soul";
  if (lower === "identity.md" || lower.endsWith("/identity.md")) return "identity";
  if (lower === "state.md" || lower.endsWith("/state.md")) return "state";
  if (lower === "heartbeat.md" || lower.endsWith("/heartbeat.md")) return "heartbeat";
  if (lower === "tools.md" || lower.endsWith("/tools.md")) return "tools";
  if (lower.startsWith("memory/") || lower.includes("/memory/")) return "memory";
  if (lower.startsWith("skills/") || lower.includes("/skills/")) return "skill";
  return "other";
}

// ─── Memory frontmatter parser ─────────────────────────────────────────────

function parseMemoryFrontmatter(content: string): {
  name: string;
  description: string;
  type: MemoryEntry["type"];
} {
  const defaults = { name: "", description: "", type: "unknown" as const };
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return defaults;

  const block = match[1];
  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const descMatch = block.match(/^description:\s*(.+)$/m);
  const typeMatch = block.match(/^type:\s*(.+)$/m);

  const type = typeMatch?.[1]?.trim() ?? "unknown";
  const validTypes = ["user", "feedback", "project", "reference"];

  return {
    name: nameMatch?.[1]?.trim() ?? "",
    description: descMatch?.[1]?.trim() ?? "",
    type: validTypes.includes(type) ? (type as MemoryEntry["type"]) : "unknown",
  };
}

// ─── Simple line diff ──────────────────────────────────────────────────────

function diffLines(
  oldText: string,
  newText: string,
): { added: string[]; removed: string[] } {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  return {
    removed: oldLines.filter((l) => !newSet.has(l)),
    added: newLines.filter((l) => !oldSet.has(l)),
  };
}

// ─── Service ───────────────────────────────────────────────────────────────

export class FleetBotWorkshopService {
  // In-memory personality version store (in production this would be Supabase)
  private versions = new Map<string, PersonalityVersion[]>();

  // ─── File Operations (via Gateway RPC) ─────────────────────────────────

  /** List all workspace files for a bot. */
  async listFiles(botId: string, prefix?: string): Promise<BotWorkshopFile[]> {
    const monitor = getFleetMonitorService();

    try {
      const result = await monitor.rpcForBot<{
        files?: Array<{ path: string; size?: number; modifiedAt?: string }>;
      }>(botId, "agents.files.list", { prefix: prefix ?? "" });

      const files = result?.files ?? [];
      return files.map((f) => ({
        path: f.path,
        content: "", // content not loaded in list
        lastModified: f.modifiedAt ?? null,
        sizeBytes: f.size ?? 0,
        type: classifyFile(f.path),
      }));
    } catch (err) {
      logger.warn({ err, botId }, "[Workshop] agents.files.list failed, using fallback");
      // Fallback: try to read known files individually
      return this.listKnownFiles(botId);
    }
  }

  /** Read a specific file from bot workspace. */
  async getFile(botId: string, path: string): Promise<BotWorkshopFile> {
    const monitor = getFleetMonitorService();

    const result = await monitor.rpcForBot<{
      content?: string;
      size?: number;
      modifiedAt?: string;
    }>(botId, "agents.files.get", { path });

    const content = result?.content ?? "";
    return {
      path,
      content,
      lastModified: result?.modifiedAt ?? null,
      sizeBytes: result?.size ?? Buffer.byteLength(content, "utf8"),
      type: classifyFile(path),
    };
  }

  /** Write a file to bot workspace (pushes to Gateway). */
  async setFile(botId: string, path: string, content: string): Promise<void> {
    const monitor = getFleetMonitorService();
    await monitor.rpcForBot(botId, "agents.files.set", { path, content });
    logger.info({ botId, path }, "[Workshop] File pushed to bot");
  }

  /** Delete a file from bot workspace. */
  async deleteFile(botId: string, path: string): Promise<void> {
    const monitor = getFleetMonitorService();
    // agents.files.set with empty content effectively removes it
    await monitor.rpcForBot(botId, "agents.files.set", { path, content: "" });
    logger.info({ botId, path }, "[Workshop] File deleted from bot");
  }

  // ─── Personality Versioning ────────────────────────────────────────────

  /** Create a snapshot of the current SOUL.md + IDENTITY.md. */
  async createPersonalityVersion(
    botId: string,
    createdBy: string,
    changeDescription: string,
  ): Promise<PersonalityVersion> {
    const [soulFile, identityFile] = await Promise.all([
      this.getFile(botId, "SOUL.md").catch(() => ({ content: "" })),
      this.getFile(botId, "IDENTITY.md").catch(() => ({ content: "" })),
    ]);

    const botVersions = this.versions.get(botId) ?? [];
    const nextVersion = botVersions.length + 1;

    const version: PersonalityVersion = {
      id: randomUUID(),
      botId,
      version: nextVersion,
      soulMd: soulFile.content,
      identityMd: identityFile.content,
      createdAt: new Date().toISOString(),
      createdBy,
      changeDescription,
    };

    botVersions.push(version);
    this.versions.set(botId, botVersions);

    logger.info({ botId, version: nextVersion }, "[Workshop] Personality version created");
    return version;
  }

  /** Get version history for a bot. */
  getVersionHistory(botId: string): PersonalityVersion[] {
    return (this.versions.get(botId) ?? []).slice().reverse();
  }

  /** Diff two personality versions. */
  diffVersions(botId: string, fromVersion: number, toVersion: number): PersonalityDiff | null {
    const botVersions = this.versions.get(botId) ?? [];
    const from = botVersions.find((v) => v.version === fromVersion);
    const to = botVersions.find((v) => v.version === toVersion);

    if (!from || !to) return null;

    return {
      fromVersion,
      toVersion,
      hunks: [
        { file: "SOUL.md", ...diffLines(from.soulMd, to.soulMd) },
        { file: "IDENTITY.md", ...diffLines(from.identityMd, to.identityMd) },
      ],
    };
  }

  /** Rollback SOUL.md + IDENTITY.md to a previous version. */
  async rollbackToVersion(botId: string, versionId: string): Promise<void> {
    const botVersions = this.versions.get(botId) ?? [];
    const target = botVersions.find((v) => v.id === versionId);
    if (!target) throw new Error(`Version not found: ${versionId}`);

    // Push old content back to bot
    await Promise.all([
      this.setFile(botId, "SOUL.md", target.soulMd),
      this.setFile(botId, "IDENTITY.md", target.identityMd),
    ]);

    // Create a new version recording the rollback
    await this.createPersonalityVersion(
      botId,
      "system",
      `Rollback to version ${target.version}`,
    );

    logger.info({ botId, rolledBackTo: target.version }, "[Workshop] Personality rolled back");
  }

  // ─── Memory Management ────────────────────────────────────────────────

  /** List all memory entries for a bot. */
  async listMemories(botId: string): Promise<MemoryEntry[]> {
    const files = await this.listFiles(botId, "memory/");
    const memoryFiles = files.filter((f) => f.type === "memory" && f.path.endsWith(".md"));

    const entries: MemoryEntry[] = [];
    for (const f of memoryFiles) {
      try {
        const full = await this.getFile(botId, f.path);
        const meta = parseMemoryFrontmatter(full.content);
        entries.push({
          path: f.path,
          name: meta.name || f.path.split("/").pop()?.replace(".md", "") || f.path,
          type: meta.type,
          description: meta.description,
          content: full.content,
        });
      } catch (err) {
        console.warn("[fleet] Failed to read memory file", f.path, "for bot", botId, err instanceof Error ? err.message : String(err));
      }
    }

    return entries;
  }

  /** Inject a new memory into a bot. */
  async injectMemory(
    botId: string,
    entry: { name: string; type: MemoryEntry["type"]; description: string; content: string },
  ): Promise<void> {
    const filename = entry.name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_");

    const fullContent = `---
name: ${entry.name}
description: ${entry.description}
type: ${entry.type}
---

${entry.content}`;

    await this.setFile(botId, `memory/${filename}.md`, fullContent);
    logger.info({ botId, memoryName: entry.name }, "[Workshop] Memory injected");
  }

  /** Remove a memory from a bot. */
  async removeMemory(botId: string, path: string): Promise<void> {
    await this.deleteFile(botId, path);
  }

  // ─── Skill Management ─────────────────────────────────────────────────

  /** List installed skills for a bot. */
  async listSkills(botId: string): Promise<SkillEntry[]> {
    const monitor = getFleetMonitorService();

    try {
      const result = await monitor.rpcForBot<{
        skills?: Array<{
          name: string;
          status?: string;
          version?: string;
          description?: string;
        }>;
      }>(botId, "skills.status");

      return (result?.skills ?? []).map((s) => ({
        name: s.name,
        status: (s.status as SkillEntry["status"]) ?? "active",
        version: s.version,
        description: s.description,
      }));
    } catch (err) {
      logger.warn({ err, botId }, "[Workshop] skills.status failed");
      return [];
    }
  }

  /** Install a skill on a bot. */
  async installSkill(botId: string, skillName: string): Promise<void> {
    const monitor = getFleetMonitorService();
    await monitor.rpcForBot(botId, "skills.install", { name: skillName });
    logger.info({ botId, skillName }, "[Workshop] Skill installed");
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  /** Fallback file listing for gateways that don't support agents.files.list. */
  private async listKnownFiles(botId: string): Promise<BotWorkshopFile[]> {
    const knownPaths = [
      "SOUL.md",
      "IDENTITY.md",
      "STATE.md",
      "HEARTBEAT.md",
      "TOOLS.md",
      "MEMORY.md",
    ];

    const files: BotWorkshopFile[] = [];
    for (const path of knownPaths) {
      try {
        const file = await this.getFile(botId, path);
        if (file.content) files.push(file);
      } catch (err) {
        console.warn("[fleet] Failed to read workshop file", path, "for bot", botId, err instanceof Error ? err.message : String(err));
      }
    }
    return files;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let instance: FleetBotWorkshopService | null = null;

export function getFleetBotWorkshopService(): FleetBotWorkshopService {
  if (!instance) {
    instance = new FleetBotWorkshopService();
  }
  return instance;
}

export function disposeFleetBotWorkshopService(): void {
  instance = null;
}

/**
 * Fleet Bot Workshop API client.
 */
import { api } from "./client";

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

// ─── API Functions ─────────────────────────────────────────────────────────

export const workshopApi = {
  // Files
  listFiles: (botId: string, prefix?: string) =>
    api.get<{ ok: boolean; files: BotWorkshopFile[] }>(
      `/fleet-workshop/${botId}/files${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`,
    ),

  getFile: (botId: string, path: string) =>
    api.get<{ ok: boolean; file: BotWorkshopFile }>(
      `/fleet-workshop/${botId}/files/${path}`,
    ),

  setFile: (botId: string, path: string, content: string) =>
    api.put<{ ok: boolean }>(
      `/fleet-workshop/${botId}/files/${path}`,
      { content },
    ),

  deleteFile: (botId: string, path: string) =>
    api.delete<{ ok: boolean }>(
      `/fleet-workshop/${botId}/files/${path}`,
    ),

  // Personality versioning
  getVersions: (botId: string) =>
    api.get<{ ok: boolean; versions: PersonalityVersion[] }>(
      `/fleet-workshop/${botId}/personality/versions`,
    ),

  createVersion: (botId: string, description: string, createdBy?: string) =>
    api.post<{ ok: boolean; version: PersonalityVersion }>(
      `/fleet-workshop/${botId}/personality/versions`,
      { description, createdBy },
    ),

  diffVersions: (botId: string, from: number, to: number) =>
    api.get<{ ok: boolean; diff: PersonalityDiff }>(
      `/fleet-workshop/${botId}/personality/diff?from=${from}&to=${to}`,
    ),

  rollback: (botId: string, versionId: string) =>
    api.post<{ ok: boolean }>(
      `/fleet-workshop/${botId}/personality/rollback`,
      { versionId },
    ),

  // Memories
  listMemories: (botId: string) =>
    api.get<{ ok: boolean; memories: MemoryEntry[] }>(
      `/fleet-workshop/${botId}/memories`,
    ),

  injectMemory: (botId: string, entry: { name: string; type: string; description: string; content: string }) =>
    api.post<{ ok: boolean }>(
      `/fleet-workshop/${botId}/memories`,
      entry,
    ),

  removeMemory: (botId: string, path: string) =>
    api.delete<{ ok: boolean }>(
      `/fleet-workshop/${botId}/memories/${path}`,
    ),

  // Skills
  listSkills: (botId: string) =>
    api.get<{ ok: boolean; skills: SkillEntry[] }>(
      `/fleet-workshop/${botId}/skills`,
    ),

  installSkill: (botId: string, skillName: string) =>
    api.post<{ ok: boolean }>(
      `/fleet-workshop/${botId}/skills/install`,
      { skillName },
    ),
};

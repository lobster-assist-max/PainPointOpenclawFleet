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

/**
 * Append ?companyId= (or &companyId=) so the server's cross-tenant ownership
 * guard can reject reads/writes to a bot owned by another company. Every
 * workshop route is /:botId/* and proxies personality/memory/skill mutations
 * through the gateway — without the tenant on the request the guard can't run.
 */
function withCompany(url: string, companyId?: string): string {
  if (!companyId) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}companyId=${encodeURIComponent(companyId)}`;
}

export const workshopApi = {
  // Files
  listFiles: (botId: string, prefix?: string, companyId?: string) =>
    api.get<{ ok: boolean; files: BotWorkshopFile[] }>(
      withCompany(
        `/fleet-workshop/${botId}/files${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`,
        companyId,
      ),
    ),

  getFile: (botId: string, path: string, companyId?: string) =>
    api.get<{ ok: boolean; file: BotWorkshopFile }>(
      withCompany(`/fleet-workshop/${botId}/files/${path}`, companyId),
    ),

  setFile: (botId: string, path: string, content: string, companyId?: string) =>
    api.put<{ ok: boolean }>(
      withCompany(`/fleet-workshop/${botId}/files/${path}`, companyId),
      { content },
    ),

  deleteFile: (botId: string, path: string, companyId?: string) =>
    api.delete<{ ok: boolean }>(
      withCompany(`/fleet-workshop/${botId}/files/${path}`, companyId),
    ),

  // Personality versioning
  getVersions: (botId: string, companyId?: string) =>
    api.get<{ ok: boolean; versions: PersonalityVersion[] }>(
      withCompany(`/fleet-workshop/${botId}/personality/versions`, companyId),
    ),

  createVersion: (botId: string, description: string, createdBy?: string, companyId?: string) =>
    api.post<{ ok: boolean; version: PersonalityVersion }>(
      withCompany(`/fleet-workshop/${botId}/personality/versions`, companyId),
      { description, createdBy },
    ),

  diffVersions: (botId: string, from: number, to: number, companyId?: string) =>
    api.get<{ ok: boolean; diff: PersonalityDiff }>(
      withCompany(`/fleet-workshop/${botId}/personality/diff?from=${from}&to=${to}`, companyId),
    ),

  rollback: (botId: string, versionId: string, companyId?: string) =>
    api.post<{ ok: boolean }>(
      withCompany(`/fleet-workshop/${botId}/personality/rollback`, companyId),
      { versionId },
    ),

  // Memories
  listMemories: (botId: string, companyId?: string) =>
    api.get<{ ok: boolean; memories: MemoryEntry[] }>(
      withCompany(`/fleet-workshop/${botId}/memories`, companyId),
    ),

  injectMemory: (
    botId: string,
    entry: { name: string; type: string; description: string; content: string },
    companyId?: string,
  ) =>
    api.post<{ ok: boolean }>(
      withCompany(`/fleet-workshop/${botId}/memories`, companyId),
      entry,
    ),

  removeMemory: (botId: string, path: string, companyId?: string) =>
    api.delete<{ ok: boolean }>(
      withCompany(`/fleet-workshop/${botId}/memories/${path}`, companyId),
    ),

  // Skills
  listSkills: (botId: string, companyId?: string) =>
    api.get<{ ok: boolean; skills: SkillEntry[] }>(
      withCompany(`/fleet-workshop/${botId}/skills`, companyId),
    ),

  installSkill: (botId: string, skillName: string, companyId?: string) =>
    api.post<{ ok: boolean }>(
      withCompany(`/fleet-workshop/${botId}/skills/install`, companyId),
      { skillName },
    ),
};

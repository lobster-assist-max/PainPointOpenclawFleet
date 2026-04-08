import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_INSTANCE_ID = "default";
const INSTANCE_ID_RE = /^[a-zA-Z0-9_-]+$/;

export function resolveFleetHomeDir(): string {
  const envHome = (process.env.FLEET_HOME ?? process.env.PAPERCLIP_HOME)?.trim();
  if (envHome) return path.resolve(expandHomePrefix(envHome));
  const fleetDir = path.resolve(os.homedir(), ".fleet");
  const legacyDir = path.resolve(os.homedir(), ".paperclip");
  if (fs.existsSync(fleetDir)) return fleetDir;
  if (fs.existsSync(legacyDir)) return legacyDir;
  return fleetDir;
}

export function resolveFleetInstanceId(override?: string): string {
  const raw = override?.trim() || (process.env.FLEET_INSTANCE_ID ?? process.env.PAPERCLIP_INSTANCE_ID)?.trim() || DEFAULT_INSTANCE_ID;
  if (!INSTANCE_ID_RE.test(raw)) {
    throw new Error(
      `Invalid instance id '${raw}'. Allowed characters: letters, numbers, '_' and '-'.`,
    );
  }
  return raw;
}

export function resolveFleetInstanceRoot(instanceId?: string): string {
  const id = resolveFleetInstanceId(instanceId);
  return path.resolve(resolveFleetHomeDir(), "instances", id);
}

export function resolveDefaultConfigPath(instanceId?: string): string {
  return path.resolve(resolveFleetInstanceRoot(instanceId), "config.json");
}

export function resolveDefaultContextPath(): string {
  return path.resolve(resolveFleetHomeDir(), "context.json");
}

export function resolveDefaultEmbeddedPostgresDir(instanceId?: string): string {
  return path.resolve(resolveFleetInstanceRoot(instanceId), "db");
}

export function resolveDefaultLogsDir(instanceId?: string): string {
  return path.resolve(resolveFleetInstanceRoot(instanceId), "logs");
}

export function resolveDefaultSecretsKeyFilePath(instanceId?: string): string {
  return path.resolve(resolveFleetInstanceRoot(instanceId), "secrets", "master.key");
}

export function resolveDefaultStorageDir(instanceId?: string): string {
  return path.resolve(resolveFleetInstanceRoot(instanceId), "data", "storage");
}

export function resolveDefaultBackupDir(instanceId?: string): string {
  return path.resolve(resolveFleetInstanceRoot(instanceId), "data", "backups");
}

export function expandHomePrefix(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.resolve(os.homedir(), value.slice(2));
  return value;
}

export function describeLocalInstancePaths(instanceId?: string) {
  const resolvedInstanceId = resolveFleetInstanceId(instanceId);
  const instanceRoot = resolveFleetInstanceRoot(resolvedInstanceId);
  return {
    homeDir: resolveFleetHomeDir(),
    instanceId: resolvedInstanceId,
    instanceRoot,
    configPath: resolveDefaultConfigPath(resolvedInstanceId),
    embeddedPostgresDataDir: resolveDefaultEmbeddedPostgresDir(resolvedInstanceId),
    backupDir: resolveDefaultBackupDir(resolvedInstanceId),
    logDir: resolveDefaultLogsDir(resolvedInstanceId),
    secretsKeyFilePath: resolveDefaultSecretsKeyFilePath(resolvedInstanceId),
    storageDir: resolveDefaultStorageDir(resolvedInstanceId),
  };
}

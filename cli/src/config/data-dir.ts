import path from "node:path";
import {
  expandHomePrefix,
  resolveDefaultConfigPath,
  resolveDefaultContextPath,
  resolveFleetInstanceId,
} from "./home.js";

export interface DataDirOptionLike {
  dataDir?: string;
  config?: string;
  context?: string;
  instance?: string;
}

export interface DataDirCommandSupport {
  hasConfigOption?: boolean;
  hasContextOption?: boolean;
}

export function applyDataDirOverride(
  options: DataDirOptionLike,
  support: DataDirCommandSupport = {},
): string | null {
  const rawDataDir = options.dataDir?.trim();
  if (!rawDataDir) return null;

  const resolvedDataDir = path.resolve(expandHomePrefix(rawDataDir));
  process.env.FLEET_HOME = resolvedDataDir;
  process.env.PAPERCLIP_HOME = resolvedDataDir; // backward compat

  if (support.hasConfigOption) {
    const hasConfigOverride = Boolean(options.config?.trim()) || Boolean(process.env.FLEET_CONFIG?.trim()) || Boolean(process.env.PAPERCLIP_CONFIG?.trim());
    if (!hasConfigOverride) {
      const instanceId = resolveFleetInstanceId(options.instance);
      process.env.FLEET_INSTANCE_ID = instanceId;
      process.env.PAPERCLIP_INSTANCE_ID = instanceId; // backward compat
      const configPath = resolveDefaultConfigPath(instanceId);
      process.env.FLEET_CONFIG = configPath;
      process.env.PAPERCLIP_CONFIG = configPath; // backward compat
    }
  }

  if (support.hasContextOption) {
    const hasContextOverride = Boolean(options.context?.trim()) || Boolean(process.env.FLEET_CONTEXT?.trim()) || Boolean(process.env.PAPERCLIP_CONTEXT?.trim());
    if (!hasContextOverride) {
      const contextPath = resolveDefaultContextPath();
      process.env.FLEET_CONTEXT = contextPath;
      process.env.PAPERCLIP_CONTEXT = contextPath; // backward compat
    }
  }

  return resolvedDataDir;
}

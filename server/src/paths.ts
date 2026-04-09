import fs from "node:fs";
import path from "node:path";
import { resolveDefaultConfigPath } from "./home-paths.js";

const CONFIG_BASENAME = "config.json";
const ENV_FILENAME = ".env";

function findConfigFileFromAncestors(startDir: string): string | null {
  const absoluteStartDir = path.resolve(startDir);
  let currentDir = absoluteStartDir;

  while (true) {
    const candidate = path.resolve(currentDir, ".fleet", CONFIG_BASENAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    // Legacy fallback
    const legacyCandidate = path.resolve(currentDir, ".paperclip", CONFIG_BASENAME);
    if (fs.existsSync(legacyCandidate)) {
      return legacyCandidate;
    }

    const nextDir = path.resolve(currentDir, "..");
    if (nextDir === currentDir) break;
    currentDir = nextDir;
  }

  return null;
}

export function resolveFleetConfigPath(overridePath?: string): string {
  if (overridePath) return path.resolve(overridePath);
  if (process.env.FLEET_CONFIG) return path.resolve(process.env.FLEET_CONFIG);
  if (process.env.PAPERCLIP_CONFIG) return path.resolve(process.env.PAPERCLIP_CONFIG);
  return findConfigFileFromAncestors(process.cwd()) ?? resolveDefaultConfigPath();
}

export function resolveFleetEnvPath(overrideConfigPath?: string): string {
  return path.resolve(path.dirname(resolveFleetConfigPath(overrideConfigPath)), ENV_FILENAME);
}

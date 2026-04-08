import fs from "node:fs";
import { fleetConfigSchema, type FleetConfig } from "@paperclipai/shared";
import { resolvePaperclipConfigPath } from "./paths.js";

export function readConfigFile(): FleetConfig | null {
  const configPath = resolvePaperclipConfigPath();

  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return fleetConfigSchema.parse(raw);
  } catch {
    /* config file missing, unreadable, or invalid */
    return null;
  }
}

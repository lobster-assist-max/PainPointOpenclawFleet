/**
 * FleetTagService — Bot tagging system for fleet organization.
 *
 * Supports manual tags and smart auto-detection based on bot state
 * (channels, model, schedule patterns).
 */

import { randomUUID } from "node:crypto";
import type { FleetMonitorService } from "./fleet-monitor.js";

export interface BotTag {
  id: string;
  botId: string;
  tag: string;
  label: string;
  color: string | null;
  category: "environment" | "channel" | "team" | "model" | "custom";
  autoAssigned: boolean;
  createdAt: Date;
}

interface AddTagParams {
  tag: string;
  label: string;
  color?: string | null;
  category?: BotTag["category"];
}

// Well-known auto-tags with colors
const CHANNEL_COLORS: Record<string, string> = {
  line: "#00B900",
  telegram: "#26A5E4",
  discord: "#5865F2",
  whatsapp: "#25D366",
  slack: "#4A154B",
  web: "#D4A373",
};

const MODEL_COLORS: Record<string, string> = {
  opus: "#9940ED",
  sonnet: "#376492",
  haiku: "#2A9D8F",
};

export class FleetTagService {
  // In-memory store (in production, this would be backed by the DB)
  private tags = new Map<string, BotTag[]>(); // botId → tags

  /** Get all tags across all bots. */
  getAllTags(): BotTag[] {
    const all: BotTag[] = [];
    for (const botTags of this.tags.values()) {
      all.push(...botTags);
    }
    return all;
  }

  /** Get tags for a specific bot. */
  getTagsForBot(botId: string): BotTag[] {
    return this.tags.get(botId) ?? [];
  }

  /** Add a tag to a bot. */
  addTag(botId: string, params: AddTagParams): BotTag {
    const existing = this.tags.get(botId) ?? [];

    // Prevent duplicates
    const dup = existing.find((t) => t.tag === params.tag);
    if (dup) return dup;

    const tag: BotTag = {
      id: randomUUID(),
      botId,
      tag: params.tag,
      label: params.label,
      color: params.color ?? null,
      category: params.category ?? "custom",
      autoAssigned: false,
      createdAt: new Date(),
    };

    existing.push(tag);
    this.tags.set(botId, existing);
    return tag;
  }

  /** Remove a tag from a bot. */
  removeTag(botId: string, tag: string): void {
    const existing = this.tags.get(botId) ?? [];
    this.tags.set(
      botId,
      existing.filter((t) => t.tag !== tag),
    );
  }

  /** Auto-detect tags based on bot state. Returns number of tags added. */
  async autoDetect(monitor: FleetMonitorService): Promise<number> {
    let added = 0;
    const bots = monitor.getAllBots();

    for (const bot of bots) {
      if (bot.state !== "monitoring") continue;

      // Detect channels
      try {
        const channels = await monitor.getBotChannels(bot.botId);
        if (channels) {
          for (const ch of channels) {
            const chType = String(ch["type"] ?? "").toLowerCase();
            if (chType && CHANNEL_COLORS[chType]) {
              const tag = `channel:${chType}`;
              const existing = this.getTagsForBot(bot.botId);
              if (!existing.find((t) => t.tag === tag)) {
                this.addAutoTag(bot.botId, {
                  tag,
                  label: chType.charAt(0).toUpperCase() + chType.slice(1),
                  color: CHANNEL_COLORS[chType],
                  category: "channel",
                });
                added++;
              }
            }
          }
        }
      } catch {
        // Skip channel detection if RPC fails
      }

      // Detect model from config
      try {
        const config = await monitor.rpcForBot<Record<string, unknown>>(bot.botId, "config.get");
        const model = String(config?.model ?? "").toLowerCase();
        for (const [key, color] of Object.entries(MODEL_COLORS)) {
          if (model.includes(key)) {
            const tag = `model:${key}`;
            const existing = this.getTagsForBot(bot.botId);
            if (!existing.find((t) => t.tag === tag)) {
              this.addAutoTag(bot.botId, {
                tag,
                label: key.charAt(0).toUpperCase() + key.slice(1),
                color,
                category: "model",
              });
              added++;
            }
            break;
          }
        }
      } catch {
        // Skip model detection if config.get fails
      }
    }

    return added;
  }

  private addAutoTag(botId: string, params: AddTagParams & { category: BotTag["category"] }): void {
    const existing = this.tags.get(botId) ?? [];
    const tag: BotTag = {
      id: randomUUID(),
      botId,
      tag: params.tag,
      label: params.label,
      color: params.color ?? null,
      category: params.category,
      autoAssigned: true,
      createdAt: new Date(),
    };
    existing.push(tag);
    this.tags.set(botId, existing);
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _instance: FleetTagService | null = null;

export function getFleetTagService(): FleetTagService {
  if (!_instance) {
    _instance = new FleetTagService();
  }
  return _instance;
}

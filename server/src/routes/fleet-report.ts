/**
 * Fleet Report API — Generate fleet reports in CSV or JSON format.
 *
 * GET /api/fleet-report?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv|json
 */

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { fleetSnapshots, fleetAlertHistory, agents as agentsTable } from "@paperclipai/db";
import { and, eq, gte, lt, inArray, sql } from "drizzle-orm";
import { getFleetMonitorService } from "../services/fleet-monitor.js";
import { estimateTokenCostUsd } from "../services/fleet-pricing.js";
import { inferChannelFromSessionKey } from "../services/fleet-channels.js";

interface PerBotReportRow {
  botId: string;
  name: string;
  emoji: string;
  avgHealthScore: number;
  uptimePercent: number;
  totalCostUsd: number;
  sessionsCount: number;
  topChannel: string;
  topChannelCost: number;
  alertsFired: number;
}

// Report costs are rounded to whole cents; the underlying token→USD math is the
// shared estimator (see fleet-pricing.ts).
function estimateCost(input: number, output: number, cached: number): number {
  return Math.round(estimateTokenCostUsd(input, output, cached) * 100) / 100;
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function fleetReportRoutes(db?: Db) {
  const router = Router();

  /**
   * GET /api/fleet-report
   * Generate a fleet report for a date range.
   * Query: from, to (YYYY-MM-DD), format (csv|json)
   */
  router.get("/", async (req, res) => {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const format = (req.query.format as string) ?? "json";
    const companyId =
      typeof req.query.companyId === "string" && req.query.companyId.length > 0
        ? req.query.companyId
        : undefined;

    if (!from || !to) {
      res.status(400).json({ ok: false, error: "Missing required query params: from, to" });
      return;
    }

    // Validate dates: malformed values otherwise silently produce a garbage report
    // (and flow into the CSV Content-Disposition filename). The per-bot usage
    // endpoint already validates these — keep the aggregate report consistent.
    if (Number.isNaN(new Date(from).getTime()) || Number.isNaN(new Date(to).getTime())) {
      res.status(400).json({ ok: false, error: "from and to must be valid dates" });
      return;
    }

    const service = getFleetMonitorService();
    // Scope the report to the requested company. Without this the report
    // aggregated EVERY connected bot across all tenants into one document.
    const bots = companyId ? service.getBotsByCompany(companyId) : service.getAllBots();

    // Pull real health + alert data from the DB (captured by the fleet
    // snapshot loop). Keyed by agents.id, which is bot.agentId on the monitor
    // service. Best-effort: a DB failure degrades to the previous 0 defaults
    // rather than failing the whole report.
    const fromDate = new Date(from);
    const toEnd = new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000); // inclusive of the last day
    const healthByBot = new Map<string, number>();
    const alertsByBot = new Map<string, number>();
    // Real uptime %: fraction of snapshots in the window where the bot was
    // `monitoring`. Keyed by agents.id (= bot.agentId). Replaces the old
    // fabricated `bot.state === "monitoring" ? 99 : 0` snapshot-at-report-time.
    const uptimeByBot = new Map<string, number>();
    if (db && companyId) {
      try {
        // Health + uptime aggregate in one grouped scan over fleet_snapshots.
        const snapshotRows = await db
          .select({
            botId: fleetSnapshots.botId,
            avgHealth: sql<number | null>`avg(${fleetSnapshots.healthScore})`,
            uptimePct: sql<
              number | null
            >`avg(case when ${fleetSnapshots.connectionState} = 'monitoring' then 1.0 else 0.0 end) * 100`,
          })
          .from(fleetSnapshots)
          .where(
            and(
              eq(fleetSnapshots.companyId, companyId),
              gte(fleetSnapshots.capturedAt, fromDate),
              lt(fleetSnapshots.capturedAt, toEnd),
            ),
          )
          .groupBy(fleetSnapshots.botId);
        for (const r of snapshotRows) {
          if (r.avgHealth != null) healthByBot.set(r.botId, Math.round(Number(r.avgHealth)));
          if (r.uptimePct != null) {
            uptimeByBot.set(r.botId, Math.round(Number(r.uptimePct) * 10) / 10);
          }
        }

        const alertRows = await db
          .select({
            botId: fleetAlertHistory.botId,
            count: sql<number>`count(*)`,
          })
          .from(fleetAlertHistory)
          .where(
            and(
              eq(fleetAlertHistory.companyId, companyId),
              gte(fleetAlertHistory.firedAt, fromDate),
              lt(fleetAlertHistory.firedAt, toEnd),
            ),
          )
          .groupBy(fleetAlertHistory.botId);
        for (const r of alertRows) {
          if (r.botId) alertsByBot.set(r.botId, Number(r.count));
        }
      } catch (err) {
        console.warn("[fleet] report: failed to aggregate snapshot/alert data:", err);
      }
    }

    // Resolve display name/emoji from the agents DB (metadata.emoji, with `icon`
    // as an emoji fallback only when it isn't a lucide-name key). This matches
    // the /fleet-monitor/status enrichment (#193) and, unlike the per-bot
    // gateway identity RPC, works for bots that are disconnected at report time
    // (the report covers a historical window) — one batched query, no N RPCs.
    const identityByBot = new Map<string, { name: string; emoji: string }>();
    if (db) {
      try {
        const agentIds = [...new Set(bots.map((b) => b.agentId).filter(Boolean))];
        if (agentIds.length > 0) {
          const agentRows = await db
            .select({
              id: agentsTable.id,
              name: agentsTable.name,
              icon: agentsTable.icon,
              metadata: agentsTable.metadata,
            })
            .from(agentsTable)
            .where(inArray(agentsTable.id, agentIds));
          const byAgentId = new Map<string, { name: string; emoji: string }>();
          for (const a of agentRows) {
            const meta = (a.metadata as Record<string, unknown> | null) ?? {};
            const metaEmoji = typeof meta.emoji === "string" ? meta.emoji : "";
            const iconIsEmoji =
              a.icon != null && a.icon !== "" && !/^[a-z0-9-]+$/i.test(a.icon);
            byAgentId.set(a.id, {
              name: a.name,
              emoji: metaEmoji || (iconIsEmoji ? a.icon! : ""),
            });
          }
          for (const bot of bots) {
            const info = byAgentId.get(bot.agentId);
            if (info) identityByBot.set(bot.botId, info);
          }
        }
      } catch (err) {
        console.warn("[fleet] report: failed to resolve bot identities:", err);
      }
    }

    const rows: PerBotReportRow[] = [];
    let totalCost = 0;
    let totalSessions = 0;

    for (const bot of bots) {
      try {
        const usage = await service.getBotUsage(bot.botId, { from, to });
        const sessionsCount = usage?.sessions?.length ?? 0;
        const cost = usage?.total
          ? estimateCost(
              usage.total.inputTokens,
              usage.total.outputTokens,
              usage.total.cachedInputTokens ?? 0,
            )
          : 0;

        // Find top channel
        const channelMap = new Map<string, number>();
        if (usage?.sessions) {
          for (const session of usage.sessions) {
            const channel = inferChannelFromSessionKey(session.sessionKey);

            const sessionCost = estimateCost(
              session.inputTokens,
              session.outputTokens,
              session.cachedInputTokens ?? 0,
            );
            channelMap.set(channel, (channelMap.get(channel) ?? 0) + sessionCost);
          }
        }

        let topChannel = "—";
        let topChannelCost = 0;
        for (const [ch, chCost] of channelMap) {
          if (chCost > topChannelCost) {
            topChannel = ch;
            topChannelCost = chCost;
          }
        }

        // Prefer the DB-resolved identity (correct for disconnected bots + real
        // emoji from metadata). Fall back to the live gateway identity RPC only
        // when the DB had nothing (unscoped/no-db callers), then to botId/🤖.
        let name = identityByBot.get(bot.botId)?.name;
        let emoji = identityByBot.get(bot.botId)?.emoji;
        if (!name || !emoji) {
          const identity = await service.getBotIdentity(bot.botId);
          if (!name && identity && typeof identity.name === "string") name = identity.name;
          if (!emoji && identity && typeof identity.emoji === "string") emoji = identity.emoji;
        }

        rows.push({
          botId: bot.botId,
          name: name || bot.botId,
          emoji: emoji || "🤖",
          avgHealthScore: healthByBot.get(bot.agentId) ?? 0,
          uptimePercent: uptimeByBot.get(bot.agentId) ?? (bot.state === "monitoring" ? 100 : 0),
          totalCostUsd: cost,
          sessionsCount,
          topChannel,
          topChannelCost: Math.round(topChannelCost * 100) / 100,
          alertsFired: alertsByBot.get(bot.agentId) ?? 0,
        });

        totalCost += cost;
        totalSessions += sessionsCount;
      } catch (err) {
        console.warn(`[fleet] report: failed to collect data for bot ${bot.botId}:`, err);
      }
    }

    if (format === "csv") {
      const header = "Bot Name,Emoji,Avg Health,Uptime %,Total Cost,Sessions,Top Channel,Top Channel Cost,Alerts Fired";
      const csvRows = rows.map((r) =>
        [
          escapeCSV(r.name),
          r.emoji,
          r.avgHealthScore,
          r.uptimePercent,
          `$${r.totalCostUsd.toFixed(2)}`,
          r.sessionsCount,
          r.topChannel,
          `$${r.topChannelCost.toFixed(2)}`,
          r.alertsFired,
        ].join(","),
      );

      const csv = [header, ...csvRows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="fleet-report-${from}-to-${to}.csv"`,
      );
      res.send(csv);
      return;
    }

    // JSON format
    res.json({
      ok: true,
      report: {
        period: { from, to },
        generatedAt: new Date().toISOString(),
        fleet: {
          totalBots: bots.length,
          totalCostUsd: Math.round(totalCost * 100) / 100,
          totalSessions,
        },
        perBot: rows,
      },
    });
  });

  return router;
}

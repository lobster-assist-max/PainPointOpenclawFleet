/**
 * Fleet Report API — Generate fleet reports in CSV or JSON format.
 *
 * GET /api/fleet-report?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv|json
 */

import { Router } from "express";
import { getFleetMonitorService } from "../services/fleet-monitor.js";

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

// Claude Sonnet 4 pricing
const INPUT_COST_PER_M = 3;
const OUTPUT_COST_PER_M = 15;
const CACHED_COST_PER_M = 0.3;

function estimateCost(input: number, output: number, cached: number): number {
  const inputCost = ((input - cached) / 1_000_000) * INPUT_COST_PER_M;
  const cachedCost = (cached / 1_000_000) * CACHED_COST_PER_M;
  const outputCost = (output / 1_000_000) * OUTPUT_COST_PER_M;
  return Math.round((inputCost + cachedCost + outputCost) * 100) / 100;
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function fleetReportRoutes() {
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

    if (!from || !to) {
      res.status(400).json({ ok: false, error: "Missing required query params: from, to" });
      return;
    }

    const service = getFleetMonitorService();
    const bots = service.getAllBots();

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
            const key = session.sessionKey ?? "";
            let channel = "other";
            const match = key.match(/:channel:(\w+)/);
            if (match) channel = match[1];
            else if (key.includes(":peer:")) channel = "direct";

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

        // Identity placeholder
        const identity = await service.getBotIdentity(bot.botId);
        const name = (identity && typeof identity.name === "string") ? identity.name : bot.botId;
        const emoji = (identity && typeof identity.emoji === "string") ? identity.emoji : "🤖";

        rows.push({
          botId: bot.botId,
          name,
          emoji,
          avgHealthScore: 0, // Would come from fleet_snapshots aggregation
          uptimePercent: bot.state === "monitoring" ? 99 : 0,
          totalCostUsd: cost,
          sessionsCount,
          topChannel,
          topChannelCost: Math.round(topChannelCost * 100) / 100,
          alertsFired: 0, // Would come from alert history
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

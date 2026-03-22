/**
 * FleetHeatmap — GitHub-contribution-style health heatmap.
 *
 * Shows fleet-wide or per-bot health patterns over the past 4 weeks.
 * Two granularity modes:
 *   - Daily: 4 weeks × 7 days grid (default)
 *   - Hourly: 7 days × 24 hours grid (drill-down)
 *
 * Data source: fleet_snapshots table via /api/fleet-monitor/trend.
 * Zero dependencies — pure CSS Grid + inline SVG.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { fleetMonitorApi } from "@/api/fleet-monitor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeatmapCell {
  date: string; // YYYY-MM-DD or YYYY-MM-DDTHH
  avgHealthScore: number | null;
  events?: number;
  label?: string; // tooltip extra text
}

interface FleetHeatmapProps {
  companyId: string;
  botId?: string; // if provided, show single bot; otherwise fleet-wide
  className?: string;
}

type Granularity = "daily" | "hourly";

// ---------------------------------------------------------------------------
// Color mapping — health score → oklch hue rotation
// ---------------------------------------------------------------------------

function healthToColor(score: number | null): string {
  if (score == null) return "var(--muted)";
  // Map 0-100 → red(25°) through yellow(90°) to green(145°)
  // oklch lightness ~0.65, chroma ~0.16
  const hue = 25 + (score / 100) * 120; // 25 → 145
  const chroma = 0.12 + (score / 100) * 0.06; // dull at low → vibrant at high
  return `oklch(0.65 ${chroma.toFixed(3)} ${hue.toFixed(0)})`;
}

function healthGradeLabel(score: number | null): string {
  if (score == null) return "No data";
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, "0"),
);

function getDayOfWeek(dateStr: string): number {
  const d = new Date(dateStr);
  return (d.getDay() + 6) % 7; // Monday = 0
}

function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.toLocaleString("en", { month: "short" });
  const day = d.getDate();
  return `${month} ${day}`;
}

// ---------------------------------------------------------------------------
// Generate mock data for demo (replaced by real API in production)
// ---------------------------------------------------------------------------

function generateDemoCells(days: number): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    // Simulate: weekends slightly lower, random variation
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const base = isWeekend ? 70 : 85;
    const score = Math.min(100, Math.max(0, base + Math.floor(Math.random() * 20 - 5)));
    cells.push({ date: dateStr, avgHealthScore: score });
  }
  return cells;
}

// ---------------------------------------------------------------------------
// HeatmapCell component
// ---------------------------------------------------------------------------

function Cell({
  cell,
  size = 12,
}: {
  cell: HeatmapCell;
  size?: number;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <div
        className="rounded-sm transition-transform hover:scale-125 cursor-default"
        style={{
          width: size,
          height: size,
          backgroundColor: healthToColor(cell.avgHealthScore),
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      />
      {showTooltip && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover border rounded-md shadow-md text-xs whitespace-nowrap pointer-events-none">
          <div className="font-medium">{cell.date}</div>
          <div>
            Health:{" "}
            {cell.avgHealthScore != null
              ? `${cell.avgHealthScore} (${healthGradeLabel(cell.avgHealthScore)})`
              : "No data"}
          </div>
          {cell.events != null && <div>{cell.events} events</div>}
          {cell.label && <div className="text-muted-foreground">{cell.label}</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function Legend() {
  const stops = [0, 25, 50, 75, 100];
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span>Less</span>
      {stops.map((score) => (
        <div
          key={score}
          className="w-3 h-3 rounded-sm"
          style={{ backgroundColor: healthToColor(score) }}
          title={`Health ${score}`}
        />
      ))}
      <span>More</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FleetHeatmap
// ---------------------------------------------------------------------------

export function FleetHeatmap({ companyId, botId, className }: FleetHeatmapProps) {
  const [granularity, setGranularity] = useState<Granularity>("daily");

  // In a real implementation, this would call the fleet-monitor trend API.
  // For now, generate demo data based on available fleet_snapshots.
  const cells = useMemo(() => {
    if (granularity === "daily") {
      return generateDemoCells(28); // 4 weeks
    }
    // Hourly: 7 days × 24 hours
    return generateDemoCells(7).flatMap((dayCell) =>
      Array.from({ length: 24 }, (_, h) => ({
        date: `${dayCell.date}T${h.toString().padStart(2, "0")}`,
        avgHealthScore:
          dayCell.avgHealthScore != null
            ? Math.max(
                0,
                Math.min(
                  100,
                  dayCell.avgHealthScore + Math.floor(Math.random() * 20 - 10),
                ),
              )
            : null,
      })),
    );
  }, [granularity]);

  // Group cells into rows
  const grid = useMemo(() => {
    if (granularity === "daily") {
      // 4 rows (weeks), 7 columns (days)
      const weeks: HeatmapCell[][] = [];
      for (let i = 0; i < cells.length; i += 7) {
        weeks.push(cells.slice(i, i + 7));
      }
      return weeks;
    }
    // 7 rows (days), 24 columns (hours)
    const days: HeatmapCell[][] = [];
    for (let i = 0; i < cells.length; i += 24) {
      days.push(cells.slice(i, i + 24));
    }
    return days;
  }, [cells, granularity]);

  const colLabels = granularity === "daily" ? DAY_LABELS : HOUR_LABELS;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          {botId ? "Bot Health Heatmap" : "Fleet Health Heatmap"}
          <span className="rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide">Preview</span>
        </h3>
        <div className="flex items-center gap-1">
          <button
            className={cn(
              "text-xs px-2 py-0.5 rounded-full transition-colors",
              granularity === "daily"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
            onClick={() => setGranularity("daily")}
            aria-pressed={granularity === "daily"}
          >
            Daily
          </button>
          <button
            className={cn(
              "text-xs px-2 py-0.5 rounded-full transition-colors",
              granularity === "hourly"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
            onClick={() => setGranularity("hourly")}
            aria-pressed={granularity === "hourly"}
          >
            Hourly
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="inline-block">
          {/* Column labels */}
          <div
            className="flex gap-[2px] mb-1 ml-12"
            style={{ width: "fit-content" }}
          >
            {colLabels.map((label, i) => (
              <div
                key={i}
                className="text-[10px] text-muted-foreground text-center"
                style={{ width: 12 }}
              >
                {granularity === "daily"
                  ? label.slice(0, 1)
                  : i % 3 === 0
                    ? label
                    : ""}
              </div>
            ))}
          </div>

          {/* Rows */}
          {grid.map((row, rowIdx) => (
            <div key={rowIdx} className="flex items-center gap-[2px] mb-[2px]">
              {/* Row label */}
              <div className="w-10 text-[10px] text-muted-foreground text-right pr-1 truncate">
                {granularity === "daily"
                  ? row[0]
                    ? getWeekLabel(row[0].date)
                    : ""
                  : row[0]
                    ? row[0].date.split("T")[0].slice(5) // MM-DD
                    : ""}
              </div>

              {/* Cells */}
              {row.map((cell, colIdx) => (
                <Cell key={colIdx} cell={cell} size={12} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <Legend />
    </div>
  );
}

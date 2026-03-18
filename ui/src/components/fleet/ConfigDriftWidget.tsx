/**
 * ConfigDriftWidget — displays config differences across fleet bots.
 *
 * Calls GET /api/fleet-monitor/config-drift and shows a summary of
 * which config keys differ between bots, grouped by severity.
 */

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useCompany } from "@/context/CompanyContext";
import { api } from "@/api/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfigDriftEntry {
  configPath: string;
  severity: "critical" | "warning" | "info";
  values: Record<string, string[]>; // value → botIds
  recommendation: string;
}

interface ConfigDriftReport {
  generatedAt: string;
  botsCompared: number;
  drifts: ConfigDriftEntry[];
  consistentCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityIcon(s: ConfigDriftEntry["severity"]): string {
  switch (s) {
    case "critical":
      return "🔴";
    case "warning":
      return "🟡";
    case "info":
      return "🔵";
  }
}

function severityBorderColor(s: ConfigDriftEntry["severity"]): string {
  switch (s) {
    case "critical":
      return "border-l-destructive";
    case "warning":
      return "border-l-yellow-500";
    case "info":
      return "border-l-blue-500";
  }
}

// Bot emoji lookup — in a real app this comes from fleet status
function botLabel(botId: string): string {
  return botId; // Placeholder — real implementation maps botId → name/emoji
}

// ---------------------------------------------------------------------------
// DriftEntry component
// ---------------------------------------------------------------------------

function DriftEntry({ drift }: { drift: ConfigDriftEntry }) {
  const valueEntries = Object.entries(drift.values);

  return (
    <div
      className={cn(
        "border-l-4 rounded-r-md bg-card px-3 py-2 space-y-1.5",
        severityBorderColor(drift.severity),
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-sm">{severityIcon(drift.severity)}</span>
        <span className="text-sm font-mono font-medium">{drift.configPath}</span>
      </div>

      {/* Value groups */}
      <div className="space-y-1 pl-6">
        {valueEntries.map(([value, botIds]) => (
          <div key={value} className="flex items-center gap-2 text-xs">
            <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">
              {value.length > 40 ? value.slice(0, 40) + "…" : value}
            </code>
            <span className="text-muted-foreground">
              {botIds.map(botLabel).join(", ")}
            </span>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      {drift.recommendation && (
        <div className="flex items-start gap-1.5 pl-6 text-xs text-muted-foreground">
          <span>💡</span>
          <span>{drift.recommendation}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfigDriftWidget
// ---------------------------------------------------------------------------

export function ConfigDriftWidget({ className }: { className?: string }) {
  const { selectedCompanyId } = useCompany();

  const { data: report, isLoading } = useQuery({
    queryKey: ["fleet", "config-drift", selectedCompanyId],
    queryFn: () =>
      api.get<ConfigDriftReport>(
        `/fleet-monitor/config-drift?companyId=${encodeURIComponent(selectedCompanyId!)}`,
      ),
    enabled: !!selectedCompanyId,
    staleTime: 60_000, // config doesn't change often
    refetchInterval: 300_000, // re-check every 5 minutes
  });

  // Sort drifts by severity
  const sortedDrifts = (report?.drifts ?? []).sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  const criticalCount = sortedDrifts.filter((d) => d.severity === "critical").length;
  const warningCount = sortedDrifts.filter((d) => d.severity === "warning").length;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Config Drift</h3>
        {report && (
          <span className="text-xs text-muted-foreground">
            {report.botsCompared} bots compared
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-sm text-muted-foreground py-4 text-center">
          Analyzing configs…
        </div>
      )}

      {/* No drift */}
      {report && sortedDrifts.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card border rounded-lg px-3 py-4">
          <span className="text-green-500">✅</span>
          <span>
            All {report.consistentCount} config keys are consistent across{" "}
            {report.botsCompared} bots.
          </span>
        </div>
      )}

      {/* Summary banner */}
      {sortedDrifts.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-1.5">
          <span>
            {sortedDrifts.length} drift{sortedDrifts.length !== 1 && "s"} detected
          </span>
          {criticalCount > 0 && (
            <span className="text-destructive font-medium">
              {criticalCount} critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-yellow-600 dark:text-yellow-400 font-medium">
              {warningCount} warning
            </span>
          )}
          {report && (
            <span className="ml-auto">
              ✅ {report.consistentCount} consistent
            </span>
          )}
        </div>
      )}

      {/* Drift entries */}
      <div className="space-y-2">
        {sortedDrifts.map((drift) => (
          <DriftEntry key={drift.configPath} drift={drift} />
        ))}
      </div>
    </div>
  );
}

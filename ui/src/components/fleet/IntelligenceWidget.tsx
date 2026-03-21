/**
 * IntelligenceWidget — Fleet Intelligence recommendations panel.
 *
 * Displays actionable recommendations from the Fleet Intelligence Engine,
 * showing cross-signal correlations and suggested actions.
 */

import {
  Lightbulb,
  AlertCircle,
  Info,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fleetMonitorApi } from "@/api/fleet-monitor";
import type { Recommendation } from "@/api/fleet-monitor";

const SEVERITY_STYLES = {
  urgent: {
    border: "border-red-500/30",
    bg: "bg-red-50/50 dark:bg-red-950/20",
    icon: "text-red-600 dark:text-red-400",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  },
  actionable: {
    border: "border-amber-500/30",
    bg: "bg-amber-50/50 dark:bg-amber-950/20",
    icon: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  },
  info: {
    border: "border-blue-500/30",
    bg: "bg-blue-50/30 dark:bg-blue-950/10",
    icon: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  },
};

const SEVERITY_ICONS = {
  urgent: AlertCircle,
  actionable: Lightbulb,
  info: Info,
};

function RecommendationCard({
  rec,
  onDismiss,
}: {
  rec: Recommendation;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const styles = SEVERITY_STYLES[rec.severity];
  const Icon = SEVERITY_ICONS[rec.severity];

  return (
    <div className={cn("rounded-lg border p-3 space-y-2", styles.border, styles.bg)}>
      {/* Header */}
      <div className="flex items-start gap-2">
        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", styles.icon)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("text-[10px] font-medium uppercase rounded-full px-1.5 py-0.5", styles.badge)}>
              {rec.severity}
            </span>
            <span className="text-xs text-muted-foreground">{rec.type.replace(/_/g, " ")}</span>
          </div>
          <p className="text-sm font-medium mt-1">{rec.title}</p>
        </div>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground pl-6">{rec.description}</p>

      {/* Suggested action */}
      <div className="pl-6 flex items-start gap-1.5 text-xs">
        <span className="text-primary font-medium shrink-0">Suggestion:</span>
        <span>{rec.suggestedAction}</span>
      </div>

      {/* Impact estimate */}
      {rec.estimatedImpact && (
        <div className="pl-6 text-xs text-green-700 dark:text-green-300 font-medium">
          {rec.estimatedImpact}
        </div>
      )}

      {/* Expandable: Data sources */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 pl-6 text-[11px] text-muted-foreground hover:text-foreground"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {rec.dataPoints.length} data source{rec.dataPoints.length !== 1 ? "s" : ""}
      </button>

      {expanded && (
        <div className="pl-6 space-y-1">
          {rec.dataPoints.map((dp, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground font-mono">{dp.source}</span>
              <span>→</span>
              <span>{dp.observation}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface IntelligenceWidgetProps {
  companyId: string;
  className?: string;
}

export function IntelligenceWidget({ companyId, className }: IntelligenceWidgetProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["fleet", "recommendations", companyId],
    queryFn: () => fleetMonitorApi.recommendations(),
    refetchInterval: 300_000, // 5 minutes
    staleTime: 120_000,
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => fleetMonitorApi.dismissRecommendation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fleet", "recommendations", companyId] });
    },
  });

  const recommendations: Recommendation[] = (data?.recommendations ?? []).filter(
    (r: Recommendation) => !r.dismissed,
  );

  if (isLoading || recommendations.length === 0) {
    return null;
  }

  const urgentCount = recommendations.filter((r) => r.severity === "urgent").length;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Fleet Intelligence</h3>
        <span className="text-xs text-muted-foreground">
          {recommendations.length} recommendation{recommendations.length !== 1 ? "s" : ""}
          {urgentCount > 0 && (
            <span className="text-red-500 ml-1">· {urgentCount} urgent</span>
          )}
        </span>
      </div>

      <div className="space-y-2">
        {recommendations.map((rec) => (
          <RecommendationCard
            key={rec.id}
            rec={rec}
            onDismiss={() => dismissMutation.mutate(rec.id)}
          />
        ))}
      </div>
    </div>
  );
}

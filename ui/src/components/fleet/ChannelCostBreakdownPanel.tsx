/**
 * ChannelCostBreakdownPanel — self-fetching container for ChannelCostBreakdown.
 *
 * Wires the presentational <ChannelCostBreakdown /> to the live, tenant-scoped
 * `/fleet-monitor/cost-by-channel` backend (via useChannelCosts). The server
 * aggregates every connected bot's session usage into per-channel token counts;
 * this panel handles loading / error / empty states and passes the result down.
 *
 * Unlike the Intelligence-page widgets this has NO MOCK fallback — the Costs
 * page is a real operator surface, so an empty/offline fleet shows an honest
 * empty/error state rather than demo data.
 */

import { AlertTriangle, Loader2 } from "lucide-react";
import { ChannelCostBreakdown } from "./ChannelCostBreakdown";
import { useChannelCosts } from "@/hooks/useFleetMonitor";

interface ChannelCostBreakdownPanelProps {
  from?: string;
  to?: string;
  className?: string;
}

export function ChannelCostBreakdownPanel({ from, to, className }: ChannelCostBreakdownPanelProps) {
  const { data: channels, isLoading, isError } = useChannelCosts(from, to);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading channel costs…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Failed to load channel costs. The fleet monitor may be offline.
      </div>
    );
  }

  return <ChannelCostBreakdown channels={channels} className={className} />;
}

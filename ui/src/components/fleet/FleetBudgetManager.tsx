/**
 * FleetBudgetManager — create & delete fleet cost budgets.
 *
 * The fleet cost-budget backend (POST/GET/DELETE /fleet-monitor/budgets,
 * tenant-scoped) was fully built but had NO create/delete UI, so the whole
 * budget feature (BudgetWidget, per-bot budget bars, breach alerts, projected
 * month-end forecasting) was unreachable — a budget could never be created.
 * This surfaces that backend: a create form + a list of existing budgets.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Plus, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFleetStatus, useFleetBudgets, useCreateBudget, useDeleteBudget } from "@/hooks/useFleetMonitor";
import { useCompany } from "@/context/CompanyContext";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";
import { agentToBotStatus } from "@/lib/agent-to-bot-status";
import { channelDisplayName } from "@/lib/bot-display-helpers";
import type { CostBudget, BotStatus } from "@/api/fleet-monitor";

type Scope = CostBudget["scope"];

const CHANNELS = ["line", "telegram", "discord", "whatsapp", "slack", "web", "direct", "group", "cron"];

function scopeLabel(b: CostBudget, botNames: Map<string, string>): string {
  if (b.scope === "fleet") return "Fleet-wide";
  if (b.scope === "bot") return botNames.get(b.scopeId) ?? b.scopeId;
  return channelDisplayName(b.scopeId);
}

interface Props {
  className?: string;
}

export function FleetBudgetManager({ className }: Props) {
  const { selectedCompanyId } = useCompany();
  const { data: fleet } = useFleetStatus();
  // DB agents fallback — mirror the Dashboard's live+DB merge so an operator can
  // budget for a bot that isn't live right now (dormant / gateway briefly
  // unreachable), and so a budget scoped to an offline bot resolves its name
  // instead of showing a raw UUID.
  const { data: dbAgents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const bots = useMemo<BotStatus[]>(() => {
    const live = fleet?.bots ?? [];
    const liveIds = new Set(live.map((b) => b.botId));
    const dbOnly = (dbAgents ?? [])
      .filter((a) => a.adapterType === "openclaw_gateway" && !liveIds.has(a.id))
      .map(agentToBotStatus);
    return [...live, ...dbOnly];
  }, [fleet, dbAgents]);
  const botNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bots) m.set(b.botId, `${b.emoji ? b.emoji + " " : ""}${b.name}`);
    return m;
  }, [bots]);

  const { data: budgets, isLoading, isError } = useFleetBudgets();
  const createMutation = useCreateBudget();
  const deleteMutation = useDeleteBudget();

  // Create-form state
  const [scope, setScope] = useState<Scope>("fleet");
  const [botScopeId, setBotScopeId] = useState("");
  const [channelScopeId, setChannelScopeId] = useState("line");
  const [limit, setLimit] = useState("");
  const [action, setAction] = useState<CostBudget["action"]>("alert_only");
  const [formError, setFormError] = useState<string | null>(null);

  const resolvedScopeId =
    scope === "fleet" ? "fleet" : scope === "bot" ? botScopeId : channelScopeId;

  const handleCreate = () => {
    setFormError(null);
    const limitNum = Number(limit);
    if (!Number.isFinite(limitNum) || limitNum <= 0) {
      setFormError("Enter a monthly limit greater than 0.");
      return;
    }
    if (scope === "bot" && !botScopeId) {
      setFormError("Pick a bot for this budget.");
      return;
    }
    createMutation.mutate(
      { scope, scopeId: resolvedScopeId, monthlyLimitUsd: limitNum, action },
      {
        onSuccess: () => {
          setLimit("");
          setBotScopeId("");
        },
        onError: (err) =>
          setFormError(err instanceof Error ? err.message : "Failed to create budget"),
      },
    );
  };

  const list: CostBudget[] = budgets ?? [];

  return (
    <div className={cn("rounded-xl border p-4 space-y-4", className)}>
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Budget Manager</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          Set monthly spend limits &amp; alert thresholds
        </span>
      </div>

      {/* Create form */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="budget-scope" className="text-[11px] text-muted-foreground">Scope</label>
          <select
            id="budget-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="fleet">Fleet-wide</option>
            <option value="bot">Per bot</option>
            <option value="channel">Per channel</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="budget-target" className="text-[11px] text-muted-foreground">Target</label>
          {scope === "fleet" ? (
            <div className="h-9 flex items-center rounded-md border border-input bg-muted/40 px-2 text-sm text-muted-foreground">
              Entire fleet
            </div>
          ) : scope === "bot" ? (
            <select
              id="budget-target"
              value={botScopeId}
              onChange={(e) => setBotScopeId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            >
              <option value="">Select a bot…</option>
              {bots.map((b) => (
                <option key={b.botId} value={b.botId}>
                  {b.emoji ? `${b.emoji} ` : ""}{b.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              id="budget-target"
              value={channelScopeId}
              onChange={(e) => setChannelScopeId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>{channelDisplayName(c)}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="budget-limit" className="text-[11px] text-muted-foreground">Monthly limit ($)</label>
          <input
            id="budget-limit"
            type="number"
            min="0"
            step="1"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="e.g. 100"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="budget-action" className="text-[11px] text-muted-foreground">On breach</label>
          <select
            id="budget-action"
            value={action}
            onChange={(e) => setAction(e.target.value as CostBudget["action"])}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="alert_only">Alert only</option>
            <option value="alert_and_throttle">Alert &amp; throttle</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleCreate}
          disabled={createMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add Budget
        </button>
        {formError && (
          <span className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {formError}
          </span>
        )}
      </div>

      {/* Existing budgets */}
      <div className="border-t border-border pt-3">
        {isError ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Failed to load budgets.</span>
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading budgets…</span>
          </div>
        ) : list.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No budgets configured yet. Add one above to enable spend tracking, breach alerts, and month-end forecasting.
          </p>
        ) : (
          <div className="space-y-1.5">
            {list.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase shrink-0",
                    b.scope === "fleet"
                      ? "bg-primary/10 text-primary"
                      : b.scope === "bot"
                        ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                  )}
                >
                  {b.scope}
                </span>
                <span className="truncate font-medium">{scopeLabel(b, botNames)}</span>
                <span className="text-muted-foreground text-xs ml-auto shrink-0">
                  ${b.monthlyLimitUsd.toFixed(0)}/mo
                  {b.action === "alert_and_throttle" ? " · throttle" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(b.id)}
                  disabled={deleteMutation.isPending}
                  aria-label={`Delete ${scopeLabel(b, botNames)} budget`}
                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

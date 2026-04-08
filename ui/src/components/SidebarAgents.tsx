import { useMemo, useState } from "react";
import { NavLink, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { cn, agentRouteRef, agentUrl } from "../lib/utils";
import { AgentIcon } from "./AgentIconPicker";
import { BudgetSidebarMarker } from "./BudgetSidebarMarker";
import { useFleetStatus } from "../hooks/useFleetMonitor";
import { type BotStatus } from "../api/fleet-monitor";
import { botConnectionDot, botConnectionDotDefault } from "../lib/status-colors";
import { getRoleById } from "../lib/fleet-roles";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Agent } from "@paperclipai/shared";

/** BFS sort: roots first (no reportsTo), then their direct reports, etc. */
function sortByHierarchy(agents: Agent[]): Agent[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const childrenOf = new Map<string | null, Agent[]>();
  for (const a of agents) {
    const parent = a.reportsTo && byId.has(a.reportsTo) ? a.reportsTo : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(a);
    childrenOf.set(parent, list);
  }
  const sorted: Agent[] = [];
  const queue = childrenOf.get(null) ?? [];
  while (queue.length > 0) {
    const agent = queue.shift()!;
    sorted.push(agent);
    const children = childrenOf.get(agent.id);
    if (children) queue.push(...children);
  }
  return sorted;
}

export function SidebarAgents() {
  const [open, setOpen] = useState(true);
  const { selectedCompanyId } = useCompany();
  const { openNewAgent } = useDialog();
  const { isMobile, setSidebarOpen } = useSidebar();
  const location = useLocation();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  const { data: fleetStatus } = useFleetStatus();

  const liveCountByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of liveRuns ?? []) {
      counts.set(run.agentId, (counts.get(run.agentId) ?? 0) + 1);
    }
    return counts;
  }, [liveRuns]);

  /** Map agentId -> BotStatus for fleet overlay data */
  const botByAgentId = useMemo(() => {
    const map = new Map<string, BotStatus>();
    for (const bot of fleetStatus?.bots ?? []) {
      if (bot.agentId) map.set(bot.agentId, bot);
    }
    return map;
  }, [fleetStatus]);

  const visibleAgents = useMemo(() => {
    const filtered = (agents ?? []).filter(
      (a: Agent) => a.status !== "terminated"
    );
    return sortByHierarchy(filtered);
  }, [agents]);

  const agentMatch = location.pathname.match(/^\/(?:[^/]+\/)?agents\/([^/]+)/);
  const activeAgentId = agentMatch?.[1] ?? null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="group">
        <div className="flex items-center px-3 py-1.5">
          <CollapsibleTrigger className="flex items-center gap-1 flex-1 min-w-0">
            <ChevronRight
              className={cn(
                "h-3 w-3 text-muted-foreground/60 transition-transform opacity-0 group-hover:opacity-100",
                open && "rotate-90"
              )}
            />
            <span className="text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">
              Bots
            </span>
          </CollapsibleTrigger>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openNewAgent();
            }}
            className="flex items-center justify-center h-4 w-4 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label="New bot"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 mt-0.5">
          {visibleAgents.map((agent: Agent) => {
            const runCount = liveCountByAgent.get(agent.id) ?? 0;
            const bot = botByAgentId.get(agent.id);
            const role = bot?.roleId ? getRoleById(bot.roleId) : null;
            const connectionDotClass = bot
              ? (botConnectionDot[bot.connectionState] ?? botConnectionDotDefault)
              : botConnectionDotDefault;
            return (
              <NavLink
                key={agent.id}
                to={agentUrl(agent)}
                onClick={() => {
                  if (isMobile) setSidebarOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium transition-colors",
                  activeAgentId === agentRouteRef(agent)
                    ? "bg-accent text-foreground"
                    : "text-foreground/80 hover:bg-accent/50 hover:text-foreground"
                )}
              >
                {/* Connection status dot */}
                <span
                  className={cn(
                    "shrink-0 w-2 h-2 rounded-full ring-1 ring-background",
                    connectionDotClass,
                  )}
                  title={bot ? `${bot.connectionState === "monitoring" ? "Online" : bot.connectionState}` : "No fleet data"}
                />
                {/* Bot emoji or agent icon */}
                {bot?.emoji ? (
                  <span className="shrink-0 text-sm leading-none">{bot.emoji}</span>
                ) : (
                  <AgentIcon icon={agent.icon} className="shrink-0 h-3.5 w-3.5 text-muted-foreground" />
                )}
                {/* Name + role */}
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="truncate leading-tight">{agent.name}</span>
                  {role && (
                    <span className="text-[10px] text-muted-foreground/70 truncate leading-tight">
                      {role.title}
                    </span>
                  )}
                </span>
                {/* Budget / live indicators */}
                {(agent.pauseReason === "budget" || runCount > 0) && (
                  <span className="ml-auto flex items-center gap-1.5 shrink-0">
                    {agent.pauseReason === "budget" ? (
                      <BudgetSidebarMarker title="Bot paused by budget" />
                    ) : null}
                    {runCount > 0 ? (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                      </span>
                    ) : null}
                    {runCount > 0 ? (
                      <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                        {runCount}
                      </span>
                    ) : null}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

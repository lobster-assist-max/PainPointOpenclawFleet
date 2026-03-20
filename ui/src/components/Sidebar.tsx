import {
  Inbox,
  CircleDot,
  Target,
  DollarSign,
  History,
  Search,
  SquarePen,
  Network,
  Settings,
  Radio,
  Terminal,
  ScrollText,
  Bell,
  Link2,
} from "lucide-react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarProjects } from "./SidebarProjects";
import { SidebarAgents } from "./SidebarAgents";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { useFleetStatus, useFleetAlerts } from "../hooks/useFleetMonitor";
import { agentToBotStatus } from "../lib/agent-to-bot-status";
import { Link } from "@/lib/router";
import { botConnectionDot, botConnectionDotDefault } from "../lib/status-colors";
import { Button } from "@/components/ui/button";
import { PluginSlotOutlet } from "@/plugins/slots";

export function Sidebar() {
  const { openNewIssue } = useDialog();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const inboxBadge = useInboxBadge(selectedCompanyId);
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const liveRunCount = liveRuns?.length ?? 0;
  const { data: fleetStatus } = useFleetStatus();
  const { data: fleetAlerts } = useFleetAlerts("firing");
  const activeAlertCount = fleetAlerts?.length ?? 0;

  // DB agents fallback: show bot dots even when fleet-monitor is offline
  const { data: dbAgents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const dbBots = useMemo(() => {
    if (!dbAgents) return [];
    return dbAgents
      .filter((a) => a.adapterType === "openclaw_gateway")
      .map(agentToBotStatus);
  }, [dbAgents]);

  // Use fleet-monitor data when available, fall back to DB agents
  const pulseBots = fleetStatus?.bots ?? (dbBots.length > 0 ? dbBots : []);
  const pulseOnline = fleetStatus?.totalConnected ?? pulseBots.filter((b) => b.connectionState === "monitoring").length;
  const pulseTotal = fleetStatus?.totalBots ?? pulseBots.length;

  function openSearch() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

  const pluginContext = {
    companyId: selectedCompanyId,
    companyPrefix: selectedCompany?.issuePrefix ?? null,
  };

  return (
    <aside className="w-60 h-full min-h-0 border-r border-border bg-background flex flex-col">
      {/* Top bar: Fleet name (bold) + Search — aligned with top sections (no visible border) */}
      <div className="flex items-center gap-1 px-3 h-12 shrink-0">
        <span className="text-base leading-none select-none shrink-0 ml-1">🦞</span>
        <span className="flex-1 text-sm font-bold text-foreground truncate pl-1">
          {selectedCompany?.name ?? "Select fleet"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground shrink-0"
          onClick={openSearch}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-4 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {/* New Issue button aligned with nav items */}
          <button
            onClick={() => openNewIssue()}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <SquarePen className="h-4 w-4 shrink-0" />
            <span className="truncate">New Issue</span>
          </button>
          <SidebarNavItem
            to="/dashboard"
            label="Fleet Dashboard"
            icon={Radio}
            liveCount={liveRunCount}
            badge={pulseTotal > 0 ? pulseOnline : undefined}
          />
          {/* Fleet Pulse: labeled section with status summary + bot dots */}
          {pulseBots.length > 0 && (
            <div className="px-3 py-1.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">
                  Fleet Pulse
                </span>
                <span className="text-[10px] font-medium text-muted-foreground">
                  <span className="text-green-500">{pulseOnline}</span>
                  <span className="text-muted-foreground/40"> / </span>
                  <span>{pulseTotal}</span>
                  <span className="text-muted-foreground/40 ml-0.5">online</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {pulseBots.map((bot) => (
                  <Link
                    key={bot.botId}
                    to={`/bots/${bot.botId}`}
                    title={`${bot.emoji} ${bot.name} — ${bot.connectionState === "monitoring" ? "Online" : bot.connectionState === "error" ? "Error" : bot.connectionState === "dormant" ? "Offline" : bot.connectionState}`}
                    className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-background shadow-sm hover:ring-2 hover:ring-[#D4A373] transition-all ${
                      botConnectionDot[bot.connectionState] ?? botConnectionDotDefault
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
          <SidebarNavItem
            to="/inbox"
            label="Inbox"
            icon={Inbox}
            badge={inboxBadge.inbox}
            badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
            alert={inboxBadge.failedRuns > 0}
          />
          <PluginSlotOutlet
            slotTypes={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-0.5"
            itemClassName="text-[13px] font-medium"
            missingBehavior="placeholder"
          />
        </div>

        <SidebarSection label="Work">
          <SidebarNavItem to="/issues" label="Issues" icon={CircleDot} />
          <SidebarNavItem to="/goals" label="Goals" icon={Target} />
        </SidebarSection>

        <SidebarProjects />

        <SidebarAgents />

        <SidebarSection label="Fleet">
          <SidebarNavItem to="/command-center" label="Command Center" icon={Terminal} />
          <SidebarNavItem to="/dashboard/audit-log" label="Audit Log" icon={ScrollText} />
          <SidebarNavItem
            to="/alerts"
            label="Alerts"
            icon={Bell}
            badge={activeAlertCount}
            badgeTone={activeAlertCount > 0 ? "danger" : "default"}
            alert={activeAlertCount > 0}
          />
          <SidebarNavItem to="/invite" label="Invite Links" icon={Link2} />
          <SidebarNavItem to="/costs" label="Costs & Budget" icon={DollarSign} />
          <SidebarNavItem to="/org" label="Org Chart" icon={Network} />
          <SidebarNavItem to="/activity" label="Activity" icon={History} />
          <SidebarNavItem to="/fleet-settings" label="Fleet Settings" icon={Settings} />
        </SidebarSection>

        <PluginSlotOutlet
          slotTypes={["sidebarPanel"]}
          context={pluginContext}
          className="flex flex-col gap-3"
          itemClassName="rounded-lg border border-border p-3"
          missingBehavior="placeholder"
        />
      </nav>
    </aside>
  );
}

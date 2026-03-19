import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useNavigate } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Network } from "lucide-react";
import { AGENT_ROLE_LABELS, type Agent } from "@paperclipai/shared";
import { useFleetStatus } from "../hooks/useFleetMonitor";
import { getRoleById } from "../lib/fleet-roles";
import type { BotStatus } from "../api/fleet-monitor";
import { cn } from "../lib/utils";

// Layout constants — larger cards for avatar + info
const CARD_W = 220;
const CARD_H = 140;
const GAP_X = 40;
const GAP_Y = 60;
const PADDING = 60;

// ── Tree layout types ───────────────────────────────────────────────────

interface LayoutNode {
  id: string;
  name: string;
  role: string;
  status: string;
  x: number;
  y: number;
  children: LayoutNode[];
}

// ── Layout algorithm ────────────────────────────────────────────────────

function subtreeWidth(node: OrgNode): number {
  if (node.reports.length === 0) return CARD_W;
  const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
  const gaps = (node.reports.length - 1) * GAP_X;
  return Math.max(CARD_W, childrenW + gaps);
}

function layoutTree(node: OrgNode, x: number, y: number): LayoutNode {
  const totalW = subtreeWidth(node);
  const layoutChildren: LayoutNode[] = [];

  if (node.reports.length > 0) {
    const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
    const gaps = (node.reports.length - 1) * GAP_X;
    let cx = x + (totalW - childrenW - gaps) / 2;

    for (const child of node.reports) {
      const cw = subtreeWidth(child);
      layoutChildren.push(layoutTree(child, cx, y + CARD_H + GAP_Y));
      cx += cw + GAP_X;
    }
  }

  return {
    id: node.id,
    name: node.name,
    role: node.role,
    status: node.status,
    x: x + (totalW - CARD_W) / 2,
    y,
    children: layoutChildren,
  };
}

function layoutForest(roots: OrgNode[]): LayoutNode[] {
  if (roots.length === 0) return [];
  let x = PADDING;
  const y = PADDING;
  const result: LayoutNode[] = [];
  for (const root of roots) {
    const w = subtreeWidth(root);
    result.push(layoutTree(root, x, y));
    x += w + GAP_X;
  }
  return result;
}

function flattenLayout(nodes: LayoutNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  function walk(n: LayoutNode) {
    result.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

function collectEdges(nodes: LayoutNode[]): Array<{ parent: LayoutNode; child: LayoutNode }> {
  const edges: Array<{ parent: LayoutNode; child: LayoutNode }> = [];
  function walk(n: LayoutNode) {
    for (const c of n.children) {
      edges.push({ parent: n, child: c });
      walk(c);
    }
  }
  nodes.forEach(walk);
  return edges;
}

// ── Status helpers ──────────────────────────────────────────────────────

type DisplayStatus = "online" | "offline" | "idle";

function getDisplayStatus(state: string): DisplayStatus {
  if (state === "monitoring" || state === "running" || state === "active") return "online";
  if (state === "dormant" || state === "error" || state === "terminated" || state === "disconnected") return "offline";
  return "idle";
}

const STATUS_CONFIG: Record<DisplayStatus, { dotClass: string; label: string; dotColor: string }> = {
  online: { dotClass: "bg-green-400", label: "Online", dotColor: "#4ade80" },
  offline: { dotClass: "bg-red-400", label: "Offline", dotColor: "#f87171" },
  idle: { dotClass: "bg-yellow-400 animate-pulse", label: "Idle", dotColor: "#facc15" },
};

// ── Main component ──────────────────────────────────────────────────────

export function OrgChart() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  const { data: orgTree, isLoading } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: fleetStatus } = useFleetStatus();

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents ?? []) m.set(a.id, a);
    return m;
  }, [agents]);

  // Map fleet bots by agentId for quick lookup
  const botByAgentId = useMemo(() => {
    const m = new Map<string, BotStatus>();
    for (const bot of fleetStatus?.bots ?? []) {
      m.set(bot.agentId, bot);
    }
    return m;
  }, [fleetStatus]);

  useEffect(() => {
    setBreadcrumbs([{ label: "Fleet Org Chart" }]);
  }, [setBreadcrumbs]);

  // Layout computation
  const layout = useMemo(() => layoutForest(orgTree ?? []), [orgTree]);
  const allNodes = useMemo(() => flattenLayout(layout), [layout]);
  const edges = useMemo(() => collectEdges(layout), [layout]);

  // Compute SVG bounds
  const bounds = useMemo(() => {
    if (allNodes.length === 0) return { width: 800, height: 600 };
    let maxX = 0, maxY = 0;
    for (const n of allNodes) {
      maxX = Math.max(maxX, n.x + CARD_W);
      maxY = Math.max(maxY, n.y + CARD_H);
    }
    return { width: maxX + PADDING, height: maxY + PADDING };
  }, [allNodes]);

  // Pan & zoom state
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Center the chart on first load
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current || allNodes.length === 0 || !containerRef.current) return;
    hasInitialized.current = true;

    const container = containerRef.current;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    const scaleX = (containerW - 40) / bounds.width;
    const scaleY = (containerH - 40) / bounds.height;
    const fitZoom = Math.min(scaleX, scaleY, 1);

    const chartW = bounds.width * fitZoom;
    const chartH = bounds.height * fitZoom;

    setZoom(fitZoom);
    setPan({
      x: (containerW - chartW) / 2,
      y: (containerH - chartH) / 2,
    });
  }, [allNodes, bounds]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-org-card]")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * factor, 0.2), 2);

    const scale = newZoom / zoom;
    setPan({
      x: mouseX - scale * (mouseX - pan.x),
      y: mouseY - scale * (mouseY - pan.y),
    });
    setZoom(newZoom);
  }, [zoom, pan]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Network} message="Select a fleet to view the org chart." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="org-chart" />;
  }

  if (orgTree && orgTree.length === 0) {
    return <EmptyState icon={Network} message="No organizational hierarchy defined. Add bots with roles to build your org chart." />;
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-[calc(100dvh-6rem)] overflow-hidden relative rounded-2xl border border-[#E0E0E0]/50"
      style={{
        cursor: dragging ? "grabbing" : "grab",
        background: "linear-gradient(135deg, #FAF9F6 0%, #F5F0EB 50%, #FAF9F6 100%)",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Title overlay */}
      <div className="absolute top-4 left-4 z-10">
        <h1 className="text-lg font-bold text-[#2C2420]">Fleet Org Chart</h1>
        {fleetStatus && (
          <p className="text-xs text-[#2C2420]/60 mt-0.5">
            {fleetStatus.totalConnected} / {fleetStatus.totalBots} bots online
          </p>
        )}
      </div>

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <button
          className="w-8 h-8 flex items-center justify-center bg-[#FAF9F6]/95 backdrop-blur-md border border-[#E0E0E0]/50 rounded-lg text-sm font-medium text-[#2C2420] hover:bg-[#D4A373]/10 hover:border-[#D4A373]/30 transition-all"
          onClick={() => {
            const newZoom = Math.min(zoom * 1.2, 2);
            const container = containerRef.current;
            if (container) {
              const cx = container.clientWidth / 2;
              const cy = container.clientHeight / 2;
              const scale = newZoom / zoom;
              setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
            }
            setZoom(newZoom);
          }}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          className="w-8 h-8 flex items-center justify-center bg-[#FAF9F6]/95 backdrop-blur-md border border-[#E0E0E0]/50 rounded-lg text-sm font-medium text-[#2C2420] hover:bg-[#D4A373]/10 hover:border-[#D4A373]/30 transition-all"
          onClick={() => {
            const newZoom = Math.max(zoom * 0.8, 0.2);
            const container = containerRef.current;
            if (container) {
              const cx = container.clientWidth / 2;
              const cy = container.clientHeight / 2;
              const scale = newZoom / zoom;
              setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
            }
            setZoom(newZoom);
          }}
          aria-label="Zoom out"
        >
          &minus;
        </button>
        <button
          className="w-8 h-8 flex items-center justify-center bg-[#FAF9F6]/95 backdrop-blur-md border border-[#E0E0E0]/50 rounded-lg text-[10px] font-medium text-[#2C2420] hover:bg-[#D4A373]/10 hover:border-[#D4A373]/30 transition-all"
          onClick={() => {
            if (!containerRef.current) return;
            const cW = containerRef.current.clientWidth;
            const cH = containerRef.current.clientHeight;
            const scaleX = (cW - 40) / bounds.width;
            const scaleY = (cH - 40) / bounds.height;
            const fitZoom = Math.min(scaleX, scaleY, 1);
            const chartW = bounds.width * fitZoom;
            const chartH = bounds.height * fitZoom;
            setZoom(fitZoom);
            setPan({ x: (cW - chartW) / 2, y: (cH - chartH) / 2 });
          }}
          title="Fit to screen"
          aria-label="Fit chart to screen"
        >
          Fit
        </button>
      </div>

      {/* SVG layer for edges */}
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{ width: "100%", height: "100%" }}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {edges.map(({ parent, child }) => {
            const x1 = parent.x + CARD_W / 2;
            const y1 = parent.y + CARD_H;
            const x2 = child.x + CARD_W / 2;
            const y2 = child.y;
            const midY = (y1 + y2) / 2;

            return (
              <path
                key={`${parent.id}-${child.id}`}
                d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                fill="none"
                stroke="#D4A373"
                strokeWidth={2}
                strokeOpacity={0.4}
              />
            );
          })}
        </g>
      </svg>

      {/* Card layer */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {allNodes.map((node) => {
          const agent = agentMap.get(node.id);
          const bot = botByAgentId.get(node.id);
          const fleetRole = bot?.roleId ? getRoleById(bot.roleId) : null;
          const displayStatus = getDisplayStatus(bot?.connectionState ?? node.status);
          const { dotClass, label: statusLabel, dotColor } = STATUS_CONFIG[displayStatus];

          // Determine avatar source
          const avatarUrl = bot?.avatar ?? null;
          const emoji = bot?.emoji ?? (agent?.icon ? null : null);
          const botName = bot?.name ?? node.name;
          const roleTitle = fleetRole
            ? `${fleetRole.title} / ${fleetRole.subtitle}`
            : agent?.title ?? roleLabel(node.role);

          const isVacant = !bot && !agent;

          return (
            <div
              key={node.id}
              data-org-card
              className={cn(
                "absolute rounded-2xl shadow-sm transition-all duration-200 cursor-pointer select-none",
                isVacant
                  ? "border-2 border-dashed border-[#D4A373]/40 bg-[#FAF9F6]/50 hover:border-[#D4A373]/60"
                  : "border border-[#E0E0E0]/50 bg-[#FAF9F6]/90 backdrop-blur-md hover:shadow-lg hover:-translate-y-0.5 hover:border-[#D4A373]/30",
              )}
              style={{
                left: node.x,
                top: node.y,
                width: CARD_W,
                minHeight: CARD_H,
              }}
              onClick={() => {
                if (bot) navigate(`/bots/${bot.botId}`);
                else if (agent) navigate(agentUrl(agent));
              }}
            >
              {isVacant ? (
                /* Vacant position card */
                <div className="flex flex-col items-center justify-center h-full min-h-[140px] px-3 py-3 gap-2">
                  <div className="w-16 h-16 rounded-xl border-2 border-dashed border-[#D4A373]/30 flex items-center justify-center">
                    <span className="text-3xl opacity-40">
                      {fleetRole?.defaultEmoji ?? "?"}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-[#2C2420]/60 text-center leading-tight">
                    {roleLabel(node.role)}
                  </span>
                  <span className="text-[10px] text-[#D4A373] font-medium">
                    Vacant &mdash; Connect Bot
                  </span>
                </div>
              ) : (
                /* Filled position card */
                <div className="flex flex-col px-3 py-3 gap-2">
                  <div className="flex gap-3">
                    {/* Square avatar */}
                    <div className="relative shrink-0">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={botName}
                          className="w-16 h-16 rounded-xl object-cover shadow-sm"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-[#D4A373]/10 flex items-center justify-center shadow-sm">
                          <span className="text-3xl">
                            {emoji || bot?.emoji || "\u{1F916}"}
                          </span>
                        </div>
                      )}
                      {/* Status light */}
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-[#FAF9F6]",
                          dotClass,
                        )}
                      />
                    </div>

                    {/* Name + role */}
                    <div className="flex flex-col min-w-0 flex-1 justify-center">
                      <span className="text-sm font-bold text-[#2C2420] leading-tight truncate">
                        {bot?.emoji && <span className="mr-0.5">{bot.emoji}</span>}
                        {botName}
                      </span>
                      <span className="text-[11px] text-[#2C2420]/60 leading-tight mt-0.5 truncate">
                        {roleTitle}
                      </span>
                      <div className="flex items-center gap-1 mt-1">
                        <span
                          className={cn("h-2 w-2 rounded-full shrink-0", dotClass)}
                        />
                        <span className="text-[10px] text-[#2C2420]/50 font-medium">
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Context % mini bar */}
                  {bot?.contextTokens != null && bot.contextMaxTokens != null && bot.contextMaxTokens > 0 && (
                    <div className="mt-1">
                      <div className="flex items-center justify-between text-[9px] text-[#2C2420]/50 mb-0.5">
                        <span>Context</span>
                        <span>
                          {Math.round((bot.contextTokens / bot.contextMaxTokens) * 100)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#E0E0E0]/40 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            contextBarColor(Math.round((bot.contextTokens / bot.contextMaxTokens) * 100)),
                          )}
                          style={{ width: `${Math.min(100, Math.round((bot.contextTokens / bot.contextMaxTokens) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Skills count */}
                  {bot && bot.skills.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mt-0.5">
                      {bot.skills.slice(0, 3).map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center rounded-md bg-[#D4A373]/10 px-1.5 py-0 text-[9px] font-medium text-[#2C2420]/70"
                        >
                          {skill}
                        </span>
                      ))}
                      {bot.skills.length > 3 && (
                        <span className="text-[9px] text-[#2C2420]/40">
                          +{bot.skills.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function contextBarColor(percent: number): string {
  if (percent > 80) return "bg-red-500";
  if (percent >= 50) return "bg-yellow-500";
  return "bg-green-500";
}

const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
}

/**
 * BotConnectStep — Step 3 of Fleet Onboarding Wizard
 *
 * Split layout:
 * - Left: Detected bots (draggable) + Manual Connect button
 * - Right: Org chart with droppable vacant slots
 *
 * Uses @dnd-kit for drag-and-drop.
 */

import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import {
  buildOrgTree,
  getRoleById,
  getAllRoles,
  type FleetRole,
  type OrgChartNode,
} from "@/lib/fleet-roles";
import { fleetMonitorApi, type DiscoveredGateway, type DiscoverBotResult } from "@/api/fleet-monitor";
import {
  Loader2,
  Wifi,
  WifiOff,
  Plus,
  RefreshCw,
  Check,
  X,
  Monitor,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────

export interface DetectedBot {
  id: string;
  url: string;
  name: string;
  emoji: string;
  status: "online" | "offline" | "unknown";
  machine: string;
  source: "local-scan" | "mdns" | "tailscale" | "manual" | "saved";
}

export interface BotAssignment {
  roleId: string;
  bot: DetectedBot;
}

// ─── Props ────────────────────────────────────────────────────────────────

interface BotConnectStepProps {
  selectedRoles: string[];
  assignments: BotAssignment[];
  onAssignmentsChange: (assignments: BotAssignment[]) => void;
  companyId: string | null;
}

// ─── Port scan constants ──────────────────────────────────────────────────

const SCAN_PORTS = [18789, 18790, 18793, 18797, 18800];

/**
 * Client-side port scan as fallback when server-side discovery is unavailable.
 */
async function scanLocalPortsFallback(): Promise<DetectedBot[]> {
  const bots: DetectedBot[] = [];

  for (const port of SCAN_PORTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        bots.push({
          id: `local-${port}`,
          url: `http://127.0.0.1:${port}`,
          name: data.name || `Bot :${port}`,
          emoji: data.emoji || "\uD83E\uDD16",
          status: "online",
          machine: "localhost",
          source: "local-scan",
        });
      }
    } catch {
      // port not responding — skip
    }
  }

  return bots;
}

/**
 * Convert server-side DiscoverBotResult to DetectedBot UI type.
 */
function toDetectedBot(bot: DiscoverBotResult): DetectedBot {
  return {
    id: `${bot.source}-${bot.port}-${bot.host}`,
    url: bot.url,
    name: bot.name,
    emoji: bot.emoji,
    status: bot.status,
    machine: bot.machine,
    source: bot.source,
  };
}

/**
 * Primary discovery: call server-side unified API which scans
 * local ports + mDNS + Tailscale in one request.
 * Falls back to client-side scan if the API is unavailable.
 */
async function discoverBots(): Promise<DetectedBot[]> {
  try {
    const res = await fleetMonitorApi.discoverBots();
    if (res.ok && res.bots?.length) {
      return res.bots.map(toDetectedBot);
    }
  } catch {
    // Server-side discovery unavailable — fallback
  }

  // Fallback: client-side port scan + mDNS via old endpoint
  const [localBots, mdnsBots] = await Promise.all([
    scanLocalPortsFallback(),
    (async () => {
      try {
        const res = await fleetMonitorApi.discovery();
        if (res.gateways?.length) {
          return res.gateways.map((gw: DiscoveredGateway): DetectedBot => ({
            id: `mdns-${gw.id}`,
            url: gw.url,
            name: gw.hostname || `Bot :${gw.port}`,
            emoji: "\uD83E\uDD16",
            status: "online",
            machine: gw.hostname || gw.host,
            source: "mdns",
          }));
        }
      } catch { /* ignore */ }
      return [] as DetectedBot[];
    })(),
  ]);

  // Merge, dedup by URL
  const merged = new Map<string, DetectedBot>();
  for (const b of [...localBots, ...mdnsBots]) {
    if (!merged.has(b.url)) merged.set(b.url, b);
  }
  return Array.from(merged.values());
}

// ─── Manual Connect Dialog ────────────────────────────────────────────────

function ManualConnectDialog({
  onConnect,
  onCancel,
}: {
  onConnect: (bot: DetectedBot) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState("http://");
  const [token, setToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    name?: string;
    error?: string;
  } | null>(null);

  const testConnection = useCallback(async () => {
    setTesting(true);
    setResult(null);
    try {
      // Try server-side probe first (handles network scanning from server)
      const probeRes = await fleetMonitorApi.probeGateway(url.replace(/\/$/, ""));
      if (probeRes.ok && probeRes.bot) {
        setResult({ ok: true, name: probeRes.bot.name || "OpenClaw Bot" });
        return;
      }
      // Server probe failed — try direct client-side fetch as fallback
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url.replace(/\/$/, "") + "/health", {
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setResult({ ok: true, name: data.name || "OpenClaw Bot" });
      } else {
        setResult({ ok: false, error: `HTTP ${res.status}` });
      }
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Connection failed",
      });
    } finally {
      setTesting(false);
    }
  }, [url, token]);

  return (
    <div className="rounded-lg border border-[#E0E0E0] bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[#2C2420]">
          Manual Connect
        </h4>
        <button
          onClick={onCancel}
          className="p-0.5 rounded hover:bg-[#E0E0E0]/50"
        >
          <X className="h-3.5 w-3.5 text-[#948F8C]" />
        </button>
      </div>
      <div>
        <label className="text-[10px] font-medium text-[#948F8C] block mb-1">
          Gateway URL
        </label>
        <input
          className="w-full rounded-md border border-[#E0E0E0] bg-white px-2.5 py-1.5 text-xs font-mono text-[#2C2420] outline-none focus:ring-1 focus:ring-[#D4A373]/40 focus:border-[#D4A373]"
          placeholder="http://192.168.50.73:18793"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setResult(null);
          }}
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-[#948F8C] block mb-1">
          Gateway Token
        </label>
        <input
          type="password"
          className="w-full rounded-md border border-[#E0E0E0] bg-white px-2.5 py-1.5 text-xs font-mono text-[#2C2420] outline-none focus:ring-1 focus:ring-[#D4A373]/40 focus:border-[#D4A373]"
          placeholder="Enter token (optional)"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setResult(null);
          }}
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        className="w-full text-xs border-[#D4A373] text-[#D4A373] hover:bg-[#D4A373]/10"
        disabled={!url.trim() || testing}
        onClick={testConnection}
      >
        {testing ? (
          <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
        ) : (
          <Wifi className="h-3 w-3 mr-1.5" />
        )}
        {testing ? "Testing..." : "Test Connection"}
      </Button>

      {result && (
        <div
          className={cn(
            "rounded-md px-2.5 py-2 text-[11px] flex items-center gap-2",
            result.ok
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-600 border border-red-200"
          )}
        >
          {result.ok ? (
            <>
              <Check className="h-3.5 w-3.5 shrink-0" />
              Connected! Bot: {result.name}
              <Button
                size="sm"
                className="ml-auto h-5 text-[10px] bg-green-600 text-white hover:bg-green-700 px-2"
                onClick={() => {
                  const port =
                    new URL(url).port || (url.includes("https") ? "443" : "80");
                  onConnect({
                    id: `manual-${Date.now()}`,
                    url: url.replace(/\/$/, ""),
                    name: result.name || "OpenClaw Bot",
                    emoji: "🤖",
                    status: "online",
                    machine: new URL(url).hostname,
                    source: "manual",
                  });
                }}
              >
                Add
              </Button>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
              {result.error}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Draggable Bot Card ───────────────────────────────────────────────────

function DraggableBotCard({
  bot,
  isAssigned,
}: {
  bot: DetectedBot;
  isAssigned: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: bot.id,
      data: { bot },
      disabled: isAssigned,
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "rounded-lg border px-3 py-2 flex items-center gap-2.5 transition-all select-none",
        isDragging && "opacity-40",
        isAssigned
          ? "border-green-300 bg-green-50/50 cursor-default opacity-60"
          : "border-[#E0E0E0] bg-white hover:border-[#D4A373]/60 hover:shadow-sm cursor-grab active:cursor-grabbing"
      )}
    >
      <span className="text-lg leading-none shrink-0">{bot.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-[#2C2420] truncate">
          {bot.name}
        </p>
        <p className="text-[10px] text-[#948F8C] truncate">
          {bot.source === "manual" ? bot.url : `:${new URL(bot.url).port}`}{" "}
          {bot.machine}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {bot.status === "online" ? (
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
        ) : (
          <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
        )}
        {isAssigned && <Check className="h-3 w-3 text-green-500" />}
      </div>
    </div>
  );
}

// ─── Drag Overlay (follows cursor) ────────────────────────────────────────

function BotDragOverlay({ bot }: { bot: DetectedBot }) {
  return (
    <div className="rounded-lg border-2 border-[#D4A373] bg-white shadow-lg px-3 py-2 flex items-center gap-2.5 pointer-events-none">
      <span className="text-lg leading-none">{bot.emoji}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[#2C2420]">{bot.name}</p>
        <p className="text-[10px] text-[#948F8C]">
          {bot.source === "manual" ? bot.url : `:${new URL(bot.url).port}`}
        </p>
      </div>
    </div>
  );
}

// ─── Droppable Org Chart Node ─────────────────────────────────────────────

function DroppableOrgNode({
  node,
  assignments,
  allBots,
}: {
  node: OrgChartNode;
  assignments: BotAssignment[];
  allBots: DetectedBot[];
}) {
  const assignment = assignments.find((a) => a.roleId === node.role.id);
  const hasChildren = node.children.length > 0;

  const { isOver, setNodeRef } = useDroppable({
    id: `slot-${node.role.id}`,
    data: { roleId: node.role.id },
    disabled: !!assignment,
  });

  return (
    <div className="flex flex-col items-center">
      {/* Node card — droppable target */}
      <div
        ref={setNodeRef}
        className={cn(
          "rounded-lg border-2 px-2.5 py-1.5 text-center min-w-[72px] transition-all",
          assignment
            ? "border-[#27BD74]/60 bg-[#27BD74]/10"
            : isOver
              ? "border-[#D4A373] bg-[#D4A373]/20 scale-105 shadow-md"
              : "border-dashed border-[#D4A373]/40 bg-[#FAF9F6]/5"
        )}
      >
        {assignment ? (
          <>
            <div className="text-base leading-none">
              {assignment.bot.emoji}
            </div>
            <div className="text-[9px] font-semibold text-[#FAF9F6] mt-0.5 whitespace-nowrap">
              {assignment.bot.name}
            </div>
            <div className="text-[7px] text-[#27BD74] whitespace-nowrap">
              {node.role.title}
            </div>
          </>
        ) : (
          <>
            <div className="text-base leading-none opacity-40">
              {node.role.defaultEmoji ?? "👤"}
            </div>
            <div className="text-[9px] font-semibold text-[#FAF9F6] mt-0.5 whitespace-nowrap">
              {node.role.title}
            </div>
            <div className="text-[7px] text-[#FAF9F6]/40 whitespace-nowrap">
              {isOver ? "Drop here!" : "Drag bot here"}
            </div>
          </>
        )}
      </div>

      {hasChildren && (
        <>
          <div className="w-px h-3 bg-[#D4A373]/30" />
          <div className="relative flex gap-1">
            {node.children.map((child, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === node.children.length - 1;
              const isOnly = node.children.length === 1;

              return (
                <div
                  key={child.role.id}
                  className="flex flex-col items-center"
                >
                  <div className="relative w-full h-3">
                    {!isFirst && !isOnly && (
                      <div className="absolute top-0 left-0 w-1/2 border-t border-[#D4A373]/30" />
                    )}
                    {!isLast && !isOnly && (
                      <div className="absolute top-0 right-0 w-1/2 border-t border-[#D4A373]/30" />
                    )}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-[#D4A373]/30" />
                  </div>
                  <DroppableOrgNode
                    node={child}
                    assignments={assignments}
                    allBots={allBots}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export function BotConnectStep({
  selectedRoles,
  assignments,
  onAssignmentsChange,
  companyId,
}: BotConnectStepProps) {
  const [detectedBots, setDetectedBots] = useState<DetectedBot[]>([]);
  const [scanning, setScanning] = useState(false);
  const [showManualConnect, setShowManualConnect] = useState(false);
  const [activeDragBot, setActiveDragBot] = useState<DetectedBot | null>(null);

  // Auto-scan on mount
  useEffect(() => {
    runScan();
  }, []);

  async function runScan() {
    setScanning(true);
    try {
      const bots = await discoverBots();
      setDetectedBots(bots);
    } finally {
      setScanning(false);
    }
  }

  function handleManualBotAdded(bot: DetectedBot) {
    setDetectedBots((prev) => {
      if (prev.some((b) => b.url === bot.url)) return prev;
      return [...prev, bot];
    });
    setShowManualConnect(false);
  }

  // ─── DnD Handlers ────────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    const bot = event.active.data.current?.bot as DetectedBot | undefined;
    setActiveDragBot(bot ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragBot(null);

    const { active, over } = event;
    if (!over) return;

    const bot = active.data.current?.bot as DetectedBot | undefined;
    const roleId = over.data.current?.roleId as string | undefined;
    if (!bot || !roleId) return;

    // Check if this role is already assigned
    if (assignments.some((a) => a.roleId === roleId)) return;

    // Remove bot from any previous assignment
    const newAssignments = assignments.filter((a) => a.bot.id !== bot.id);
    newAssignments.push({ roleId, bot });
    onAssignmentsChange(newAssignments);
  }

  // Build org tree
  const tree = buildOrgTree(selectedRoles);
  const assignedBotIds = new Set(assignments.map((a) => a.bot.id));

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-4">
        {/* Split layout on larger screens */}
        <div className="flex flex-col md:flex-row gap-3">
          {/* ─── Left: Detected Bots ────────────────────────────── */}
          <div className="md:w-[45%] shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-[#2C2420] flex items-center gap-1.5">
                <Monitor className="h-3.5 w-3.5 text-[#D4A373]" />
                Detected Bots
              </h4>
              <button
                onClick={runScan}
                disabled={scanning}
                className="text-[10px] text-[#D4A373] hover:text-[#B08968] flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw
                  className={cn(
                    "h-3 w-3",
                    scanning && "animate-spin"
                  )}
                />
                {scanning ? "Scanning..." : "Rescan"}
              </button>
            </div>

            {scanning && detectedBots.length === 0 ? (
              <div className="rounded-lg border border-[#E0E0E0] bg-white/50 p-6 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-[#D4A373] mx-auto mb-2" />
                <p className="text-[11px] text-[#948F8C]">
                  Scanning ports {SCAN_PORTS.join(", ")}...
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-0.5">
                {detectedBots.map((bot) => (
                  <DraggableBotCard
                    key={bot.id}
                    bot={bot}
                    isAssigned={assignedBotIds.has(bot.id)}
                  />
                ))}
                {detectedBots.length === 0 && !scanning && (
                  <div className="rounded-lg border border-dashed border-[#E0E0E0] bg-white/30 p-4 text-center">
                    <WifiOff className="h-4 w-4 text-[#948F8C] mx-auto mb-1.5" />
                    <p className="text-[11px] text-[#948F8C]">
                      No bots detected on local network
                    </p>
                    <p className="text-[10px] text-[#948F8C]/70 mt-0.5">
                      Use Manual Connect below
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Manual Connect */}
            {showManualConnect ? (
              <ManualConnectDialog
                onConnect={handleManualBotAdded}
                onCancel={() => setShowManualConnect(false)}
              />
            ) : (
              <button
                onClick={() => setShowManualConnect(true)}
                className="w-full rounded-lg border border-dashed border-[#D4A373]/40 bg-[#D4A373]/5 px-3 py-2 text-xs text-[#D4A373] hover:bg-[#D4A373]/10 hover:border-[#D4A373]/60 transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Manual Connect
              </button>
            )}

            {/* Assignment summary */}
            {assignments.length > 0 && (
              <div className="rounded-md bg-[#F5F0EB] px-2.5 py-2 space-y-1">
                <p className="text-[10px] font-semibold text-[#2C2420]">
                  Assigned ({assignments.length})
                </p>
                {assignments.map((a) => {
                  const role = getRoleById(a.roleId);
                  return (
                    <div
                      key={a.roleId}
                      className="flex items-center gap-1.5 text-[10px] text-[#2C2420]/70"
                    >
                      <span>{a.bot.emoji}</span>
                      <span className="truncate">{a.bot.name}</span>
                      <span className="text-[#948F8C]">→</span>
                      <span className="truncate font-medium">
                        {role?.title ?? a.roleId}
                      </span>
                      <button
                        className="ml-auto shrink-0 p-0.5 rounded hover:bg-red-100"
                        onClick={() =>
                          onAssignmentsChange(
                            assignments.filter((x) => x.roleId !== a.roleId)
                          )
                        }
                      >
                        <X className="h-2.5 w-2.5 text-red-400" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── Right: Org Chart (visible on mobile too) ──────── */}
          <div className="md:w-[55%] flex-1 rounded-lg border border-[#2C2420]/10 bg-[#2C2420] p-4 flex flex-col items-center justify-center min-h-[200px] overflow-auto">
            <h4 className="text-[10px] font-semibold text-[#D4A373] uppercase tracking-wider mb-4">
              Org Chart — Drop Bots Here
            </h4>
            {tree.length === 0 ? (
              <p className="text-xs text-[#FAF9F6]/40">No roles selected</p>
            ) : (
              <div className="inline-flex flex-col items-center scale-[0.85] origin-top">
                {tree.map((node) => (
                  <DroppableOrgNode
                    key={node.role.id}
                    node={node}
                    assignments={assignments}
                    allBots={detectedBots}
                  />
                ))}
              </div>
            )}
            <p className="text-[9px] text-[#FAF9F6]/25 mt-4">
              {assignments.length} / {selectedRoles.length} positions filled
            </p>
          </div>
        </div>
      </div>

      {/* Drag overlay — follows cursor */}
      <DragOverlay dropAnimation={null}>
        {activeDragBot ? <BotDragOverlay bot={activeDragBot} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

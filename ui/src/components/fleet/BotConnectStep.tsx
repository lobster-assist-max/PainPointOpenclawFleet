/**
 * BotConnectStep — Step 3 of Fleet Onboarding Wizard
 *
 * Split layout:
 * - Left: Detected bots (draggable) + Manual Connect button
 * - Right: Org chart with droppable vacant slots
 *
 * Uses @dnd-kit for drag-and-drop.
 * On drop: validates Gateway connection, fetches bot identity/skills,
 * and shows retry-with-token dialog on failure.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  closestCenter,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import {
  buildOrgTree,
  getRoleById,
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
  AlertTriangle,
  Zap,
  ShieldCheck,
  KeyRound,
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
  skills?: string[];
  identityRole?: string | null;
  description?: string | null;
  gatewayVersion?: string | null;
}

export interface BotAssignment {
  roleId: string;
  bot: DetectedBot;
  validated?: boolean;
}

type ValidationState = "idle" | "validating" | "success" | "failed";

interface RoleValidation {
  state: ValidationState;
  error?: string;
  botId?: string;
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
          skills: Array.isArray(data.skills) ? data.skills : [],
          identityRole: data.role || null,
          gatewayVersion: data.version || null,
        });
      }
    } catch (err) {
      console.warn(`[fleet] port ${port} not responding:`, err);
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
    skills: bot.skills ?? [],
    identityRole: bot.identityRole ?? null,
    gatewayVersion: bot.gatewayVersion ?? null,
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
  } catch (err) {
    console.warn("[fleet] server-side discovery unavailable, using fallback:", err);
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
      } catch (err) {
        console.warn("[fleet] mDNS scan failed:", err instanceof Error ? err.message : err);
      }
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

// ─── Gateway Validation ──────────────────────────────────────────────────

interface GatewayValidationResult {
  ok: boolean;
  name?: string;
  emoji?: string;
  skills?: string[];
  identityRole?: string | null;
  description?: string | null;
  gatewayVersion?: string | null;
  error?: string;
}

/**
 * Validate a bot's Gateway connection:
 * 1. GET /health — verify connectivity
 * 2. Pull bot name, skills, identity from the response
 */
async function validateGateway(
  url: string,
  token?: string,
): Promise<GatewayValidationResult> {
  // Try server-side probe first
  try {
    const probeRes = await fleetMonitorApi.probeGateway(url.replace(/\/$/, ""));
    if (probeRes.ok && probeRes.bot) {
      return {
        ok: true,
        name: probeRes.bot.name,
        emoji: probeRes.bot.emoji,
        skills: probeRes.bot.skills ?? [],
        identityRole: probeRes.bot.identityRole ?? null,
        gatewayVersion: probeRes.bot.gatewayVersion ?? null,
      };
    }
  } catch (err) {
    console.warn("[fleet] server probe unavailable, trying direct:", err);
  }

  // Direct client-side validation
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url.replace(/\/$/, "") + "/health", {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        ok: false,
        error: `Gateway returned HTTP ${res.status}`,
      };
    }

    const data = await res.json().catch(() => ({}));
    return {
      ok: true,
      name: data.name || data.botName,
      emoji: data.emoji,
      skills: Array.isArray(data.skills) ? data.skills : [],
      identityRole: data.role || data.identityRole || null,
      description: data.description || null,
      gatewayVersion: data.version || data.gatewayVersion || null,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

// ─── Token Retry Dialog ──────────────────────────────────────────────────

function TokenRetryDialog({
  botName,
  botEmoji,
  roleTitle,
  error,
  onRetry,
  onSkip,
  onCancel,
}: {
  botName: string;
  botEmoji: string;
  roleTitle: string;
  error: string;
  onRetry: (token: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const [token, setToken] = useState("");
  const [retrying, setRetrying] = useState(false);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl border border-[#E0E0E0] w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-red-50 border-b border-red-100 px-4 py-3 flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-700">
              Gateway Validation Failed
            </p>
            <p className="text-[10px] text-red-500 truncate">
              {botEmoji} {botName} → {roleTitle}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          <div className="rounded-md bg-red-50/50 border border-red-100 px-2.5 py-2 text-[11px] text-red-600">
            {error}
          </div>

          <div>
            <label className="text-[10px] font-medium text-[#948F8C] block mb-1">
              <KeyRound className="h-3 w-3 inline mr-1" />
              Gateway Token (if required)
            </label>
            <input
              type="password"
              className="w-full rounded-md border border-[#E0E0E0] bg-white px-2.5 py-1.5 text-xs font-mono text-[#2C2420] outline-none focus:ring-1 focus:ring-[#D4A373]/40 focus:border-[#D4A373]"
              placeholder="Enter Gateway token..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-[#E0E0E0] px-4 py-2.5 flex items-center justify-between">
          <button
            onClick={onCancel}
            className="text-xs text-[#948F8C] hover:text-[#2C2420]"
          >
            Remove
          </button>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-[#E0E0E0]"
              onClick={onSkip}
            >
              Skip Validation
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs bg-[#D4A373] text-white hover:bg-[#B08968] border-none disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!token.trim() || retrying}
              onClick={() => {
                setRetrying(true);
                onRetry(token.trim());
              }}
            >
              {retrying ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Wifi className="h-3 w-3 mr-1" />
              )}
              Retry
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
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
      const validation = await validateGateway(url.replace(/\/$/, ""), token || undefined);
      if (validation.ok) {
        setResult({ ok: true, name: validation.name || "OpenClaw Bot" });
      } else {
        setResult({ ok: false, error: validation.error || "Connection failed" });
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
                    emoji: "\uD83E\uDD16",
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

  const skillCount = bot.skills?.length ?? 0;

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
        {skillCount > 0 && (
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {bot.skills!.slice(0, 3).map((skill) => (
              <span
                key={skill}
                className="inline-block text-[8px] bg-[#D4A373]/10 text-[#B08968] rounded px-1 py-0.5 truncate max-w-[60px]"
              >
                {skill}
              </span>
            ))}
            {skillCount > 3 && (
              <span className="text-[8px] text-[#948F8C]">
                +{skillCount - 3}
              </span>
            )}
          </div>
        )}
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
      <Zap className="h-3.5 w-3.5 text-[#D4A373] shrink-0" />
    </div>
  );
}

// ─── Droppable Org Chart Node ─────────────────────────────────────────────

function DroppableOrgNode({
  node,
  assignments,
  allBots,
  validations,
  onSlotClick,
  selectedBotId,
}: {
  node: OrgChartNode;
  assignments: BotAssignment[];
  allBots: DetectedBot[];
  validations: Map<string, RoleValidation>;
  onSlotClick?: (roleId: string) => void;
  selectedBotId?: string | null;
}) {
  const assignment = assignments.find((a) => a.roleId === node.role.id);
  const validation = validations.get(node.role.id);
  const hasChildren = node.children.length > 0;
  const isValidating = validation?.state === "validating";
  const isValidated = assignment?.validated === true;
  const isFailed = validation?.state === "failed";

  const { isOver, setNodeRef } = useDroppable({
    id: `slot-${node.role.id}`,
    data: { roleId: node.role.id },
    disabled: !!assignment || isValidating,
  });

  return (
    <div className="flex flex-col items-center">
      {/* Node card — droppable target + click-to-assign */}
      <div
        ref={setNodeRef}
        role={!assignment && onSlotClick ? "button" : undefined}
        tabIndex={!assignment && onSlotClick ? 0 : undefined}
        aria-label={!assignment ? `Assign bot to ${node.role.title}` : `${node.role.title} — assigned`}
        onClick={() => { if (!assignment && onSlotClick) onSlotClick(node.role.id); }}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !assignment && onSlotClick) { e.preventDefault(); onSlotClick(node.role.id); } }}
        className={cn(
          "rounded-lg border-2 px-2.5 py-1.5 text-center min-w-[72px] transition-all relative",
          !assignment && onSlotClick ? "cursor-pointer hover:scale-105" : "",
          isValidating
            ? "border-[#D4A373] bg-[#D4A373]/20 animate-pulse"
            : assignment
              ? isValidated
                ? "border-[#27BD74]/60 bg-[#27BD74]/10"
                : isFailed
                  ? "border-red-400/60 bg-red-400/10"
                  : "border-yellow-400/60 bg-yellow-400/10"
              : isOver
                ? "border-[#D4A373] bg-[#D4A373]/20 scale-105 shadow-md"
                : "border-dashed border-[#D4A373]/40 bg-[#FAF9F6]/5"
        )}
      >
        {/* Validation status indicator */}
        {assignment && (
          <div className="absolute -top-1 -right-1">
            {isValidating ? (
              <Loader2 className="h-3 w-3 text-[#D4A373] animate-spin" />
            ) : isValidated ? (
              <ShieldCheck className="h-3 w-3 text-[#27BD74]" />
            ) : isFailed ? (
              <AlertTriangle className="h-3 w-3 text-red-400" />
            ) : null}
          </div>
        )}

        {isValidating ? (
          <>
            <Loader2 className="h-4 w-4 text-[#D4A373] mx-auto animate-spin" />
            <div className="text-[8px] text-[#D4A373] mt-0.5 whitespace-nowrap">
              Validating...
            </div>
            <div className="text-[7px] text-[#FAF9F6]/50 whitespace-nowrap">
              {node.role.title}
            </div>
          </>
        ) : assignment ? (
          <>
            <div className="text-base leading-none">
              {assignment.bot.emoji}
            </div>
            <div className="text-[9px] font-semibold text-[#FAF9F6] mt-0.5 whitespace-nowrap">
              {assignment.bot.name}
            </div>
            <div className={cn(
              "text-[7px] whitespace-nowrap",
              isValidated ? "text-[#27BD74]" : isFailed ? "text-red-400" : "text-yellow-400"
            )}>
              {node.role.title}
            </div>
            {/* Skills badges on validated assignments */}
            {isValidated && assignment.bot.skills && assignment.bot.skills.length > 0 && (
              <div className="flex items-center justify-center gap-0.5 mt-0.5 flex-wrap">
                {assignment.bot.skills.slice(0, 2).map((s) => (
                  <span
                    key={s}
                    className="text-[6px] bg-[#27BD74]/20 text-[#27BD74] rounded px-1 py-0.5 truncate max-w-[40px]"
                  >
                    {s}
                  </span>
                ))}
                {assignment.bot.skills.length > 2 && (
                  <span className="text-[6px] text-[#FAF9F6]/40">
                    +{assignment.bot.skills.length - 2}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-base leading-none opacity-40">
              {node.role.defaultEmoji ?? "\uD83D\uDC64"}
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
                    validations={validations}
                    onSlotClick={onSlotClick}
                    selectedBotId={selectedBotId}
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
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);

  // Validation state per role slot
  const [validations, setValidations] = useState<Map<string, RoleValidation>>(
    new Map()
  );

  // Token retry dialog state
  const [tokenRetry, setTokenRetry] = useState<{
    roleId: string;
    bot: DetectedBot;
    error: string;
  } | null>(null);

  // Track validated count for summary
  const validatedCount = assignments.filter((a) => a.validated).length;

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

  // ─── Gateway Validation on Drop ──────────────────────────────────────

  async function runValidation(
    roleId: string,
    bot: DetectedBot,
    token?: string,
  ) {
    // Set validating state
    setValidations((prev) => {
      const next = new Map(prev);
      next.set(roleId, { state: "validating", botId: bot.id });
      return next;
    });

    const result = await validateGateway(bot.url, token);

    if (result.ok) {
      // Update bot with fetched data
      const enrichedBot: DetectedBot = {
        ...bot,
        name: result.name || bot.name,
        emoji: result.emoji || bot.emoji,
        skills: result.skills?.length ? result.skills : bot.skills,
        identityRole: result.identityRole ?? bot.identityRole,
        description: result.description ?? bot.description,
        gatewayVersion: result.gatewayVersion ?? bot.gatewayVersion,
        status: "online",
      };

      // Update the bot in detectedBots list
      setDetectedBots((prev) =>
        prev.map((b) => (b.id === bot.id ? enrichedBot : b))
      );

      // Mark assignment as validated with enriched bot data
      onAssignmentsChange(
        assignments.map((a) =>
          a.roleId === roleId
            ? { roleId, bot: enrichedBot, validated: true }
            : a
        )
      );

      setValidations((prev) => {
        const next = new Map(prev);
        next.set(roleId, { state: "success", botId: bot.id });
        return next;
      });

      // Clear token retry dialog if open
      if (tokenRetry?.roleId === roleId) {
        setTokenRetry(null);
      }
    } else {
      // Validation failed
      setValidations((prev) => {
        const next = new Map(prev);
        next.set(roleId, {
          state: "failed",
          error: result.error || "Unknown error",
          botId: bot.id,
        });
        return next;
      });

      // Show token retry dialog
      const role = getRoleById(roleId);
      setTokenRetry({
        roleId,
        bot,
        error: result.error || "Gateway validation failed",
      });
    }
  }

  // ─── DnD Handlers ────────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    const bot = event.active.data.current?.bot as DetectedBot | undefined;
    setActiveDragBot(bot ?? null);
  }

  function handleSlotClick(roleId: string) {
    if (!selectedBotId) return;
    const bot = detectedBots.find(b => b.id === selectedBotId);
    if (!bot) return;
    if (assignments.some(a => a.roleId === roleId)) return;
    const newAssignments = assignments.filter(a => a.bot.id !== bot.id);
    newAssignments.push({ roleId, bot, validated: false });
    onAssignmentsChange(newAssignments);
    setSelectedBotId(null);
    setTimeout(() => runValidation(roleId, bot), 0);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragBot(null);

    const { active, over } = event;
    if (!over) return;

    const bot = active.data.current?.bot as DetectedBot | undefined;
    const roleId = over.data.current?.roleId as string | undefined;
    if (!bot || !roleId) return;

    // Check if this role is already assigned or being validated
    if (assignments.some((a) => a.roleId === roleId)) return;
    const roleValidation = validations.get(roleId);
    if (roleValidation?.state === "validating") return;

    // Remove bot from any previous assignment
    const newAssignments = assignments.filter((a) => a.bot.id !== bot.id);
    // Add pending assignment (not yet validated)
    newAssignments.push({ roleId, bot, validated: false });
    onAssignmentsChange(newAssignments);

    // Trigger Gateway validation
    // Use setTimeout to ensure state update is committed before async validation
    setTimeout(() => runValidation(roleId, bot), 0);
  }

  function handleTokenRetry(token: string) {
    if (!tokenRetry) return;
    runValidation(tokenRetry.roleId, tokenRetry.bot, token);
  }

  function handleTokenSkip() {
    if (!tokenRetry) return;
    // Mark as validated without actual validation
    onAssignmentsChange(
      assignments.map((a) =>
        a.roleId === tokenRetry.roleId
          ? { ...a, validated: true }
          : a
      )
    );
    setValidations((prev) => {
      const next = new Map(prev);
      next.set(tokenRetry.roleId, { state: "success", botId: tokenRetry.bot.id });
      return next;
    });
    setTokenRetry(null);
  }

  function handleTokenCancel() {
    if (!tokenRetry) return;
    // Remove the failed assignment
    onAssignmentsChange(
      assignments.filter((a) => a.roleId !== tokenRetry.roleId)
    );
    setValidations((prev) => {
      const next = new Map(prev);
      next.delete(tokenRetry.roleId);
      return next;
    });
    setTokenRetry(null);
  }

  // Build org tree
  const tree = buildOrgTree(selectedRoles);
  const assignedBotIds = new Set(assignments.map((a) => a.bot.id));

  return (
    <DndContext
      collisionDetection={pointerWithin}
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
                  <div
                    key={bot.id}
                    role="button"
                    tabIndex={assignedBotIds.has(bot.id) ? -1 : 0}
                    aria-label={`Select ${bot.name ?? bot.id}`}
                    aria-pressed={selectedBotId === bot.id}
                    aria-disabled={assignedBotIds.has(bot.id)}
                    onClick={() => !assignedBotIds.has(bot.id) && setSelectedBotId(selectedBotId === bot.id ? null : bot.id)}
                    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !assignedBotIds.has(bot.id)) { e.preventDefault(); setSelectedBotId(selectedBotId === bot.id ? null : bot.id); } }}
                    className="cursor-pointer"
                  >
                    <div className={cn("rounded-lg transition-all", selectedBotId === bot.id && "ring-2 ring-[#D4A373] shadow-md")}>
                      <DraggableBotCard
                        bot={bot}
                        isAssigned={assignedBotIds.has(bot.id)}
                      />
                    </div>
                    {selectedBotId === bot.id && (
                      <div className="text-[9px] text-[#D4A373] text-center mt-0.5 animate-pulse">👆 Now click a role slot →</div>
                    )}
                  </div>
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
                <p className="text-[10px] font-semibold text-[#2C2420] flex items-center gap-1">
                  Assigned ({assignments.length})
                  {validatedCount > 0 && (
                    <span className="text-[#27BD74] flex items-center gap-0.5">
                      <ShieldCheck className="h-2.5 w-2.5" />
                      {validatedCount} verified
                    </span>
                  )}
                </p>
                {assignments.map((a) => {
                  const role = getRoleById(a.roleId);
                  const v = validations.get(a.roleId);
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
                      {/* Validation status icon */}
                      {v?.state === "validating" && (
                        <Loader2 className="h-2.5 w-2.5 text-[#D4A373] animate-spin ml-auto shrink-0" />
                      )}
                      {a.validated && (
                        <ShieldCheck className="h-2.5 w-2.5 text-[#27BD74] ml-auto shrink-0" />
                      )}
                      {v?.state === "failed" && !a.validated && (
                        <AlertTriangle className="h-2.5 w-2.5 text-red-400 ml-auto shrink-0" />
                      )}
                      <button
                        className="shrink-0 p-0.5 rounded hover:bg-red-100"
                        onClick={() => {
                          onAssignmentsChange(
                            assignments.filter((x) => x.roleId !== a.roleId)
                          );
                          setValidations((prev) => {
                            const next = new Map(prev);
                            next.delete(a.roleId);
                            return next;
                          });
                        }}
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
              Org Chart — {selectedBotId ? "Click a slot to assign" : "Click a bot then click a slot"}
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
                    validations={validations}
                    onSlotClick={selectedBotId ? handleSlotClick : undefined}
                    selectedBotId={selectedBotId}
                  />
                ))}
              </div>
            )}
            <p className="text-[9px] text-[#FAF9F6]/25 mt-4">
              {assignments.length} / {selectedRoles.length} positions filled
              {validatedCount > 0 && (
                <span className="text-[#27BD74]/60 ml-1">
                  ({validatedCount} verified)
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Drag overlay — follows cursor */}
      <DragOverlay dropAnimation={null}>
        {activeDragBot ? <BotDragOverlay bot={activeDragBot} /> : null}
      </DragOverlay>

      {/* Token retry dialog */}
      {tokenRetry && (
        <TokenRetryDialog
          botName={tokenRetry.bot.name}
          botEmoji={tokenRetry.bot.emoji}
          roleTitle={getRoleById(tokenRetry.roleId)?.title ?? tokenRetry.roleId}
          error={tokenRetry.error}
          onRetry={handleTokenRetry}
          onSkip={handleTokenSkip}
          onCancel={handleTokenCancel}
        />
      )}
    </DndContext>
  );
}

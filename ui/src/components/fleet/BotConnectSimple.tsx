/**
 * BotConnectSimple — Click-based bot connection (no drag-drop)
 * 
 * Flow:
 * 1. Click a bot on the left → bot highlighted
 * 2. Click a vacant role slot on the right → bot assigned to that role
 * 3. Gateway validation runs automatically
 * 4. Success → slot turns green with bot info
 * 5. Fail → prompt for token
 */

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  Monitor,
  RefreshCw,
  Plus,
  Key,
} from "lucide-react";
import {
  buildOrgTree,
  getAllRoles,
  type FleetRole,
  type OrgChartNode,
} from "@/lib/fleet-roles";

// ─── Types ──────────────────────────────────────────────

export interface DetectedBot {
  id: string;
  url: string;
  name: string;
  emoji: string;
  status: "online" | "offline" | "unknown";
  machine: string;
  source: string;
  skills?: string[];
  identityRole?: string | null;
  workspace?: string | null;
  soulPath?: string | null;
  identityPath?: string | null;
  installedSince?: string | null;
}

export interface BotAssignment {
  roleId: string;
  bot: DetectedBot;
  validated: boolean;
}

interface ValidationState {
  state: "validating" | "success" | "failed";
  error?: string;
}

// ─── Props ──────────────────────────────────────────────

interface BotConnectSimpleProps {
  selectedRoles: string[];
  assignments: BotAssignment[];
  onAssignmentsChange: (assignments: BotAssignment[]) => void;
}

// ─── Component ──────────────────────────────────────────

export function BotConnectSimple({
  selectedRoles,
  assignments,
  onAssignmentsChange,
}: BotConnectSimpleProps) {
  const [detectedBots, setDetectedBots] = useState<DetectedBot[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [validations, setValidations] = useState<Map<string, ValidationState>>(new Map());
  const [tokenDialog, setTokenDialog] = useState<{ roleId: string; bot: DetectedBot } | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);

  // Auto-scan on mount
  useEffect(() => { runScan(); }, []);

  async function runScan() {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/fleet/discover");
      if (res.ok) {
        const data = await res.json();
        setDetectedBots(data.bots || []);
      } else {
        setScanError(`Scan failed (${res.status})`);
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Network error during scan");
    }
    setScanning(false);
  }

  function handleBotClick(bot: DetectedBot) {
    if (assignedBotIds.has(bot.id)) return;
    setSelectedBotId(selectedBotId === bot.id ? null : bot.id);
  }

  function handleSlotClick(roleId: string) {
    if (!selectedBotId) return;
    const bot = detectedBots.find(b => b.id === selectedBotId);
    if (!bot) return;
    if (assignments.some(a => a.roleId === roleId)) return;

    // Assign bot to role
    const newAssignments = assignments.filter(a => a.bot.id !== bot.id);
    newAssignments.push({ roleId, bot, validated: false });
    onAssignmentsChange(newAssignments);
    setSelectedBotId(null);

    // Validate
    runValidation(roleId, bot);
  }

  async function runValidation(roleId: string, bot: DetectedBot, token?: string) {
    setValidations(prev => new Map(prev).set(roleId, { state: "validating" }));

    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(bot.url + "/health", {
        headers,
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        setValidations(prev => new Map(prev).set(roleId, { state: "success" }));
        onAssignmentsChange(
          assignments.map(a => a.roleId === roleId ? { ...a, validated: true } : a)
        );
        setTokenDialog(null);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      if (!token) {
        // First try failed, ask for token
        setTokenDialog({ roleId, bot });
        setValidations(prev => new Map(prev).set(roleId, { state: "failed", error: "Token required" }));
      } else {
        setValidations(prev => new Map(prev).set(roleId, { state: "failed", error: String(err) }));
      }
    }
  }

  function handleTokenSubmit() {
    if (!tokenDialog || !tokenInput.trim()) return;
    runValidation(tokenDialog.roleId, tokenDialog.bot, tokenInput.trim());
    setTokenInput("");
  }

  function handleRemoveAssignment(roleId: string) {
    onAssignmentsChange(assignments.filter(a => a.roleId !== roleId));
    setValidations(prev => { const n = new Map(prev); n.delete(roleId); return n; });
  }

  const tree = buildOrgTree(selectedRoles);
  const assignedBotIds = new Set(assignments.map(a => a.bot.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row gap-4">
        {/* ─── Left: Detected Bots ─── */}
        <div className="md:w-[40%] space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-[#2C2420] flex items-center gap-1.5">
              <Monitor className="h-3.5 w-3.5 text-[#D4A373]" />
              Detected Bots
            </h4>
            <button onClick={runScan} disabled={scanning} className="text-[10px] text-[#D4A373] hover:text-[#B08968] flex items-center gap-1">
              <RefreshCw className={cn("h-3 w-3", scanning && "animate-spin")} />
              {scanning ? "Scanning..." : "Rescan"}
            </button>
          </div>

          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {detectedBots.map(bot => {
              const isAssigned = assignedBotIds.has(bot.id);
              const isSelected = selectedBotId === bot.id;

              return (
                <div
                  key={bot.id}
                  onClick={() => handleBotClick(bot)}
                  className={cn(
                    "rounded-lg border p-3 transition-all cursor-pointer",
                    isAssigned
                      ? "border-[#27BD74]/40 bg-[#27BD74]/5 opacity-50 cursor-not-allowed"
                      : isSelected
                        ? "border-[#D4A373] bg-[#D4A373]/10 ring-2 ring-[#D4A373] shadow-md"
                        : "border-[#E0E0E0] bg-white hover:border-[#D4A373]/60 hover:shadow-sm"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{bot.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#2C2420] truncate">{bot.name}</div>
                      <div className="text-[10px] text-[#948F8C]">{bot.machine} · {bot.url}</div>
                      {bot.identityRole && (
                        <div className="text-[10px] text-[#D4A373]">{bot.identityRole}</div>
                      )}
                      {bot.installedSince && (
                        <div className="text-[10px] text-[#948F8C]">
                          Since {new Date(bot.installedSince).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div className={cn("h-2 w-2 rounded-full", bot.status === "online" ? "bg-green-400" : "bg-gray-300")} />
                  </div>
                  {isAssigned && <div className="text-[9px] text-[#27BD74] mt-1">✓ Assigned</div>}
                  {isSelected && <div className="text-[9px] text-[#D4A373] mt-1 animate-pulse">👆 Now click a role slot on the right →</div>}
                </div>
              );
            })}

            {scanError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600 flex items-center gap-1.5">
                <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
                {scanError}
              </div>
            )}

            {detectedBots.length === 0 && !scanning && !scanError && (
              <div className="rounded-lg border border-dashed border-[#E0E0E0] p-4 text-center text-xs text-[#948F8C]">
                No bots detected. Click Rescan or add manually.
              </div>
            )}
          </div>
        </div>

        {/* ─── Right: Org Chart ─── */}
        <div className="md:w-[60%]">
          <h4 className="text-xs font-semibold text-[#2C2420] mb-3 flex items-center gap-1.5">
            {selectedBotId
              ? <span className="text-[#D4A373] animate-pulse">👇 Click a slot to assign the bot</span>
              : "Org Chart — Click a bot first, then click a slot"
            }
          </h4>

          <div className="flex flex-col items-center gap-2">
            {tree.map(node => (
              <OrgSlot
                key={node.role.id}
                node={node}
                assignments={assignments}
                validations={validations}
                selectedBotId={selectedBotId}
                onSlotClick={handleSlotClick}
                onRemove={handleRemoveAssignment}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Token Dialog */}
      {tokenDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-[#2C2420] mb-2 flex items-center gap-2">
              <Key className="h-4 w-4 text-[#D4A373]" />
              Gateway Token Required
            </h3>
            <p className="text-xs text-[#948F8C] mb-3">
              {tokenDialog.bot.name} needs a gateway token to connect.
            </p>
            <input
              type="password"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="Enter gateway token"
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
              onKeyDown={e => e.key === "Enter" && handleTokenSubmit()}
            />
            <div className="flex gap-2">
              <button onClick={handleTokenSubmit} className="flex-1 bg-[#D4A373] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#B08968]">
                Connect
              </button>
              <button onClick={() => {
                setTokenDialog(null);
                // Mark as validated anyway (skip token)
                onAssignmentsChange(assignments.map(a => a.roleId === tokenDialog.roleId ? { ...a, validated: true } : a));
                setValidations(prev => new Map(prev).set(tokenDialog.roleId, { state: "success" }));
              }} className="flex-1 border rounded-lg py-2 text-sm text-[#948F8C] hover:bg-gray-50">
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Org Chart Slot ─────────────────────────────────────

function OrgSlot({
  node,
  assignments,
  validations,
  selectedBotId,
  onSlotClick,
  onRemove,
}: {
  node: OrgChartNode;
  assignments: BotAssignment[];
  validations: Map<string, ValidationState>;
  selectedBotId: string | null;
  onSlotClick: (roleId: string) => void;
  onRemove: (roleId: string) => void;
}) {
  const assignment = assignments.find(a => a.roleId === node.role.id);
  const validation = validations.get(node.role.id);
  const isValidating = validation?.state === "validating";
  const isSuccess = validation?.state === "success";
  const isFailed = validation?.state === "failed";
  const canClick = !!selectedBotId && !assignment;

  return (
    <div className="flex flex-col items-center">
      <div
        onClick={() => canClick && onSlotClick(node.role.id)}
        className={cn(
          "rounded-xl border-2 px-4 py-3 text-center min-w-[100px] transition-all relative",
          isValidating && "border-[#D4A373] bg-[#D4A373]/20 animate-pulse",
          assignment && isSuccess && "border-[#27BD74] bg-[#27BD74]/10",
          assignment && isFailed && "border-red-400 bg-red-50",
          assignment && !isValidating && !isSuccess && !isFailed && "border-yellow-400 bg-yellow-50",
          !assignment && canClick && "border-[#D4A373] bg-[#D4A373]/5 cursor-pointer hover:scale-105 hover:shadow-lg hover:bg-[#D4A373]/15",
          !assignment && !canClick && "border-dashed border-[#D4A373]/30 bg-[#FAF9F6]",
        )}
      >
        {isValidating ? (
          <Loader2 className="h-5 w-5 text-[#D4A373] mx-auto animate-spin" />
        ) : assignment ? (
          <>
            <div className="text-xl">{assignment.bot.emoji}</div>
            <div className="text-xs font-semibold text-[#2C2420] mt-1">{assignment.bot.name}</div>
            <div className={cn("text-[10px] mt-0.5", isSuccess ? "text-[#27BD74]" : isFailed ? "text-red-400" : "text-yellow-500")}>
              {isSuccess ? "✓ Connected" : isFailed ? "✗ Failed" : "Connecting..."}
            </div>
            <button onClick={(e) => { e.stopPropagation(); onRemove(node.role.id); }} aria-label={`Remove ${assignment.bot.name}`} title={`Remove ${assignment.bot.name}`} className="absolute -top-1 -right-1 h-4 w-4 bg-red-400 text-white rounded-full text-[8px] flex items-center justify-center hover:bg-red-500">
              ✕
            </button>
          </>
        ) : (
          <>
            <div className="text-lg opacity-30">{node.role.id === "ceo" ? "👑" : "📋"}</div>
            <div className="text-[10px] font-medium text-[#2C2420]/60">{node.role.title}</div>
            <div className="text-[8px] text-[#948F8C]">{node.role.subtitle}</div>
            {canClick && <div className="text-[8px] text-[#D4A373] mt-1 animate-pulse">Click to assign</div>}
          </>
        )}
      </div>

      {/* Children */}
      {node.children.length > 0 && (
        <div className="flex flex-col items-center mt-1">
          <div className="w-px h-3 bg-[#D4A373]/30" />
          <div className="flex gap-3">
            {node.children.map(child => (
              <OrgSlot
                key={child.role.id}
                node={child}
                assignments={assignments}
                validations={validations}
                selectedBotId={selectedBotId}
                onSlotClick={onSlotClick}
                onRemove={onRemove}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

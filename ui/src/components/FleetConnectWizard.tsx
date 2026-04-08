/**
 * FleetConnectWizard — Onboarding wizard v2 for connecting OpenClaw bots.
 *
 * Flow:
 * 1. Create Fleet (name, description, brand color)
 * 2. Connect First Bot (Gateway URL + Token, connection test)
 * 3. Bot Profile (auto-filled from IDENTITY.md/SOUL.md)
 * 4. Add More Bots / Share Invite Link
 *
 * Uses Pain Point brand colors + glassmorphism.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Check,
  X,
  Wifi,
  WifiOff,
  Shield,
  Server,
  Link2,
  Copy,
  ArrowRight,
  ArrowLeft,
  Plus,
  Zap,
  Brain,
  Wrench,
  Clock,
  Globe,
} from "lucide-react";

// ─── Design tokens ─────────────────────────────────────────────────────────

const brand = {
  primary: "#D4A373",
  secondary: "#B08968",
  foreground: "#2C2420",
  background: "#FAF9F6",
  border: "#E0E0E0",
  tealMedium: "#2A9D8F",
  tealDark: "#264653",
};

const card = cn(
  "bg-[#FAF9F6]/90 backdrop-blur-md rounded-2xl border border-[#E0E0E0]/50",
  "shadow-sm",
);

// ─── Types ─────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4;

interface ConnectionTestResult {
  reachable: boolean;
  authValid: boolean;
  protocolVersion: number | null;
  gatewayVersion: string | null;
  rpcMethodCount: number;
  eventCount: number;
  error?: string;
}

interface BotProfile {
  name: string;
  role: string;
  title: string;
  identity: string;
  skillCount: number;
  skills: string[];
  channels: string[];
  memoryCount: number;
  cronCount: number;
}

// ─── Props ─────────────────────────────────────────────────────────────────

interface FleetConnectWizardProps {
  onComplete: (fleet: { name: string; bots: Array<{ url: string; token: string; profile: BotProfile }> }) => void;
  onCancel: () => void;
}

// ─── Step Indicator ────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const steps = [
    { num: 1, label: "Create Fleet" },
    { num: 2, label: "Connect Bot" },
    { num: 3, label: "Bot Profile" },
    { num: 4, label: "Add More" },
  ];

  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((step, i) => (
        <div key={step.num} className="flex items-center gap-2">
          <div
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
              currentStep >= step.num
                ? "text-white"
                : "text-[#2C2420]/40 border border-[#E0E0E0]",
            )}
            style={
              currentStep >= step.num
                ? { background: `linear-gradient(135deg, ${brand.primary}, ${brand.secondary})` }
                : undefined
            }
          >
            {currentStep > step.num ? <Check className="w-4 h-4" /> : step.num}
          </div>
          <span
            className="text-xs font-medium hidden sm:inline"
            style={{ color: currentStep >= step.num ? brand.foreground : `${brand.foreground}40` }}
          >
            {step.label}
          </span>
          {i < steps.length - 1 && (
            <div
              className="w-8 h-0.5 rounded"
              style={{
                background: currentStep > step.num ? brand.primary : `${brand.border}`,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function FleetConnectWizard({ onComplete, onCancel }: FleetConnectWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1: Fleet
  const [fleetName, setFleetName] = useState("");
  const [fleetDescription, setFleetDescription] = useState("");

  // Step 2: Connection
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  // Step 3: Profile
  const [botProfile, setBotProfile] = useState<BotProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Step 4: Additional bots & invite
  const [connectedBots, setConnectedBots] = useState<
    Array<{ url: string; token: string; profile: BotProfile }>
  >([]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ─── Step 2: Connection Test ───────────────────────────────────────────

  const testConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/fleet-monitor/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ gatewayUrl, authToken }),
      });
      const data = await response.json();

      if (data.ok) {
        setTestResult({
          reachable: true,
          authValid: true,
          protocolVersion: data.protocolVersion ?? 3,
          gatewayVersion: data.gatewayVersion ?? null,
          rpcMethodCount: data.rpcMethodCount ?? 0,
          eventCount: data.eventCount ?? 0,
        });
      } else {
        setTestResult({
          reachable: data.reachable ?? false,
          authValid: data.authValid ?? false,
          protocolVersion: null,
          gatewayVersion: null,
          rpcMethodCount: 0,
          eventCount: 0,
          error: data.error ?? "Connection failed",
        });
      }
    } catch (err) {
      setTestResult({
        reachable: false,
        authValid: false,
        protocolVersion: null,
        gatewayVersion: null,
        rpcMethodCount: 0,
        eventCount: 0,
        error: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setTesting(false);
    }
  }, [gatewayUrl, authToken]);

  // ─── Step 3: Load Profile ──────────────────────────────────────────────

  const loadBotProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      // Use fleet-monitor's connect + query endpoints
      const res = await fetch("/api/fleet-monitor/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ gatewayUrl, authToken }),
      });
      const data = await res.json();

      setBotProfile({
        name: data.name ?? "Unknown Bot",
        role: data.role ?? "general",
        title: data.title ?? "",
        identity: data.identity ?? "",
        skillCount: data.skills?.length ?? 0,
        skills: data.skills ?? [],
        channels: data.channels ?? [],
        memoryCount: data.memoryCount ?? 0,
        cronCount: data.cronCount ?? 0,
      });
    } catch {
      // Fallback profile
      setBotProfile({
        name: "OpenClaw Bot",
        role: "general",
        title: "AI Assistant",
        identity: "Connected via " + gatewayUrl,
        skillCount: 0,
        skills: [],
        channels: [],
        memoryCount: 0,
        cronCount: 0,
      });
    } finally {
      setLoadingProfile(false);
    }
  }, [gatewayUrl, authToken]);

  // ─── Step transitions ──────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (step === 2 && testResult?.reachable) {
      loadBotProfile();
    }
    if (step === 3 && botProfile) {
      setConnectedBots((prev) => [
        ...prev,
        { url: gatewayUrl, token: authToken, profile: botProfile },
      ]);
    }
    setStep((s) => Math.min(s + 1, 4) as WizardStep);
  }, [step, testResult, botProfile, gatewayUrl, authToken, loadBotProfile]);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 1) as WizardStep);
  }, []);

  const canProceed =
    (step === 1 && fleetName.trim().length > 0) ||
    (step === 2 && testResult?.reachable && testResult?.authValid) ||
    (step === 3 && botProfile !== null) ||
    step === 4;

  // ─── Invite Link ───────────────────────────────────────────────────────

  const generateInviteLink = useCallback(async () => {
    try {
      const res = await fetch("/api/fleet-monitor/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fleetName }),
      });
      const data = await res.json();
      setInviteLink(data.link ?? `${window.location.origin}/join/${crypto.randomUUID().slice(0, 12)}`);
    } catch {
      /* API unavailable — generate a local placeholder invite link */
      setInviteLink(`${window.location.origin}/join/${crypto.randomUUID().slice(0, 12)}`);
    }
  }, [fleetName]);

  const copyInviteLink = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard API may be unavailable in insecure contexts */
    }
  }, [inviteLink]);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: `${brand.foreground}40`, backdropFilter: "blur(8px)" }}
    >
      <div className={cn("w-full max-w-2xl max-h-[90vh] overflow-y-auto", card, "p-8")}>
        {/* Close */}
        <div className="flex justify-end">
          <button onClick={onCancel} aria-label="Close wizard" className="p-1 rounded-lg hover:bg-black/5">
            <X className="w-5 h-5" style={{ color: `${brand.foreground}60` }} />
          </button>
        </div>

        <StepIndicator currentStep={step} />

        {/* ─── Step 1: Create Fleet ──────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold" style={{ color: brand.foreground }}>
                Create Your Fleet
              </h2>
              <p className="text-sm mt-1" style={{ color: `${brand.foreground}80` }}>
                A fleet is a collection of OpenClaw bots you manage together.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: brand.foreground }}>
                  Fleet Name
                </label>
                <input
                  className="w-full px-4 py-3 rounded-xl border border-[#E0E0E0] bg-white/50 text-sm focus:outline-none focus:border-[#D4A373]"
                  placeholder="Pain Point Bot 車隊"
                  value={fleetName}
                  onChange={(e) => setFleetName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: brand.foreground }}>
                  Description
                </label>
                <textarea
                  className="w-full px-4 py-3 rounded-xl border border-[#E0E0E0] bg-white/50 text-sm focus:outline-none focus:border-[#D4A373] resize-none min-h-[80px]"
                  placeholder="管理所有 Pain Point AI 客服 bot"
                  value={fleetDescription}
                  onChange={(e) => setFleetDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: brand.foreground }}>
                  Brand Color
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl" style={{ background: brand.primary }} />
                  <span className="text-sm font-mono" style={{ color: `${brand.foreground}80` }}>
                    {brand.primary}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ background: `${brand.primary}20`, color: brand.primary }}>
                    Pain Point Gold
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Step 2: Connect Bot ───────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold" style={{ color: brand.foreground }}>
                Connect Your First Bot
              </h2>
              <p className="text-sm mt-1" style={{ color: `${brand.foreground}80` }}>
                Enter your OpenClaw Gateway URL and authentication token.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: brand.foreground }}>
                  Gateway URL
                </label>
                <input
                  className="w-full px-4 py-3 rounded-xl border border-[#E0E0E0] bg-white/50 text-sm font-mono focus:outline-none focus:border-[#D4A373]"
                  placeholder="ws://192.168.50.73:18789"
                  value={gatewayUrl}
                  onChange={(e) => { setGatewayUrl(e.target.value); setTestResult(null); }}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: brand.foreground }}>
                  Auth Token
                </label>
                <input
                  type="password"
                  className="w-full px-4 py-3 rounded-xl border border-[#E0E0E0] bg-white/50 text-sm font-mono focus:outline-none focus:border-[#D4A373]"
                  placeholder="Enter gateway token"
                  value={authToken}
                  onChange={(e) => { setAuthToken(e.target.value); setTestResult(null); }}
                />
              </div>

              {/* Test Button */}
              <Button
                onClick={testConnection}
                disabled={!gatewayUrl || testing}
                className="w-full rounded-xl text-white py-3"
                style={{ background: `linear-gradient(135deg, ${brand.tealDark}, ${brand.tealMedium})` }}
              >
                {testing ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing Connection...</>
                ) : (
                  <><Zap className="w-4 h-4 mr-2" /> Test Connection</>
                )}
              </Button>

              {/* Test Results */}
              {testResult && (
                <div className={cn(card, "p-4 space-y-2")}>
                  <TestResultRow
                    label="Gateway reachable"
                    passed={testResult.reachable}
                    icon={testResult.reachable ? Wifi : WifiOff}
                  />
                  <TestResultRow
                    label="Auth valid (operator.read scope)"
                    passed={testResult.authValid}
                    icon={Shield}
                  />
                  {testResult.protocolVersion && (
                    <TestResultRow
                      label={`Protocol v${testResult.protocolVersion} compatible`}
                      passed={true}
                      icon={Check}
                    />
                  )}
                  {testResult.gatewayVersion && (
                    <TestResultRow
                      label={`Gateway ${testResult.gatewayVersion}`}
                      passed={true}
                      icon={Server}
                    />
                  )}
                  {testResult.rpcMethodCount > 0 && (
                    <div className="text-xs pt-1 border-t border-[#E0E0E0]/50" style={{ color: `${brand.foreground}80` }}>
                      Supported: {testResult.rpcMethodCount} RPC methods, {testResult.eventCount} events
                    </div>
                  )}
                  {testResult.error && (
                    <div className="text-xs text-red-500 pt-1 border-t border-[#E0E0E0]/50">
                      {testResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Step 3: Bot Profile ───────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold" style={{ color: brand.foreground }}>
                Bot Profile
              </h2>
              <p className="text-sm mt-1" style={{ color: `${brand.foreground}80` }}>
                Auto-filled from IDENTITY.md and SOUL.md. You can adjust.
              </p>
            </div>

            {loadingProfile ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: brand.primary }} />
                <p className="text-sm" style={{ color: `${brand.foreground}60` }}>
                  Reading bot identity...
                </p>
              </div>
            ) : botProfile ? (
              <div className="space-y-4">
                {/* Bot avatar placeholder */}
                <div className="flex items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${brand.primary}, ${brand.secondary})` }}
                  >
                    <span className="text-2xl">🤖</span>
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      className="w-full px-3 py-2 rounded-xl border border-[#E0E0E0] bg-white/50 text-sm font-medium"
                      value={botProfile.name}
                      onChange={(e) => setBotProfile((p) => p ? { ...p, name: e.target.value } : p)}
                    />
                    <div className="flex gap-2">
                      <select
                        className="px-3 py-2 rounded-xl border border-[#E0E0E0] bg-white/50 text-sm"
                        value={botProfile.role}
                        onChange={(e) => setBotProfile((p) => p ? { ...p, role: e.target.value } : p)}
                      >
                        <option value="general">General</option>
                        <option value="customer_service">Customer Service</option>
                        <option value="sales">Sales</option>
                        <option value="engineering">Engineering</option>
                        <option value="marketing">Marketing</option>
                        <option value="operations">Operations</option>
                        <option value="ceo">CEO</option>
                      </select>
                      <input
                        className="flex-1 px-3 py-2 rounded-xl border border-[#E0E0E0] bg-white/50 text-sm"
                        placeholder="Title"
                        value={botProfile.title}
                        onChange={(e) => setBotProfile((p) => p ? { ...p, title: e.target.value } : p)}
                      />
                    </div>
                  </div>
                </div>

                {/* Identity preview */}
                {botProfile.identity && (
                  <div className={cn(card, "p-4")}>
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="w-4 h-4" style={{ color: brand.tealMedium }} />
                      <span className="text-xs font-medium" style={{ color: brand.tealMedium }}>
                        Identity (from IDENTITY.md)
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: brand.foreground }}>
                      {botProfile.identity}
                    </p>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-4 gap-3">
                  <StatBox icon={Wrench} label="Skills" value={botProfile.skillCount} />
                  <StatBox icon={Globe} label="Channels" value={botProfile.channels.length} />
                  <StatBox icon={Brain} label="Memories" value={botProfile.memoryCount} />
                  <StatBox icon={Clock} label="Cron Jobs" value={botProfile.cronCount} />
                </div>

                {/* Skills list */}
                {botProfile.skills.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {botProfile.skills.map((s) => (
                      <span
                        key={s}
                        className="text-xs px-2 py-1 rounded-full"
                        style={{ background: `${brand.tealMedium}15`, color: brand.tealMedium }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {/* Channels */}
                {botProfile.channels.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: `${brand.foreground}60` }}>Channels:</span>
                    {botProfile.channels.map((ch) => (
                      <span
                        key={ch}
                        className="text-xs px-2 py-1 rounded-full font-medium"
                        style={{ background: `${brand.primary}15`, color: brand.primary }}
                      >
                        {ch}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* ─── Step 4: Add More ──────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold" style={{ color: brand.foreground }}>
                Your Fleet
              </h2>
              <p className="text-sm mt-1" style={{ color: `${brand.foreground}80` }}>
                Add more bots or generate an invite link.
              </p>
            </div>

            {/* Connected bots */}
            <div className="space-y-2">
              {connectedBots.map((bot, i) => (
                <div key={i} className={cn(card, "p-4 flex items-center gap-3")}>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${brand.primary}, ${brand.secondary})` }}
                  >
                    <span className="text-lg">🤖</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: brand.foreground }}>
                      {bot.profile.name}
                    </p>
                    <p className="text-xs" style={{ color: `${brand.foreground}60` }}>
                      {bot.profile.title || bot.profile.role} — {bot.url}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-xs text-green-600">Online</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Add another / Invite */}
            <div className="grid grid-cols-2 gap-4">
              <button
                className={cn(card, "p-6 text-center hover:-translate-y-0.5 transition-all cursor-pointer")}
                onClick={() => {
                  setGatewayUrl("");
                  setAuthToken("");
                  setTestResult(null);
                  setBotProfile(null);
                  setStep(2);
                }}
              >
                <Plus className="w-8 h-8 mx-auto mb-2" style={{ color: brand.primary }} />
                <p className="text-sm font-medium" style={{ color: brand.foreground }}>
                  Connect Another Bot
                </p>
              </button>

              <button
                className={cn(card, "p-6 text-center hover:-translate-y-0.5 transition-all cursor-pointer")}
                onClick={generateInviteLink}
              >
                <Link2 className="w-8 h-8 mx-auto mb-2" style={{ color: brand.tealMedium }} />
                <p className="text-sm font-medium" style={{ color: brand.foreground }}>
                  Generate Invite Link
                </p>
              </button>
            </div>

            {/* Invite link */}
            {inviteLink && (
              <div className={cn(card, "p-4 flex items-center gap-3")}>
                <input
                  className="flex-1 px-3 py-2 rounded-xl border border-[#E0E0E0] bg-white/50 text-sm font-mono"
                  readOnly
                  value={inviteLink}
                />
                <Button
                  size="sm"
                  onClick={copyInviteLink}
                  aria-label={copied ? "Copied" : "Copy invite link"}
                  className="rounded-xl"
                  style={{ background: copied ? brand.tealMedium : brand.primary, color: "white" }}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ─── Navigation ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#E0E0E0]/50">
          <Button
            variant="outline"
            onClick={step === 1 ? onCancel : goBack}
            className="rounded-xl"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {step === 1 ? "Cancel" : "Back"}
          </Button>

          {step < 4 ? (
            <Button
              onClick={goNext}
              disabled={!canProceed}
              className="rounded-xl text-white"
              style={{ background: `linear-gradient(135deg, ${brand.primary}, ${brand.secondary})` }}
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={() => onComplete({ name: fleetName, bots: connectedBots })}
              className="rounded-xl text-white"
              style={{ background: `linear-gradient(135deg, ${brand.primary}, ${brand.secondary})` }}
            >
              Go to Dashboard
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helper Components ─────────────────────────────────────────────────────

function TestResultRow({
  label,
  passed,
  icon: Icon,
}: {
  label: string;
  passed: boolean;
  icon: typeof Check;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "w-5 h-5 rounded-full flex items-center justify-center",
          passed ? "bg-green-100" : "bg-red-100",
        )}
      >
        {passed ? (
          <Check className="w-3 h-3 text-green-600" />
        ) : (
          <X className="w-3 h-3 text-red-500" />
        )}
      </div>
      <span className="text-sm" style={{ color: brand.foreground }}>
        {label}
      </span>
    </div>
  );
}

function StatBox({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wrench;
  label: string;
  value: number;
}) {
  return (
    <div className={cn(card, "p-3 text-center")}>
      <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: brand.primary }} />
      <p className="text-lg font-bold" style={{ color: brand.foreground }}>
        {value}
      </p>
      <p className="text-xs" style={{ color: `${brand.foreground}60` }}>
        {label}
      </p>
    </div>
  );
}

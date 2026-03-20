/**
 * SecretsVaultWidget — Fleet-wide secret management dashboard.
 *
 * Displays: secret health summary, expiring/out-of-sync alerts,
 * secret list with assignment status, rotation history.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Shield,
  Key,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Eye,
  EyeOff,
  Clock,
  Upload,
  Trash2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/context/CompanyContext";
import { MetricCard } from "@/components/MetricCard";
import { fleetCardStyles, severityColors, brandColors } from "./design-tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VaultSecretSummary {
  id: string;
  name: string;
  category: string;
  description: string;
  assignedBotCount: number;
  totalBots: number;
  lastRotated: string;
  expiresIn: string | null;
  syncStatus: "all_synced" | "some_out_of_sync" | "push_failed";
  tags: string[];
}

interface HealthAlert {
  secretName: string;
  alertType: "expiring" | "expired" | "never_rotated" | "out_of_sync" | "overexposed";
  severity: "critical" | "high" | "medium" | "low";
  details: string;
}

interface RotationEvent {
  secretName: string;
  rotatedBy: string;
  reason: string;
  affectedBots: number;
  successfulPushes: number;
  failedPushes: number;
  rotatedAt: string;
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_SECRETS: VaultSecretSummary[] = [
  { id: "s1", name: "OPENAI_API_KEY", category: "api_key", description: "OpenAI API access", assignedBotCount: 5, totalBots: 5, lastRotated: "12 days ago", expiresIn: null, syncStatus: "some_out_of_sync", tags: ["critical", "ai"] },
  { id: "s2", name: "STRIPE_SECRET_KEY", category: "api_key", description: "Stripe payment processing", assignedBotCount: 3, totalBots: 5, lastRotated: "87 days ago", expiresIn: "3 days", syncStatus: "all_synced", tags: ["payments"] },
  { id: "s3", name: "SUPABASE_KEY", category: "api_key", description: "Supabase database access", assignedBotCount: 2, totalBots: 5, lastRotated: "5 days ago", expiresIn: null, syncStatus: "all_synced", tags: ["database"] },
  { id: "s4", name: "LINE_CHANNEL_TOKEN", category: "oauth_token", description: "LINE Messaging API", assignedBotCount: 1, totalBots: 5, lastRotated: "30 days ago", expiresIn: "60 days", syncStatus: "all_synced", tags: ["channel"] },
  { id: "s5", name: "TELEGRAM_BOT_TOKEN", category: "oauth_token", description: "Telegram Bot API", assignedBotCount: 1, totalBots: 5, lastRotated: "45 days ago", expiresIn: null, syncStatus: "all_synced", tags: ["channel"] },
  { id: "s6", name: "WEBHOOK_SECRET", category: "webhook_secret", description: "Inbound webhook validation", assignedBotCount: 4, totalBots: 5, lastRotated: "3 days ago", expiresIn: null, syncStatus: "all_synced", tags: ["integration"] },
];

const MOCK_ALERTS: HealthAlert[] = [
  { secretName: "STRIPE_SECRET_KEY", alertType: "expiring", severity: "critical", details: "Expires in 3 days (2026-03-22). Last rotated 87 days ago." },
  { secretName: "OPENAI_API_KEY", alertType: "out_of_sync", severity: "high", details: "Value on 🐿️ 飛鼠 does not match vault (hash mismatch)." },
];

const MOCK_ROTATIONS: RotationEvent[] = [
  { secretName: "WEBHOOK_SECRET", rotatedBy: "auto", reason: "scheduled", affectedBots: 4, successfulPushes: 4, failedPushes: 0, rotatedAt: "3 days ago" },
  { secretName: "SUPABASE_KEY", rotatedBy: "Alex", reason: "manual", affectedBots: 2, successfulPushes: 2, failedPushes: 0, rotatedAt: "5 days ago" },
  { secretName: "OPENAI_API_KEY", rotatedBy: "auto", reason: "scheduled", affectedBots: 5, successfulPushes: 4, failedPushes: 1, rotatedAt: "12 days ago" },
];

// ---------------------------------------------------------------------------
// Secret Row
// ---------------------------------------------------------------------------

function SecretRow({ secret, onRotate, onPush }: {
  secret: VaultSecretSummary;
  onRotate: (id: string) => void;
  onPush: (id: string) => void;
}) {
  const categoryIcons: Record<string, string> = {
    api_key: "🔑",
    oauth_token: "🎫",
    password: "🔒",
    certificate: "📜",
    webhook_secret: "🪝",
    custom: "⚙️",
  };

  const syncBadge =
    secret.syncStatus === "all_synced"
      ? { bg: "bg-[#2A9D8F]/10", text: "text-[#2A9D8F]", label: `✓ ${secret.assignedBotCount}/${secret.totalBots}` }
      : secret.syncStatus === "some_out_of_sync"
        ? { bg: "bg-[#D4A373]/10", text: "text-[#9A7B5B]", label: `⚠ ${secret.assignedBotCount}/${secret.totalBots}` }
        : { bg: "bg-red-50", text: "text-red-600", label: `✗ Failed` };

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-[#F5F0EB]/50 transition-colors border-b border-[#E0E0E0]/30 last:border-0">
      <span className="text-base">{categoryIcons[secret.category] ?? "⚙️"}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-medium text-[#2C2420]">{secret.name}</span>
          {secret.tags.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#E0F2F1] text-[#264653]">{t}</span>
          ))}
        </div>
        <div className="flex gap-3 mt-0.5 text-[10px] text-[#948F8C]">
          <span>Rotated {secret.lastRotated}</span>
          {secret.expiresIn && (
            <span className={secret.expiresIn.includes("3 day") || secret.expiresIn.includes("1 day") || secret.expiresIn.includes("expired") ? "text-red-500 font-medium" : ""}>
              Expires in {secret.expiresIn}
            </span>
          )}
        </div>
      </div>
      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", syncBadge.bg, syncBadge.text)}>
        {syncBadge.label}
      </span>
      <div className="flex gap-1 shrink-0">
        <button
          onClick={() => onRotate(secret.id)}
          className="p-1 rounded hover:bg-[#D4A373]/10 transition-colors"
          title="Rotate"
        >
          <RefreshCw className="h-3.5 w-3.5 text-[#948F8C]" />
        </button>
        {secret.syncStatus !== "all_synced" && (
          <button
            onClick={() => onPush(secret.id)}
            className="p-1 rounded hover:bg-[#2A9D8F]/10 transition-colors"
            title="Push to bots"
          >
            <Upload className="h-3.5 w-3.5 text-[#2A9D8F]" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alert Card
// ---------------------------------------------------------------------------

function VaultAlertCard({ alert }: { alert: HealthAlert }) {
  const sev = alert.severity === "critical" ? severityColors.critical :
              alert.severity === "high" ? severityColors.warning : severityColors.info;

  const typeLabels: Record<string, string> = {
    expiring: "Expiring Soon",
    expired: "Expired",
    never_rotated: "Never Rotated",
    out_of_sync: "Out of Sync",
    overexposed: "Over-Exposed",
  };

  return (
    <div className={cn("rounded-xl border-l-4 p-3", sev.bg, sev.border)}>
      <div className="flex items-start gap-2">
        <AlertTriangle className={cn("h-4 w-4 shrink-0 mt-0.5", sev.text)} />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-medium text-[#2C2420]">{alert.secretName}</span>
            <span className={cn("text-[10px] font-medium", sev.text)}>{typeLabels[alert.alertType] ?? alert.alertType}</span>
          </div>
          <p className="text-xs text-[#948F8C] mt-0.5">{alert.details}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rotation History
// ---------------------------------------------------------------------------

function RotationRow({ event }: { event: RotationEvent }) {
  const success = event.failedPushes === 0;
  return (
    <div className="flex items-center gap-2 py-1.5 text-xs">
      {success ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-[#2A9D8F]" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-[#D4A373]" />
      )}
      <span className="font-mono text-[#2C2420]">{event.secretName}</span>
      <span className="text-[#948F8C]">by {event.rotatedBy}</span>
      <span className="text-[#948F8C]">({event.reason})</span>
      <span className="ml-auto text-[#948F8C]">
        {event.successfulPushes}/{event.affectedBots} bots
      </span>
      <span className="text-[10px] text-[#B8ADA2]">{event.rotatedAt}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export function SecretsVaultWidget() {
  const company = useCompany();
  const [secrets, setSecrets] = useState<VaultSecretSummary[]>(MOCK_SECRETS);
  const [alerts, setAlerts] = useState<HealthAlert[]>(MOCK_ALERTS);
  const [rotations, setRotations] = useState<RotationEvent[]>(MOCK_ROTATIONS);

  const synced = secrets.filter((s) => s.syncStatus === "all_synced").length;
  const expiring = alerts.filter((a) => a.alertType === "expiring" || a.alertType === "expired").length;
  const outOfSync = alerts.filter((a) => a.alertType === "out_of_sync").length;

  const handleRotate = (_id: string) => {
    // Future: POST /api/fleet-monitor/secrets/:id/rotate
  };
  const handlePush = (_id: string) => {
    // Future: POST /api/fleet-monitor/secrets/:id/push
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-[#D4A373]" />
          <h2 className="text-lg font-semibold text-[#2C2420]">Fleet Secrets Vault</h2>
        </div>
        <div className="flex gap-2">
          <button className="text-xs px-3 py-1.5 rounded-lg bg-[#2A9D8F] text-white hover:bg-[#264653] transition-colors flex items-center gap-1">
            <Plus className="h-3 w-3" /> Add Secret
          </button>
          <button className="text-xs px-3 py-1.5 rounded-lg bg-[#E0F2F1] text-[#264653] hover:bg-[#2A9D8F]/20 transition-colors">
            Verify All
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard icon={Key} value={secrets.length} label="Total Secrets" />
        </div>
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard
            icon={CheckCircle2}
            value={`${synced}/${secrets.length}`}
            label="Synced"
            description={synced === secrets.length ? <span className="text-[#2A9D8F]">All synced</span> : undefined}
          />
        </div>
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard
            icon={Clock}
            value={expiring}
            label="Expiring"
            description={expiring > 0 ? <span className="text-red-500">Action needed</span> : undefined}
          />
        </div>
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard
            icon={AlertTriangle}
            value={outOfSync}
            label="Out of Sync"
            description={outOfSync > 0 ? <span className="text-[#D4A373]">Push needed</span> : undefined}
          />
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-[#2C2420]">Requires Attention</h3>
          {alerts.map((a, i) => (
            <VaultAlertCard key={i} alert={a} />
          ))}
        </div>
      )}

      {/* Secret List */}
      <div className={cn(fleetCardStyles.default, "p-4")}>
        <h3 className="text-sm font-medium text-[#2C2420] mb-3">All Secrets</h3>
        <div className="space-y-0">
          {secrets.map((s) => (
            <SecretRow key={s.id} secret={s} onRotate={handleRotate} onPush={handlePush} />
          ))}
        </div>
      </div>

      {/* Rotation History */}
      <div className={cn(fleetCardStyles.default, "p-4")}>
        <h3 className="text-sm font-medium text-[#2C2420] mb-3">Recent Rotations</h3>
        <div className="space-y-0.5">
          {rotations.map((r, i) => (
            <RotationRow key={i} event={r} />
          ))}
        </div>
      </div>
    </div>
  );
}

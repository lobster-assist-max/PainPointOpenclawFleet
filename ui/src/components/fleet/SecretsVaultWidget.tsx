/**
 * SecretsVaultWidget — Fleet-wide secret management dashboard.
 *
 * Displays: secret health summary, expiring/out-of-sync alerts,
 * secret list with assignment status, rotation history.
 */

import { useMemo } from "react";
import {
  Shield,
  Key,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
  Upload,
  Plus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { MetricCard } from "@/components/MetricCard";
import {
  useFleetStatus,
  useVaultSecrets,
  useVaultHealth,
  useVaultPushAll,
  useVaultVerifyAll,
} from "@/hooks/useFleetMonitor";
import type {
  VaultSecretRecord,
  VaultHealthReport,
} from "@/api/fleet-monitor";
import { fleetCardStyles, severityColors } from "./design-tokens";

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
      ? { bg: "bg-teal-50 dark:bg-teal-950/40", text: "text-teal-600 dark:text-teal-400", label: `✓ ${secret.assignedBotCount}/${secret.totalBots}` }
      : secret.syncStatus === "some_out_of_sync"
        ? { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400", label: `⚠ ${secret.assignedBotCount}/${secret.totalBots}` }
        : { bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-600 dark:text-red-400", label: `✗ Failed` };

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0">
      <span className="text-base">{categoryIcons[secret.category] ?? "⚙️"}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-medium text-foreground">{secret.name}</span>
          {secret.tags.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300">{t}</span>
          ))}
        </div>
        <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground">
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
          type="button"
          onClick={() => onRotate(secret.id)}
          className="p-1 rounded hover:bg-primary/10 transition-colors"
          title="Rotate"
          aria-label="Rotate secret"
        >
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        {secret.syncStatus !== "all_synced" && (
          <button
            type="button"
            onClick={() => onPush(secret.id)}
            className="p-1 rounded hover:bg-teal-100 dark:hover:bg-teal-950/40 transition-colors"
            title="Push to bots"
            aria-label="Push to bots"
          >
            <Upload className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
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
            <span className="text-sm font-mono font-medium text-foreground">{alert.secretName}</span>
            <span className={cn("text-[10px] font-medium", sev.text)}>{typeLabels[alert.alertType] ?? alert.alertType}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{alert.details}</p>
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
        <CheckCircle2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-primary" />
      )}
      <span className="font-mono text-foreground">{event.secretName}</span>
      <span className="text-muted-foreground">by {event.rotatedBy}</span>
      <span className="text-muted-foreground">({event.reason})</span>
      <span className="ml-auto text-muted-foreground">
        {event.successfulPushes}/{event.affectedBots} bots
      </span>
      <span className="text-[10px] text-muted-foreground/70">{event.rotatedAt}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live → display mappers
// ---------------------------------------------------------------------------

/** Relative time string, e.g. "3 days ago" / "in 5 days" for a future date. */
function relTime(iso: string | undefined, future = false): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = future ? t - Date.now() : Date.now() - t;
  if (future && diffMs <= 0) return "expired";
  const days = Math.floor(diffMs / 86_400_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const label = days >= 1 ? `${days} day${days === 1 ? "" : "s"}` : `${Math.max(hours, 0)} hour${hours === 1 ? "" : "s"}`;
  return future ? label : `${label} ago`;
}

function deriveSyncStatus(secret: VaultSecretRecord): VaultSecretSummary["syncStatus"] {
  const statuses = secret.assignedBots.map((b) => b.status);
  if (statuses.some((s) => s === "error")) return "push_failed";
  if (statuses.some((s) => s === "out_of_sync" || s === "pending")) return "some_out_of_sync";
  return "all_synced";
}

function mapSecret(secret: VaultSecretRecord, totalBots: number): VaultSecretSummary {
  return {
    id: secret.id,
    name: secret.name,
    category: secret.category,
    description: secret.description ?? "",
    assignedBotCount: secret.assignedBots.length,
    totalBots: Math.max(totalBots, secret.assignedBots.length),
    lastRotated: relTime(secret.rotation.lastRotated) ?? "never",
    expiresIn: relTime(secret.expiresAt, true),
    syncStatus: deriveSyncStatus(secret),
    tags: secret.tags,
  };
}

function mapAlert(alert: VaultHealthReport["alerts"][number]): HealthAlert {
  const typeMap: Record<string, HealthAlert["alertType"]> = {
    expiring_soon: "expiring",
    expired: "expired",
    never_rotated: "never_rotated",
    out_of_sync: "out_of_sync",
    overexposed: "overexposed",
  };
  return {
    secretName: alert.secretName,
    alertType: typeMap[alert.type] ?? "expiring",
    severity: alert.severity,
    details: alert.message,
  };
}

/** Flatten per-secret rotation history into a fleet-wide recent-rotations list. */
function mapRotations(secrets: VaultSecretRecord[]): RotationEvent[] {
  return secrets
    .flatMap((secret) =>
      secret.rotation.history.map((h) => ({
        ts: new Date(h.rotatedAt).getTime() || 0,
        event: {
          secretName: secret.name,
          rotatedBy: h.actor,
          reason: h.reason,
          // History doesn't record per-rotation push results; approximate with
          // the secret's current assignment count.
          affectedBots: secret.assignedBots.length,
          successfulPushes: secret.assignedBots.length,
          failedPushes: 0,
          rotatedAt: relTime(h.rotatedAt) ?? "recently",
        } satisfies RotationEvent,
      })),
    )
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 6)
    .map((r) => r.event);
}

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export function SecretsVaultWidget() {
  const { selectedCompanyId } = useCompany();
  const { pushToast } = useToast();
  const { data: fleet } = useFleetStatus();
  const secretsQuery = useVaultSecrets(selectedCompanyId);
  const healthQuery = useVaultHealth(selectedCompanyId);
  const pushAll = useVaultPushAll(selectedCompanyId);
  const verifyAll = useVaultVerifyAll(selectedCompanyId);

  const totalBots = fleet?.bots.length ?? 0;
  const liveRecords = secretsQuery.data;
  const isLive = !!liveRecords && liveRecords.length > 0;

  const secrets = useMemo<VaultSecretSummary[]>(
    () => (isLive ? liveRecords!.map((s) => mapSecret(s, totalBots)) : MOCK_SECRETS),
    [isLive, liveRecords, totalBots],
  );
  const alerts = useMemo<HealthAlert[]>(
    () => (isLive ? (healthQuery.data?.alerts ?? []).map(mapAlert) : MOCK_ALERTS),
    [isLive, healthQuery.data],
  );
  const rotations = useMemo<RotationEvent[]>(
    () => (isLive ? mapRotations(liveRecords!) : MOCK_ROTATIONS),
    [isLive, liveRecords],
  );

  const synced = secrets.filter((s) => s.syncStatus === "all_synced").length;
  const expiring = alerts.filter((a) => a.alertType === "expiring" || a.alertType === "expired").length;
  const outOfSync = alerts.filter((a) => a.alertType === "out_of_sync").length;

  const loading = secretsQuery.isLoading;
  const loadFailed = secretsQuery.isError;

  const handleRotate = (id: string) => {
    const secret = secrets.find((s) => s.id === id);
    pushToast({
      title: `Rotate ${secret?.name ?? "secret"}`,
      body: "Rotation requires a new secret value — use the vault API or CLI to supply one.",
      tone: "info",
    });
  };

  const handlePush = (id: string) => {
    if (!isLive) {
      pushToast({ title: "Preview mode", body: "Connect bots and add secrets to push live.", tone: "warn" });
      return;
    }
    const secret = secrets.find((s) => s.id === id);
    pushAll.mutate(id, {
      onSuccess: (res) => {
        const failed = res.results.filter((r) => !r.ok).length;
        pushToast({
          title: failed === 0 ? `Pushed ${secret?.name ?? "secret"}` : `Push completed with ${failed} failure(s)`,
          body: `${res.results.length - failed}/${res.results.length} bots updated.`,
          tone: failed === 0 ? "success" : "warn",
        });
      },
      onError: (err) =>
        pushToast({
          title: "Push failed",
          body: err instanceof Error ? err.message : String(err),
          tone: "error",
        }),
    });
  };

  const handleVerifyAll = () => {
    if (!isLive || !liveRecords) {
      pushToast({ title: "Preview mode", body: "No live secrets to verify yet.", tone: "warn" });
      return;
    }
    Promise.allSettled(liveRecords.map((s) => verifyAll.mutateAsync(s.id))).then((results) => {
      const failed = results.filter((r) => r.status === "rejected").length;
      pushToast({
        title: failed === 0 ? "Verification complete" : `Verified with ${failed} error(s)`,
        body: `Checked ${liveRecords.length} secret(s) across the fleet.`,
        tone: failed === 0 ? "success" : "warn",
      });
    });
  };

  const handleAdd = () => {
    pushToast({
      title: "Add a secret",
      body: "New secrets are created via the vault API or CLI (requires VAULT_MASTER_KEY).",
      tone: "info",
    });
  };

  const verifying = verifyAll.isPending;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Fleet Secrets Vault</h2>
          {isLive ? (
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide">Live</span>
          ) : (
            <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide">Preview</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleAdd}
            className="text-xs px-3 py-1.5 rounded-lg bg-teal-600 dark:bg-teal-700 text-white hover:bg-teal-700 dark:hover:bg-teal-600 transition-colors flex items-center gap-1">
            <Plus className="h-3 w-3" /> Add Secret
          </button>
          <button
            type="button"
            onClick={handleVerifyAll}
            disabled={verifying}
            className="text-xs px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
            {verifying && <Loader2 className="h-3 w-3 animate-spin" />} Verify All
          </button>
        </div>
      </div>

      {/* Status banners */}
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading secrets…
        </div>
      )}
      {loadFailed && (
        <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Failed to load secrets — showing demo data.
        </div>
      )}
      {!loading && !loadFailed && !isLive && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-xs px-3 py-2">
          No secrets in the vault yet — showing demo data. Create secrets via the vault API to see live status.
        </div>
      )}

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
            description={synced === secrets.length ? <span className="text-teal-600 dark:text-teal-400">All synced</span> : undefined}
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
            description={outOfSync > 0 ? <span className="text-primary">Push needed</span> : undefined}
          />
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Requires Attention</h3>
          {alerts.map((a, i) => (
            <VaultAlertCard key={i} alert={a} />
          ))}
        </div>
      )}

      {/* Secret List */}
      <div className={cn(fleetCardStyles.default, "p-4")}>
        <h3 className="text-sm font-medium text-foreground mb-3">All Secrets</h3>
        <div className="space-y-0">
          {secrets.map((s) => (
            <SecretRow key={s.id} secret={s} onRotate={handleRotate} onPush={handlePush} />
          ))}
        </div>
      </div>

      {/* Rotation History */}
      <div className={cn(fleetCardStyles.default, "p-4")}>
        <h3 className="text-sm font-medium text-foreground mb-3">Recent Rotations</h3>
        <div className="space-y-0.5">
          {rotations.map((r, i) => (
            <RotationRow key={i} event={r} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Fleet Integrations page.
 *
 * Manages third-party integrations (Slack, Discord, GitHub, PagerDuty, …) and
 * shows the live event-ingestion log. Integrations can be registered, sent a
 * test event, and removed. Backed by the in-memory integration registry in
 * server/src/routes/fleet-integrations.ts (mounted at /fleet-monitor).
 */

import { useEffect, useMemo, useState } from "react";
import {
  useIntegrations,
  useIntegrationEvents,
  useCreateIntegration,
  useTestIntegration,
  useDeleteIntegration,
  timeAgo,
} from "@/hooks/useFleetMonitor";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn } from "@/lib/utils";
import type { Integration, IntegrationType } from "@/api/fleet-monitor";
import {
  AlertTriangle,
  Plug,
  Plus,
  Send,
  Trash2,
  Activity,
  Webhook,
  Radio,
  Repeat,
} from "lucide-react";

const PROVIDERS = [
  "slack",
  "discord",
  "github",
  "jira",
  "pagerduty",
  "datadog",
  "custom",
] as const;

const TYPES: { value: IntegrationType; label: string }[] = [
  { value: "webhook", label: "Webhook" },
  { value: "polling", label: "Polling" },
  { value: "streaming", label: "Streaming" },
];

function statusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300";
    case "error":
      return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    case "inactive":
      return "bg-muted text-muted-foreground";
    default: // pending
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
  }
}

function TypeIcon({ type }: { type: string }) {
  if (type === "webhook") return <Webhook className="h-3.5 w-3.5" />;
  if (type === "streaming") return <Radio className="h-3.5 w-3.5" />;
  return <Repeat className="h-3.5 w-3.5" />;
}

function providerEmoji(provider: string): string {
  switch (provider) {
    case "slack":
      return "\u{1F4AC}";
    case "discord":
      return "\u{1F47E}";
    case "github":
      return "\u{1F431}";
    case "jira":
      return "\u{1F4CB}";
    case "pagerduty":
      return "\u{1F6A8}";
    case "datadog":
      return "\u{1F436}";
    default:
      return "\u{1F50C}";
  }
}

function AddIntegrationForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<string>("slack");
  const [type, setType] = useState<IntegrationType>("webhook");
  const [token, setToken] = useState("");
  const createMutation = useCreateIntegration();

  const canSubmit = name.trim().length > 0 && !createMutation.isPending;

  const submit = () => {
    if (!canSubmit) return;
    createMutation.mutate(
      {
        name: name.trim(),
        type,
        provider,
        auth: token.trim()
          ? { type: "bearer", token: token.trim() }
          : { type: "none" },
      },
      {
        onSuccess: () => {
          setName("");
          setToken("");
          onClose();
        },
      },
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">New Integration</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="integration-name"
            className="block text-[11px] font-medium text-muted-foreground mb-1"
          >
            Name
          </label>
          <input
            id="integration-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ops Slack"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="integration-provider"
            className="block text-[11px] font-medium text-muted-foreground mb-1"
          >
            Provider
          </label>
          <select
            id="integration-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            aria-label="Integration provider"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="integration-type"
            className="block text-[11px] font-medium text-muted-foreground mb-1"
          >
            Type
          </label>
          <select
            id="integration-type"
            value={type}
            onChange={(e) => setType(e.target.value as IntegrationType)}
            aria-label="Integration type"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="integration-token"
            className="block text-[11px] font-medium text-muted-foreground mb-1"
          >
            Auth token <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <input
            id="integration-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Bearer token"
            aria-label="Auth token"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {createMutation.isError && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          {createMutation.error instanceof Error
            ? createMutation.error.message
            : "Failed to create integration"}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-3.5 w-3.5" /> Add Integration
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function IntegrationRow({
  integration,
  onTest,
  onDelete,
  testing,
  deleting,
}: {
  integration: Integration;
  onTest: (id: string) => void;
  onDelete: (id: string) => void;
  testing: boolean;
  deleting: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-2xl leading-none pt-0.5">
          {providerEmoji(integration.provider)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium text-foreground truncate">
              {integration.name}
            </h3>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                statusBadgeClass(integration.status),
              )}
            >
              {integration.status}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <TypeIcon type={integration.type} />
              {integration.type}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
            <span className="capitalize">{integration.provider}</span>
            <span>·</span>
            <span>auth: {integration.auth.type}</span>
            <span>·</span>
            <span>{integration.eventCount} events</span>
            {integration.lastEventAt && (
              <>
                <span>·</span>
                <span>last event {timeAgo(integration.lastEventAt)}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-1">
          <button
            type="button"
            disabled={testing}
            onClick={() => onTest(integration.id)}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-3 w-3" /> Test
          </button>
          {confirmDelete ? (
            <button
              type="button"
              disabled={deleting}
              onClick={() => onDelete(integration.id)}
              className="inline-flex items-center gap-1 rounded-md border border-red-400/40 bg-red-400/10 px-2.5 py-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3 w-3" /> Confirm
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label={`Remove ${integration.name}`}
              className="inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Integrations() {
  const [showAdd, setShowAdd] = useState(false);
  const { data, isLoading, isError } = useIntegrations();
  const { data: eventsData } = useIntegrationEvents();
  const testMutation = useTestIntegration();
  const deleteMutation = useDeleteIntegration();

  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Integrations" }]);
  }, [setBreadcrumbs]);

  const integrations = data?.integrations ?? [];
  const events = eventsData?.events ?? [];
  const mutationError = testMutation.error ?? deleteMutation.error;

  const activeCount = useMemo(
    () => integrations.filter((i) => i.status === "active").length,
    [integrations],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Integrations</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Connect third-party services and ingest events into your fleet
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((s) => !s)}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> New Integration
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Integrations
          </div>
          <div className="mt-1 text-xl font-semibold text-foreground">
            {integrations.length}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Active
          </div>
          <div className="mt-1 text-xl font-semibold text-foreground">{activeCount}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Recent events
          </div>
          <div className="mt-1 text-xl font-semibold text-foreground">
            {eventsData?.total ?? 0}
          </div>
        </div>
      </div>

      {showAdd && <AddIntegrationForm onClose={() => setShowAdd(false)} />}

      {mutationError && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          {mutationError instanceof Error ? mutationError.message : "Action failed"}
        </div>
      )}

      {/* Integration list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Loading integrations...
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Failed to load integrations. The fleet monitor may be offline.
        </div>
      ) : integrations.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <Plug className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-foreground">No integrations yet</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add a Slack, Discord, or PagerDuty integration to start ingesting events.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {integrations.map((integration) => (
            <IntegrationRow
              key={integration.id}
              integration={integration}
              onTest={(id) => testMutation.mutate(id)}
              onDelete={(id) => deleteMutation.mutate(id)}
              testing={testMutation.isPending}
              deleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Event log */}
      <div className="pt-2">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Recent Events</h2>
        </div>
        {events.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
            No events ingested yet. Test an integration or send a webhook to{" "}
            <code className="rounded bg-muted px-1 py-0.5">/api/fleet-monitor/events/ingest</code>.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span className="text-base leading-none">{providerEmoji(ev.provider)}</span>
                <span className="font-mono text-foreground truncate">{ev.eventType}</span>
                <span className="text-muted-foreground capitalize">{ev.provider}</span>
                {ev.matchedRuleIds.length > 0 && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {ev.matchedRuleIds.length} rule{ev.matchedRuleIds.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span className="ml-auto text-muted-foreground/70 whitespace-nowrap">
                  {timeAgo(ev.receivedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { ChangeEvent, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { accessApi } from "../api/access";
import { assetsApi } from "../api/assets";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import {
  Settings,
  Check,
  Wifi,
  DollarSign,
  Bell,
  Database,
  Shield,
  Cpu,
} from "lucide-react";
import { CompanyPatternIcon } from "../components/CompanyPatternIcon";
import {
  Field,
  ToggleField,
  HintIcon
} from "../components/agent-config-primitives";

type AgentSnippetInput = {
  onboardingTextUrl: string;
  connectionCandidates?: string[] | null;
  testResolutionUrl?: string | null;
};

const DEFAULT_SCAN_PORTS = "18789, 18790, 18793, 18797, 18800";

export function CompanySettings() {
  const {
    companies,
    selectedCompany,
    selectedCompanyId,
    setSelectedCompanyId
  } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  // General settings local state
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [mission, setMission] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);

  // Bot Discovery settings (local state for now, persisted to Supabase later)
  const [scanPorts, setScanPorts] = useState(DEFAULT_SCAN_PORTS);
  const [enableMdns, setEnableMdns] = useState(true);
  const [enableTailscale, setEnableTailscale] = useState(false);
  const [scanIntervalSec, setScanIntervalSec] = useState(30);

  // Budget settings (local state)
  const [monthlyBudgetUsd, setMonthlyBudgetUsd] = useState(100);
  const [budgetAlertPercent, setBudgetAlertPercent] = useState(80);
  const [enableBudgetAlerts, setEnableBudgetAlerts] = useState(true);

  // Notification preferences (local state)
  const [notifyBotOffline, setNotifyBotOffline] = useState(true);
  const [notifyContextHigh, setNotifyContextHigh] = useState(true);
  const [notifyBudgetThreshold, setNotifyBudgetThreshold] = useState(true);
  const [notifyNewConnection, setNotifyNewConnection] = useState(true);
  const [notifySecurityEvents, setNotifySecurityEvents] = useState(true);

  // Sync local state from selected company
  useEffect(() => {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setMission("mission" in selectedCompany ? String((selectedCompany as never as { mission?: string }).mission ?? "") : "");
    setBrandColor(selectedCompany.brandColor ?? "");
    setLogoUrl(selectedCompany.logoUrl ?? "");
  }, [selectedCompany]);

  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSnippet, setInviteSnippet] = useState<string | null>(null);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [snippetCopyDelightId, setSnippetCopyDelightId] = useState(0);

  const generalDirty =
    !!selectedCompany &&
    (companyName !== selectedCompany.name ||
      description !== (selectedCompany.description ?? "") ||
      brandColor !== (selectedCompany.brandColor ?? ""));

  const generalMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string | null;
      brandColor: string | null;
    }) => companiesApi.update(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const settingsMutation = useMutation({
    mutationFn: (requireApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, {
        requireBoardApprovalForNewAgents: requireApproval
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createOpenClawInvitePrompt(selectedCompanyId!),
    onSuccess: async (invite) => {
      setInviteError(null);
      const base = window.location.origin.replace(/\/+$/, "");
      const onboardingTextLink =
        invite.onboardingTextUrl ??
        invite.onboardingTextPath ??
        `/api/invites/${invite.token}/onboarding.txt`;
      const absoluteUrl = onboardingTextLink.startsWith("http")
        ? onboardingTextLink
        : `${base}${onboardingTextLink}`;
      setSnippetCopied(false);
      setSnippetCopyDelightId(0);
      let snippet: string;
      try {
        const manifest = await accessApi.getInviteOnboarding(invite.token);
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates:
            manifest.onboarding.connectivity?.connectionCandidates ?? null,
          testResolutionUrl:
            manifest.onboarding.connectivity?.testResolutionEndpoint?.url ??
            null
        });
      } catch {
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates: null,
          testResolutionUrl: null
        });
      }
      setInviteSnippet(snippet);
      try {
        await navigator.clipboard.writeText(snippet);
        setSnippetCopied(true);
        setSnippetCopyDelightId((prev) => prev + 1);
        setTimeout(() => setSnippetCopied(false), 2000);
      } catch {
        /* clipboard may not be available */
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.sidebarBadges(selectedCompanyId!)
      });
    },
    onError: (err) => {
      setInviteError(
        err instanceof Error ? err.message : "Failed to create invite"
      );
    }
  });

  const syncLogoState = (nextLogoUrl: string | null) => {
    setLogoUrl(nextLogoUrl ?? "");
    void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  };

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) =>
      assetsApi
        .uploadCompanyLogo(selectedCompanyId!, file)
        .then((asset) => companiesApi.update(selectedCompanyId!, { logoAssetId: asset.assetId })),
    onSuccess: (company) => {
      syncLogoState(company.logoUrl);
      setLogoUploadError(null);
    }
  });

  const clearLogoMutation = useMutation({
    mutationFn: () => companiesApi.update(selectedCompanyId!, { logoAssetId: null }),
    onSuccess: (company) => {
      setLogoUploadError(null);
      syncLogoState(company.logoUrl);
    }
  });

  function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    setLogoUploadError(null);
    logoUploadMutation.mutate(file);
  }

  function handleClearLogo() {
    clearLogoMutation.mutate();
  }

  useEffect(() => {
    setInviteError(null);
    setInviteSnippet(null);
    setSnippetCopied(false);
    setSnippetCopyDelightId(0);
  }, [selectedCompanyId]);
  const archiveMutation = useMutation({
    mutationFn: ({
      companyId,
      nextCompanyId
    }: {
      companyId: string;
      nextCompanyId: string | null;
    }) => companiesApi.archive(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats
      });
    }
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Fleet", href: "/dashboard" },
      { label: "Settings" }
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  if (!selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">
        No fleet selected. Select a fleet from the switcher above.
      </div>
    );
  }

  function handleSaveGeneral() {
    generalMutation.mutate({
      name: companyName.trim(),
      description: description.trim() || null,
      brandColor: brandColor || null
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-[#D4A373]" />
        <h1 className="text-lg font-semibold text-[#2C2420]">Fleet Settings</h1>
      </div>

      {/* General */}
      <SettingsSection label="General" icon={<Cpu className="h-3.5 w-3.5" />}>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <Field label="Fleet name" hint="The display name for your fleet.">
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[#D4A373] transition-colors"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </Field>
          <Field label="Mission" hint="Your fleet's mission statement. Shown on the dashboard.">
            <textarea
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[#D4A373] transition-colors resize-none"
              rows={2}
              value={mission}
              placeholder="e.g. Build the future of AI-powered customer service"
              onChange={(e) => setMission(e.target.value)}
            />
          </Field>
          <Field
            label="Description"
            hint="Optional description shown in the fleet profile."
          >
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[#D4A373] transition-colors"
              type="text"
              value={description}
              placeholder="Optional fleet description"
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </SettingsSection>

      {/* Appearance */}
      <SettingsSection label="Appearance">
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <CompanyPatternIcon
                companyName={companyName || selectedCompany.name}
                logoUrl={logoUrl || null}
                brandColor={brandColor || null}
                className="rounded-[14px]"
              />
            </div>
            <div className="flex-1 space-y-3">
              <Field
                label="Logo"
                hint="Upload a PNG, JPEG, WEBP, GIF, or SVG logo image."
              >
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    onChange={handleLogoFileChange}
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none file:mr-4 file:rounded-md file:border-0 file:bg-[#D4A373]/10 file:text-[#2C2420] file:px-2.5 file:py-1 file:text-xs"
                  />
                  {logoUrl && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleClearLogo}
                        disabled={clearLogoMutation.isPending}
                      >
                        {clearLogoMutation.isPending ? "Removing..." : "Remove logo"}
                      </Button>
                    </div>
                  )}
                  {(logoUploadMutation.isError || logoUploadError) && (
                    <span className="text-xs text-destructive">
                      {logoUploadError ??
                        (logoUploadMutation.error instanceof Error
                          ? logoUploadMutation.error.message
                          : "Logo upload failed")}
                    </span>
                  )}
                  {clearLogoMutation.isError && (
                    <span className="text-xs text-destructive">
                      {clearLogoMutation.error.message}
                    </span>
                  )}
                  {logoUploadMutation.isPending && (
                    <span className="text-xs text-muted-foreground">Uploading logo...</span>
                  )}
                </div>
              </Field>
              <Field
                label="Brand color"
                hint="Sets the hue for the fleet icon. Leave empty for auto-generated color."
              >
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandColor || "#D4A373"}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                        setBrandColor(v);
                      }
                    }}
                    placeholder="#D4A373"
                    className="w-28 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none focus:border-[#D4A373] transition-colors"
                  />
                  {brandColor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBrandColor("")}
                      className="text-xs text-muted-foreground"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </Field>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Save button for General + Appearance */}
      {generalDirty && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSaveGeneral}
            disabled={generalMutation.isPending || !companyName.trim()}
            className="bg-[#D4A373] hover:bg-[#B08968] text-white"
          >
            {generalMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
          {generalMutation.isSuccess && (
            <span className="text-xs text-muted-foreground">Saved</span>
          )}
          {generalMutation.isError && (
            <span className="text-xs text-destructive">
              {generalMutation.error instanceof Error
                  ? generalMutation.error.message
                  : "Failed to save"}
            </span>
          )}
        </div>
      )}

      {/* Bot Discovery */}
      <SettingsSection label="Bot Discovery" icon={<Wifi className="h-3.5 w-3.5" />}>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <Field label="Scan ports" hint="Comma-separated list of ports to scan for OpenClaw bots on the local network.">
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none focus:border-[#D4A373] transition-colors"
              type="text"
              value={scanPorts}
              onChange={(e) => setScanPorts(e.target.value)}
              placeholder={DEFAULT_SCAN_PORTS}
            />
          </Field>
          <Field label="Scan interval" hint="How often to auto-scan for new bots (in seconds).">
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-20 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none focus:border-[#D4A373] transition-colors text-center"
                value={scanIntervalSec}
                min={10}
                max={300}
                onChange={(e) => setScanIntervalSec(Number(e.target.value) || 30)}
              />
              <span className="text-xs text-muted-foreground">seconds</span>
            </div>
          </Field>
          <ToggleField
            label="mDNS discovery"
            hint="Scan local network via mDNS to find bots on other machines."
            checked={enableMdns}
            onChange={setEnableMdns}
          />
          <ToggleField
            label="Tailscale discovery"
            hint="Discover bots on your Tailscale network."
            checked={enableTailscale}
            onChange={setEnableTailscale}
          />
        </div>
      </SettingsSection>

      {/* Budget & Cost Limits */}
      <SettingsSection label="Budget & Cost Limits" icon={<DollarSign className="h-3.5 w-3.5" />}>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <Field label="Monthly budget (USD)" hint="Maximum token spend per month across all bots. Set to 0 for unlimited.">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="number"
                className="w-28 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none focus:border-[#D4A373] transition-colors"
                value={monthlyBudgetUsd}
                min={0}
                step={10}
                onChange={(e) => setMonthlyBudgetUsd(Number(e.target.value) || 0)}
              />
              <span className="text-xs text-muted-foreground">/ month</span>
            </div>
          </Field>
          <Field label="Alert threshold" hint="Send an alert when budget usage exceeds this percentage.">
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-20 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none focus:border-[#D4A373] transition-colors text-center"
                value={budgetAlertPercent}
                min={10}
                max={100}
                step={5}
                onChange={(e) => setBudgetAlertPercent(Number(e.target.value) || 80)}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </Field>
          <ToggleField
            label="Enable budget alerts"
            hint="Receive alerts when budget thresholds are crossed."
            checked={enableBudgetAlerts}
            onChange={setEnableBudgetAlerts}
          />
          {monthlyBudgetUsd > 0 && (
            <div className="pt-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Budget usage preview</span>
                <span>$0.00 / ${monthlyBudgetUsd.toFixed(2)}</span>
              </div>
              <div className="h-2 bg-[#E5E7EB] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#22c55e] rounded-full transition-all"
                  style={{ width: "0%" }}
                />
              </div>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* Notification Preferences */}
      <SettingsSection label="Notifications" icon={<Bell className="h-3.5 w-3.5" />}>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <ToggleField
            label="Bot goes offline"
            hint="Alert when a connected bot becomes unreachable."
            checked={notifyBotOffline}
            onChange={setNotifyBotOffline}
          />
          <ToggleField
            label="Context usage high"
            hint="Alert when a bot's context window exceeds 80%."
            checked={notifyContextHigh}
            onChange={setNotifyContextHigh}
          />
          <ToggleField
            label="Budget threshold reached"
            hint="Alert when fleet spending crosses the configured threshold."
            checked={notifyBudgetThreshold}
            onChange={setNotifyBudgetThreshold}
          />
          <ToggleField
            label="New bot connection"
            hint="Alert when a new bot connects to the fleet."
            checked={notifyNewConnection}
            onChange={setNotifyNewConnection}
          />
          <ToggleField
            label="Security events"
            hint="Alert on denied connections, unauthorized access, or suspicious activity."
            checked={notifySecurityEvents}
            onChange={setNotifySecurityEvents}
          />
        </div>
      </SettingsSection>

      {/* Connecting (Board Approval) */}
      <SettingsSection label="Connection Policy" icon={<Shield className="h-3.5 w-3.5" />}>
        <div className="rounded-md border border-border px-4 py-3">
          <ToggleField
            label="Require board approval for new connections"
            hint="New bot connections stay pending until approved by board."
            checked={!!selectedCompany.requireBoardApprovalForNewAgents}
            onChange={(v) => settingsMutation.mutate(v)}
          />
        </div>
      </SettingsSection>

      {/* Supabase Connection */}
      <SettingsSection label="Database (Supabase)" icon={<Database className="h-3.5 w-3.5" />}>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-[#22c55e] animate-pulse" />
            <span className="text-xs text-muted-foreground">Connected</span>
          </div>
          <Field label="Project URL" hint="Supabase project endpoint.">
            <div className="flex items-center gap-2">
              <input
                className="w-full rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs font-mono text-muted-foreground outline-none"
                type="text"
                value="https://qxoahjoqxmhjedakeqss.supabase.co"
                readOnly
              />
            </div>
          </Field>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <HintIcon text="API keys are stored securely in the system keychain (supabase-fleet-anon, supabase-fleet-service)." />
            <span>API keys managed via Keychain</span>
          </div>
        </div>
      </SettingsSection>

      {/* Invites */}
      <SettingsSection label="Invites">
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              Generate an OpenClaw bot invite snippet.
            </span>
            <HintIcon text="Creates a short-lived OpenClaw bot invite and renders a copy-ready prompt." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending}
              className="bg-[#D4A373] hover:bg-[#B08968] text-white"
            >
              {inviteMutation.isPending
                ? "Generating..."
                : "Generate OpenClaw Invite Prompt"}
            </Button>
          </div>
          {inviteError && (
            <p className="text-sm text-destructive">{inviteError}</p>
          )}
          {inviteSnippet && (
            <div className="rounded-md border border-border bg-muted/30 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  OpenClaw Invite Prompt
                </div>
                {snippetCopied && (
                  <span
                    key={snippetCopyDelightId}
                    className="flex items-center gap-1 text-xs text-green-600 animate-pulse"
                  >
                    <Check className="h-3 w-3" />
                    Copied
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-1.5">
                <textarea
                  className="h-[28rem] w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none"
                  value={inviteSnippet}
                  readOnly
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteSnippet);
                        setSnippetCopied(true);
                        setSnippetCopyDelightId((prev) => prev + 1);
                        setTimeout(() => setSnippetCopied(false), 2000);
                      } catch {
                        /* clipboard may not be available */
                      }
                    }}
                  >
                    {snippetCopied ? "Copied snippet" : "Copy snippet"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* Danger Zone */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-destructive uppercase tracking-wide">
          Danger Zone
        </div>
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Archive this fleet to hide it from the sidebar. This persists in
            the database.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={
                archiveMutation.isPending ||
                selectedCompany.status === "archived"
              }
              onClick={() => {
                if (!selectedCompanyId) return;
                const confirmed = window.confirm(
                  `Archive fleet "${selectedCompany.name}"? It will be hidden from the sidebar.`
                );
                if (!confirmed) return;
                const nextCompanyId =
                  companies.find(
                    (company) =>
                      company.id !== selectedCompanyId &&
                      company.status !== "archived"
                  )?.id ?? null;
                archiveMutation.mutate({
                  companyId: selectedCompanyId,
                  nextCompanyId
                });
              }}
            >
              {archiveMutation.isPending
                ? "Archiving..."
                : selectedCompany.status === "archived"
                ? "Already archived"
                : "Archive fleet"}
            </Button>
            {archiveMutation.isError && (
              <span className="text-xs text-destructive">
                {archiveMutation.error instanceof Error
                  ? archiveMutation.error.message
                  : "Failed to archive fleet"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {icon && <span className="text-[#D4A373]">{icon}</span>}
        {label}
      </div>
      {children}
    </div>
  );
}

function buildAgentSnippet(input: AgentSnippetInput) {
  const candidateUrls = buildCandidateOnboardingUrls(input);
  const resolutionTestUrl = buildResolutionTestUrl(input);

  const candidateList =
    candidateUrls.length > 0
      ? candidateUrls.map((u) => `- ${u}`).join("\n")
      : "- (No candidate URLs available yet.)";

  const connectivityBlock =
    candidateUrls.length === 0
      ? `No candidate URLs are available. Ask your user to configure a reachable hostname in Fleet, then retry.
Suggested steps:
- choose a hostname that resolves to the Fleet host from your runtime
- run: pnpm paperclipai allowed-hostname <host>
- restart Fleet
- verify with: curl -fsS http://<host>:3100/api/health
- regenerate this invite snippet`
      : `If none are reachable, ask your user to add a reachable hostname in Fleet, restart, and retry.
Suggested command:
- pnpm paperclipai allowed-hostname <host>
Then verify with: curl -fsS <base-url>/api/health`;

  const resolutionLine = resolutionTestUrl
    ? `\nYou MUST test Fleet-to-gateway reachability, call: ${resolutionTestUrl}?url=<urlencoded-gateway-url> (using the hostname that worked above). Do not assume your 172.x is necessarily reachable from Fleet. Test it. `
    : "";

  return `You're invited to join a Pain Point Fleet.

The URLs you should try are:
${candidateList}

Connectivity guidance:
If you are running on a different machine than Fleet, Fleet must be reachable at one of the hostnames used above.
Verify the hostname works from your runtime with: GET <base-url>/api/health

${connectivityBlock}

For your "botName", just use your own bot name (OpenClaw or whatever your name is) and send it directly.
You also need to send a gateway URL that Fleet can access. Check your config and include that URL.${resolutionLine}

---

This onboarding flow is for OpenClaw Gateway.
When you submit the join request, use:
- \`adapterType: "openclaw_gateway"\`
- \`agentDefaultsPayload.url\` as your \`ws://\` or \`wss://\` gateway URL
- \`agentDefaultsPayload.headers["x-openclaw-token"]\` with your gateway token
- (legacy accepted) \`agentDefaultsPayload.headers["x-openclaw-auth"]\`
- Keep device auth enabled (recommended). If \`devicePrivateKeyPem\` is omitted, Fleet will generate and persist one during join so pairing approvals remain stable.
- Only use \`disableDeviceAuth=true\` for special environments where pairing cannot be completed.

Do NOT use \`/v1/responses\` or \`/hooks/*\` in this join flow.

Before you do anything, please respond to your user that you understand the instructions and you're going to work on them. Then do the step above in another session called "fleet-onboarding" and then tell your user when you're done. Update your user in intermediate steps along the way so they know what's going on.

Then after you've connected to Fleet (exchanged keys etc.) you MUST review and follow the onboarding instructions in onboarding.txt they give you.

`;
}

function buildCandidateOnboardingUrls(input: AgentSnippetInput): string[] {
  const candidates = (input.connectionCandidates ?? [])
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const urls = new Set<string>();
  let onboardingUrl: URL | null = null;

  try {
    onboardingUrl = new URL(input.onboardingTextUrl);
    urls.add(onboardingUrl.toString());
  } catch {
    const trimmed = input.onboardingTextUrl.trim();
    if (trimmed) {
      urls.add(trimmed);
    }
  }

  if (!onboardingUrl) {
    for (const candidate of candidates) {
      urls.add(candidate);
    }
    return Array.from(urls);
  }

  const onboardingPath = `${onboardingUrl.pathname}${onboardingUrl.search}`;
  for (const candidate of candidates) {
    try {
      const base = new URL(candidate);
      urls.add(`${base.origin}${onboardingPath}`);
    } catch {
      urls.add(candidate);
    }
  }

  return Array.from(urls);
}

function buildResolutionTestUrl(input: AgentSnippetInput): string | null {
  const explicit = input.testResolutionUrl?.trim();
  if (explicit) return explicit;

  try {
    const onboardingUrl = new URL(input.onboardingTextUrl);
    const testPath = onboardingUrl.pathname.replace(
      /\/onboarding\.txt$/,
      "/test-resolution"
    );
    return `${onboardingUrl.origin}${testPath}`;
  } catch {
    return null;
  }
}

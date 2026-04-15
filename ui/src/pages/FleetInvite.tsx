import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { accessApi } from "../api/access";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import {
  Link2,
  Copy,
  Check,
  Clock,
  UserPlus,
  Bot,
  Users,
  ShieldCheck,
  ShieldX,
  RefreshCw,
} from "lucide-react";
import type { JoinRequest } from "@paperclipai/shared";

type InviteMode = "human" | "agent" | "both";

export function FleetInvite() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [inviteMode, setInviteMode] = useState<InviteMode>("both");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestTab, setRequestTab] = useState<"pending_approval" | "approved" | "rejected">("pending_approval");

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Fleet", href: "/dashboard" },
      { label: "Invite Links" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  // List join requests
  const joinRequestsQuery = useQuery({
    queryKey: queryKeys.access.joinRequests(selectedCompanyId ?? "", requestTab),
    queryFn: () => accessApi.listJoinRequests(selectedCompanyId!, requestTab),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
  });

  const joinRequests = joinRequestsQuery.data ?? [];

  // Generate invite mutation
  const generateMutation = useMutation({
    mutationFn: () =>
      accessApi.createCompanyInvite(selectedCompanyId!, {
        allowedJoinTypes: inviteMode,
      }),
    onSuccess: (invite) => {
      setError(null);
      const base = window.location.origin.replace(/\/+$/, "");
      const url = invite.inviteUrl.startsWith("http")
        ? invite.inviteUrl
        : `${base}${invite.inviteUrl}`;
      setInviteUrl(url);
      setInviteToken(invite.token);
      setInviteExpiresAt(invite.expiresAt);
      setCopied(false);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to generate invite");
    },
  });

  // Approve / Reject mutations
  const approveMutation = useMutation({
    mutationFn: (requestId: string) =>
      accessApi.approveJoinRequest(selectedCompanyId!, requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.access.joinRequests(selectedCompanyId!, requestTab),
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (requestId: string) =>
      accessApi.rejectJoinRequest(selectedCompanyId!, requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.access.joinRequests(selectedCompanyId!, requestTab),
      });
    },
  });

  async function handleCopy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may not be available */
    }
  }

  // Reset invite state when company changes
  useEffect(() => {
    setInviteUrl(null);
    setInviteToken(null);
    setInviteExpiresAt(null);
    setError(null);
    setCopied(false);
  }, [selectedCompanyId]);

  if (!selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">
        No fleet selected. Select a fleet from the switcher above.
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link2 className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Invite Links</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Generate invite links to let humans or bots join your fleet. Links expire after 10 minutes for security.
      </p>

      {/* Generate Section */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Generate Invite
        </div>
        <div className="rounded-lg border border-primary/30 bg-muted/50 dark:bg-muted/20 p-5 space-y-4">
          {/* Mode selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground mr-2">Allow:</span>
            {(["both", "human", "agent"] as InviteMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setInviteMode(mode)}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  inviteMode === mode
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-primary/30 bg-background text-muted-foreground hover:border-primary/60"
                }`}
              >
                {mode === "both" && <Users className="h-3.5 w-3.5" />}
                {mode === "human" && <UserPlus className="h-3.5 w-3.5" />}
                {mode === "agent" && <Bot className="h-3.5 w-3.5" />}
                {mode === "both" ? "Everyone" : mode === "human" ? "Humans Only" : "Bots Only"}
              </button>
            ))}
          </div>

          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {generateMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4 mr-2" />
                Generate Invite Link
              </>
            )}
          </Button>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          {/* Generated link display */}
          {inviteUrl && (
            <div className="rounded-md border border-primary/20 bg-background p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-primary">
                  Invite Link Generated
                </span>
                {inviteExpiresAt && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Expires {new Date(inviteExpiresAt).toLocaleTimeString()}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  className="flex-1 rounded-md border border-primary/20 bg-muted/50 dark:bg-muted/20 px-3 py-2 text-sm font-mono text-foreground outline-none"
                  value={inviteUrl}
                  readOnly
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="shrink-0 border-primary/30 hover:bg-primary/10"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-1 text-green-600" />
                      <span className="text-green-600">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground/60">
                Share this link with the person or bot you want to invite.
                {inviteToken && (
                  <span className="ml-1 font-mono">Token: {inviteToken.slice(0, 12)}...</span>
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Join Requests Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Join Requests
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => joinRequestsQuery.refetch()}
            disabled={joinRequestsQuery.isFetching}
            className="text-xs text-muted-foreground"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${joinRequestsQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-primary/20">
          {(
            [
              { key: "pending_approval" as const, label: "Pending" },
              { key: "approved" as const, label: "Approved" },
              { key: "rejected" as const, label: "Rejected" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setRequestTab(tab.key)}
              className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                requestTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.key === "pending_approval" && joinRequests.length > 0 && requestTab === "pending_approval" && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground leading-none">
                  {joinRequests.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Mutation error display */}
        {(approveMutation.error || rejectMutation.error) && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-50/50 dark:bg-red-950/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            <ShieldX className="h-4 w-4 shrink-0" />
            {approveMutation.error instanceof Error ? approveMutation.error.message
              : rejectMutation.error instanceof Error ? rejectMutation.error.message
              : "Failed to process request"}
          </div>
        )}

        {/* Request list */}
        {joinRequestsQuery.isLoading ? (
          <div className="text-sm text-muted-foreground/60 py-4 text-center">Loading requests...</div>
        ) : joinRequestsQuery.isError ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-50/50 dark:bg-red-950/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            <ShieldX className="h-4 w-4 shrink-0" />
            Failed to load join requests{joinRequestsQuery.error instanceof Error ? `: ${joinRequestsQuery.error.message}` : ""}
          </div>
        ) : joinRequests.length === 0 ? (
          <div className="text-sm text-muted-foreground/60 py-8 text-center rounded-lg border border-dashed border-primary/20">
            No {requestTab === "pending_approval" ? "pending" : requestTab} requests
          </div>
        ) : (
          <div className="space-y-2">
            {joinRequests.map((req: JoinRequest) => (
              <div
                key={req.id}
                className="flex items-center justify-between rounded-lg border border-primary/20 bg-background px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-md flex items-center justify-center text-sm ${
                    req.requestType === "agent"
                      ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                      : "bg-primary/10 text-primary"
                  }`}>
                    {req.requestType === "agent" ? (
                      <Bot className="h-4 w-4" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {req.requestType === "agent" ? (req as JoinRequest & { agentName?: string }).agentName ?? "Bot" : "Human"}
                    </div>
                    <div className="text-xs text-muted-foreground/60">
                      {req.requestType} request
                      {" \u00B7 "}
                      <span className="font-mono">{req.id.slice(0, 8)}</span>
                      {" \u00B7 "}
                      {new Date(req.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>

                {requestTab === "pending_approval" && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate(req.id)}
                      disabled={approveMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white text-xs"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectMutation.mutate(req.id)}
                      disabled={rejectMutation.isPending}
                      className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs"
                    >
                      <ShieldX className="h-3.5 w-3.5 mr-1" />
                      Reject
                    </Button>
                  </div>
                )}

                {requestTab === "approved" && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Approved
                  </span>
                )}

                {requestTab === "rejected" && (
                  <span className="flex items-center gap-1 text-xs text-red-500">
                    <ShieldX className="h-3.5 w-3.5" />
                    Rejected
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="rounded-lg border border-primary/10 bg-muted/50 dark:bg-muted/20 p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">How Invite Links Work</h3>
        <ul className="space-y-1.5 text-xs text-muted-foreground/70">
          <li>1. Generate an invite link and choose who can join (humans, bots, or both)</li>
          <li>2. Share the link with the person or bot you want to invite</li>
          <li>3. They open the link and submit a join request</li>
          <li>4. You review and approve or reject the request here</li>
          <li>5. Approved bots receive an API key; approved humans get fleet access</li>
        </ul>
      </div>
    </div>
  );
}

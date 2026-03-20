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
        <Link2 className="h-5 w-5 text-[#D4A373]" />
        <h1 className="text-lg font-semibold text-[#2C2420]">Invite Links</h1>
      </div>
      <p className="text-sm text-[#2C2420]/60">
        Generate invite links to let humans or bots join your fleet. Links expire after 10 minutes for security.
      </p>

      {/* Generate Section */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-[#2C2420]/50 uppercase tracking-wide">
          Generate Invite
        </div>
        <div className="rounded-lg border border-[#D4A373]/30 bg-[#FAF9F6] p-5 space-y-4">
          {/* Mode selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#2C2420]/70 mr-2">Allow:</span>
            {(["both", "human", "agent"] as InviteMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setInviteMode(mode)}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  inviteMode === mode
                    ? "border-[#D4A373] bg-[#D4A373] text-white"
                    : "border-[#D4A373]/30 bg-white text-[#2C2420]/70 hover:border-[#D4A373]/60"
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
            className="bg-[#D4A373] hover:bg-[#C4935F] text-white"
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Generated link display */}
          {inviteUrl && (
            <div className="rounded-md border border-[#D4A373]/20 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#D4A373]">
                  Invite Link Generated
                </span>
                {inviteExpiresAt && (
                  <span className="flex items-center gap-1 text-xs text-[#2C2420]/50">
                    <Clock className="h-3 w-3" />
                    Expires {new Date(inviteExpiresAt).toLocaleTimeString()}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  className="flex-1 rounded-md border border-[#D4A373]/20 bg-[#FAF9F6] px-3 py-2 text-sm font-mono text-[#2C2420] outline-none"
                  value={inviteUrl}
                  readOnly
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="shrink-0 border-[#D4A373]/30 hover:bg-[#D4A373]/10"
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

              <p className="text-xs text-[#2C2420]/40">
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
          <div className="text-xs font-medium text-[#2C2420]/50 uppercase tracking-wide">
            Join Requests
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => joinRequestsQuery.refetch()}
            disabled={joinRequestsQuery.isFetching}
            className="text-xs text-[#2C2420]/50"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${joinRequestsQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-[#D4A373]/20">
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
                  ? "border-[#D4A373] text-[#D4A373]"
                  : "border-transparent text-[#2C2420]/50 hover:text-[#2C2420]/70"
              }`}
            >
              {tab.label}
              {tab.key === "pending_approval" && joinRequests.length > 0 && requestTab === "pending_approval" && (
                <span className="ml-1.5 rounded-full bg-[#D4A373] px-1.5 py-0.5 text-[10px] text-white leading-none">
                  {joinRequests.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Request list */}
        {joinRequestsQuery.isLoading ? (
          <div className="text-sm text-[#2C2420]/40 py-4 text-center">Loading requests...</div>
        ) : joinRequests.length === 0 ? (
          <div className="text-sm text-[#2C2420]/40 py-8 text-center rounded-lg border border-dashed border-[#D4A373]/20">
            No {requestTab === "pending_approval" ? "pending" : requestTab} requests
          </div>
        ) : (
          <div className="space-y-2">
            {joinRequests.map((req: JoinRequest) => (
              <div
                key={req.id}
                className="flex items-center justify-between rounded-lg border border-[#D4A373]/20 bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-md flex items-center justify-center text-sm ${
                    req.requestType === "agent"
                      ? "bg-blue-50 text-blue-600"
                      : "bg-[#D4A373]/10 text-[#D4A373]"
                  }`}>
                    {req.requestType === "agent" ? (
                      <Bot className="h-4 w-4" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[#2C2420]">
                      {req.requestType === "agent" ? (req as JoinRequest & { agentName?: string }).agentName ?? "Bot" : "Human"}
                    </div>
                    <div className="text-xs text-[#2C2420]/40">
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
                      className="bg-green-600 hover:bg-green-700 text-white text-xs"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectMutation.mutate(req.id)}
                      disabled={rejectMutation.isPending}
                      className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
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
      <div className="rounded-lg border border-[#D4A373]/10 bg-[#FAF9F6] p-4">
        <h3 className="text-sm font-medium text-[#2C2420]/70 mb-2">How Invite Links Work</h3>
        <ul className="space-y-1.5 text-xs text-[#2C2420]/50">
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

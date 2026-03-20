/**
 * ConnectBotWizard — standalone component for connecting an OpenClaw bot.
 *
 * Three sub-steps:
 *   1. Enter Gateway URL (+ optional mDNS scan results)
 *   2. Enter Token → Test Connection
 *   3. Review Bot Profile → Confirm
 *
 * Designed to be embedded inside OnboardingWizard Step 2 or used
 * standalone from the "Connect Bot" button on the Dashboard.
 */

import { useState, useCallback } from "react";
import {
  Wifi,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTestConnection, useConnectBot } from "@/hooks/useFleetMonitor";
import type {
  BotAgentIdentity,
  ChannelStatus,
  TestConnectionResponse,
} from "@/api/fleet-monitor";

// ---------------------------------------------------------------------------
// Sub-step 1: Gateway URL
// ---------------------------------------------------------------------------

function GatewayUrlStep({
  url,
  onUrlChange,
  onNext,
}: {
  url: string;
  onUrlChange: (url: string) => void;
  onNext: () => void;
}) {
  const isValid = url.startsWith("http://") || url.startsWith("https://") || url.startsWith("ws://");

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Gateway URL</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Enter the URL of your OpenClaw Gateway.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="gateway-url">
          URL
        </label>
        <input
          id="gateway-url"
          type="url"
          placeholder="http://192.168.50.73:18789"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && isValid && onNext()}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Usually <code className="text-[11px] bg-muted px-1 rounded">http://IP:18789</code> — check your bot's OpenClaw config.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          disabled={!isValid}
          onClick={onNext}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
            isValid
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-step 2: Token + Test Connection
// ---------------------------------------------------------------------------

function TokenStep({
  url,
  token,
  onTokenChange,
  onBack,
  onTestSuccess,
}: {
  url: string;
  token: string;
  onTokenChange: (token: string) => void;
  onBack: () => void;
  onTestSuccess: (result: TestConnectionResponse) => void;
}) {
  const [showToken, setShowToken] = useState(false);
  const testMutation = useTestConnection();

  const handleTest = useCallback(() => {
    testMutation.mutate(
      { gatewayUrl: url, token },
      {
        onSuccess: (result) => {
          if (result.ok) {
            onTestSuccess(result);
          }
        },
      },
    );
  }, [url, token, testMutation, onTestSuccess]);

  const testResult = testMutation.data;
  const isOk = testResult?.ok === true;
  const isFailed = testResult && !testResult.ok;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Authentication</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Enter the Gateway token for <code className="text-[11px] bg-muted px-1 rounded">{url}</code>
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="gateway-token">
          Token
        </label>
        <div className="relative">
          <input
            id="gateway-token"
            type={showToken ? "text" : "password"}
            placeholder="Gateway auth token"
            value={token}
            onChange={(e) => onTokenChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && token && handleTest()}
            className="w-full rounded-lg border bg-background px-3 py-2 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowToken((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Found in <code className="text-[11px] bg-muted px-1 rounded">~/.openclaw/openclaw.json</code> → <code className="text-[11px] bg-muted px-1 rounded">gateway.auth.token</code>
        </p>
      </div>

      {/* Test result */}
      {isOk && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-50/50 dark:bg-green-950/20 px-3 py-2.5 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
          <div>
            <span className="font-medium text-green-700 dark:text-green-300">Connected!</span>
            {testResult.identity && (
              <span className="ml-2 text-muted-foreground">
                Found bot: {testResult.identity.emoji} {testResult.identity.name}
              </span>
            )}
          </div>
        </div>
      )}
      {isFailed && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-50/50 dark:bg-red-950/20 px-3 py-2.5 text-sm">
          <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
          <span className="text-red-700 dark:text-red-300">
            {testResult.error ?? "Connection failed. Check URL and token."}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium border hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <button
          disabled={!token || testMutation.isPending}
          onClick={handleTest}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
            token
              ? isOk
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          {testMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Testing...
            </>
          ) : isOk ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Continue
            </>
          ) : (
            <>
              <Wifi className="h-4 w-4" />
              Test Connection
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-step 3: Bot Profile Review
// ---------------------------------------------------------------------------

function BotProfileStep({
  identity,
  channels,
  version,
  onBack,
  onConfirm,
  isConnecting,
}: {
  identity: BotAgentIdentity;
  channels: ChannelStatus[];
  version: string | null;
  onBack: () => void;
  onConfirm: () => void;
  isConnecting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Bot Profile</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Confirm the bot details before adding to your fleet.
        </p>
      </div>

      {/* Profile card */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{identity.emoji || "🤖"}</span>
          <div>
            <p className="text-lg font-semibold">{identity.name}</p>
            {identity.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {identity.description}
              </p>
            )}
          </div>
        </div>

        {channels.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Channels
            </p>
            <div className="flex flex-wrap gap-1.5">
              {channels.map((ch) => (
                <span
                  key={ch.name}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border",
                    ch.connected
                      ? "text-green-700 dark:text-green-300 border-green-500/30 bg-green-50/50 dark:bg-green-950/20"
                      : "text-muted-foreground border-muted",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      ch.connected ? "bg-green-500" : "bg-muted-foreground",
                    )}
                  />
                  {ch.type}
                </span>
              ))}
            </div>
          </div>
        )}

        {version && (
          <p className="text-xs text-muted-foreground">
            Gateway version: <code className="bg-muted px-1 rounded">{version}</code>
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium border hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <button
          disabled={isConnecting}
          onClick={onConfirm}
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Radio className="h-4 w-4" />
              Add to Fleet
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Wizard
// ---------------------------------------------------------------------------

interface ConnectBotWizardProps {
  /** Called after bot is successfully connected. */
  onComplete?: (botId: string) => void;
  /** Called when user cancels. */
  onCancel?: () => void;
  className?: string;
}

export function ConnectBotWizard({ onComplete, onCancel, className }: ConnectBotWizardProps) {
  const [subStep, setSubStep] = useState<1 | 2 | 3>(1);
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [token, setToken] = useState("");
  const [testResult, setTestResult] = useState<TestConnectionResponse | null>(null);

  const connectMutation = useConnectBot();

  const handleTestSuccess = useCallback((result: TestConnectionResponse) => {
    setTestResult(result);
    setSubStep(3);
  }, []);

  const handleConfirm = useCallback(() => {
    connectMutation.mutate(
      { gatewayUrl, token },
      {
        onSuccess: (result) => {
          onComplete?.(result.botId);
        },
      },
    );
  }, [gatewayUrl, token, connectMutation, onComplete]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            className={cn(
              "h-2 w-2 rounded-full transition-colors",
              s === subStep ? "bg-primary" : s < subStep ? "bg-primary/40" : "bg-muted",
            )}
          />
        ))}
      </div>

      {subStep === 1 && (
        <GatewayUrlStep
          url={gatewayUrl}
          onUrlChange={setGatewayUrl}
          onNext={() => setSubStep(2)}
        />
      )}

      {subStep === 2 && (
        <TokenStep
          url={gatewayUrl}
          token={token}
          onTokenChange={setToken}
          onBack={() => setSubStep(1)}
          onTestSuccess={handleTestSuccess}
        />
      )}

      {subStep === 3 && testResult?.identity && (
        <BotProfileStep
          identity={testResult.identity}
          channels={testResult.channels ?? []}
          version={testResult.version}
          onBack={() => setSubStep(2)}
          onConfirm={handleConfirm}
          isConnecting={connectMutation.isPending}
        />
      )}

      {connectMutation.isError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-50/50 dark:bg-red-950/20 px-3 py-2.5 text-sm">
          <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
          <span className="text-red-700 dark:text-red-300">
            {(connectMutation.error as Error)?.message ?? "Failed to connect bot."}
          </span>
        </div>
      )}
    </div>
  );
}

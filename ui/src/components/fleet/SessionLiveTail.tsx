/**
 * SessionLiveTail — Real-time chat view for a bot's session.
 *
 * Loads history via chat.history RPC, subscribes to fleet.bot.chat
 * LiveEvents for real-time updates, and auto-classifies sessions
 * by key prefix (direct / channel / group / cron / system).
 */

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { channelBrandColor, channelBrandColorDefault } from "@/lib/status-colors";
import { timeAgo, estimateCostUsd } from "@/hooks/useFleetMonitor";
import { fleetMonitorApi } from "@/api/fleet-monitor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatEntry {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  tokenCount?: number;
  channelName?: string;
}

type SessionType = "direct" | "channel" | "group" | "cron" | "system";

interface SessionLiveTailProps {
  botId: string;
  sessionKey: string;
  botEmoji?: string;
  botName?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifySession(sessionKey: string): SessionType {
  if (sessionKey.includes(":peer:")) return "direct";
  if (sessionKey.includes(":channel:")) return "channel";
  if (sessionKey.includes(":guild:")) return "group";
  if (sessionKey.includes("cron:")) return "cron";
  return "system";
}

function sessionTypeLabel(type: SessionType): string {
  switch (type) {
    case "direct":
      return "Direct Message";
    case "channel":
      return "Channel";
    case "group":
      return "Group";
    case "cron":
      return "Cron Job";
    case "system":
      return "System";
  }
}

function sessionTypeIcon(type: SessionType): string {
  switch (type) {
    case "direct":
      return "💬";
    case "channel":
      return "📡";
    case "group":
      return "👥";
    case "cron":
      return "⏰";
    case "system":
      return "⚙️";
  }
}

function extractChannelFromKey(sessionKey: string): string | null {
  const match = sessionKey.match(/:channel:(\w+)/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// ChatMessage — single message bubble
// ---------------------------------------------------------------------------

function ChatMessage({
  entry,
  botEmoji,
  botName,
}: {
  entry: ChatEntry;
  botEmoji?: string;
  botName?: string;
}) {
  const isBot = entry.role === "assistant";
  const isSystem = entry.role === "system" || entry.role === "tool";

  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {entry.content.length > 120
            ? entry.content.slice(0, 120) + "…"
            : entry.content}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2 py-1.5", isBot ? "flex-row" : "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm",
          isBot ? "bg-primary/10" : "bg-secondary",
        )}
      >
        {isBot ? (botEmoji ?? "🤖") : "👤"}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-3 py-2 text-sm",
          isBot
            ? "bg-card border text-card-foreground"
            : "bg-primary text-primary-foreground",
        )}
      >
        {/* Sender label */}
        <div className="text-xs font-medium opacity-70 mb-0.5">
          {isBot ? (botName ?? "Bot") : "User"}
          {entry.channelName && (
            <span
              className="ml-1.5 inline-block w-2 h-2 rounded-full align-middle"
              style={{
                backgroundColor:
                  channelBrandColor[entry.channelName as keyof typeof channelBrandColor] ??
                  channelBrandColorDefault,
              }}
            />
          )}
        </div>

        {/* Content */}
        <div className="whitespace-pre-wrap break-words">{entry.content}</div>

        {/* Timestamp + tokens */}
        <div className="text-[10px] opacity-50 mt-1 text-right">
          {timeAgo(entry.timestamp)}
          {entry.tokenCount != null && entry.tokenCount > 0 && (
            <span className="ml-2">{(entry.tokenCount / 1000).toFixed(1)}K tok</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TokenCounter — bottom bar showing session token usage
// ---------------------------------------------------------------------------

function TokenCounter({
  messages,
  sessionType,
}: {
  messages: ChatEntry[];
  sessionType: SessionType;
}) {
  const totalTokens = useMemo(
    () => messages.reduce((sum, m) => sum + (m.tokenCount ?? 0), 0),
    [messages],
  );

  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground px-3 py-2 border-t bg-muted/30">
      <span>
        {sessionTypeIcon(sessionType)} {sessionTypeLabel(sessionType)} &middot;{" "}
        {messages.length} messages
      </span>
      <span>
        {totalTokens > 0 && (
          <>
            {(totalTokens / 1000).toFixed(1)}K tokens &middot; ~$
            {estimateCostUsd({ inputTokens: totalTokens * 0.6, outputTokens: totalTokens * 0.4, cachedInputTokens: totalTokens * 0.2 }).toFixed(3)}
          </>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionLiveTail — main component
// ---------------------------------------------------------------------------

export function SessionLiveTail({
  botId,
  sessionKey,
  botEmoji,
  botName,
  className,
}: SessionLiveTailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const sessionType = useMemo(() => classifySession(sessionKey), [sessionKey]);
  const channelName = useMemo(() => extractChannelFromKey(sessionKey), [sessionKey]);

  // Fetch chat history
  const { data: history, isLoading } = useQuery({
    queryKey: ["fleet", "chat-history", botId, sessionKey],
    queryFn: () => fleetMonitorApi.botFile(botId, `chat-history/${sessionKey}`),
    staleTime: 10_000,
    refetchInterval: 15_000, // fallback polling for live updates
  });

  // Parse JSONL chat history into ChatEntry[]
  const messages = useMemo<ChatEntry[]>(() => {
    if (!history?.content) return [];
    try {
      const lines = history.content.trim().split("\n").filter(Boolean);
      return lines.slice(-50).map((line, i) => {
        try {
          const parsed = JSON.parse(line);
          return {
            id: parsed.id ?? `msg-${i}`,
            role: parsed.role ?? "system",
            content: parsed.content ?? parsed.text ?? "[no content]",
            timestamp: parsed.timestamp ?? parsed.ts ?? new Date().toISOString(),
            tokenCount: parsed.usage?.totalTokens ?? parsed.tokenCount,
            channelName: channelName ?? undefined,
          } as ChatEntry;
        } catch {
          return {
            id: `msg-${i}`,
            role: "system" as const,
            content: line,
            timestamp: new Date().toISOString(),
          };
        }
      });
    } catch {
      return [];
    }
  }, [history, channelName]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(isAtBottom);
  }, []);

  return (
    <div className={cn("flex flex-col border rounded-lg overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span>{sessionTypeIcon(sessionType)}</span>
          <span className="truncate max-w-[200px]">{sessionKey.split(":").pop()}</span>
          {channelName && (
            <span
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-secondary"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor:
                    channelBrandColor[channelName as keyof typeof channelBrandColor] ??
                    channelBrandColorDefault,
                }}
              />
              {channelName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {autoScroll ? (
            <span className="text-green-500">Live</span>
          ) : (
            <button
              className="text-primary hover:underline"
              onClick={() => {
                setAutoScroll(true);
                scrollRef.current?.scrollTo({
                  top: scrollRef.current.scrollHeight,
                  behavior: "smooth",
                });
              }}
            >
              Resume auto-scroll
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 min-h-[200px] max-h-[500px]"
      >
        {isLoading && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading chat history…
          </div>
        )}
        {!isLoading && messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No messages in this session yet.
          </div>
        )}
        {messages.map((entry) => (
          <ChatMessage
            key={entry.id}
            entry={entry}
            botEmoji={botEmoji}
            botName={botName}
          />
        ))}
      </div>

      {/* Footer */}
      <TokenCounter messages={messages} sessionType={sessionType} />
    </div>
  );
}

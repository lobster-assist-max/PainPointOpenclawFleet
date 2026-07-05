/**
 * NotificationCenter — persistent fleet notification system.
 *
 * Provides:
 *  - NotificationProvider — React Context + LocalStorage persistence
 *  - NotificationBell — sidebar bell icon with unread badge
 *  - NotificationPanel — expandable notification list (popover)
 *
 * Collects notifications from fleet.* LiveEvents (alerts, connect/disconnect).
 * Keeps up to 50 notifications with FIFO eviction.
 */

import {
  createContext,
  forwardRef,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { useNavigate } from "@/lib/router";
import { timeAgo, useFleetAlerts, useFleetStatus } from "@/hooks/useFleetMonitor";
import type { AlertSeverity, BotConnectionState } from "@/api/fleet-monitor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FleetNotification {
  id: string;
  type: "alert" | "bot_connected" | "bot_disconnected" | "info";
  severity: "critical" | "warning" | "info" | "success";
  title: string;
  message: string;
  botEmoji?: string;
  botName?: string;
  /** The bot this notification is about — enables click-through to its detail page. */
  botId?: string;
  timestamp: string; // ISO
  read: boolean;
}

interface NotificationContextValue {
  notifications: FleetNotification[];
  unreadCount: number;
  push: (n: Omit<FleetNotification, "id" | "timestamp" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}

const STORAGE_KEY = "fleet-notifications";
const MAX_NOTIFICATIONS = 50;

function loadFromStorage(): FleetNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    /* localStorage unavailable or corrupted JSON — start fresh */
    return [];
  }
}

function saveToStorage(notifications: FleetNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch {
    // quota exceeded — silently drop
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<FleetNotification[]>(loadFromStorage);

  // Persist on change
  useEffect(() => {
    saveToStorage(notifications);
  }, [notifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const push = useCallback(
    (n: Omit<FleetNotification, "id" | "timestamp" | "read">) => {
      setNotifications((prev) => {
        const next = [
          {
            ...n,
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toISOString(),
            read: false,
          },
          ...prev,
        ];
        // FIFO eviction
        return next.slice(0, MAX_NOTIFICATIONS);
      });
    },
    [],
  );

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clear = useCallback(() => {
    setNotifications([]);
  }, []);

  const value = useMemo(
    () => ({ notifications, unreadCount, push, markRead, markAllRead, clear }),
    [notifications, unreadCount, push, markRead, markAllRead, clear],
  );

  return (
    <NotificationContext.Provider value={value}>
      <NotificationBridge />
      {children}
    </NotificationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// NotificationBridge — feeds the notification center from live fleet data
// ---------------------------------------------------------------------------

const SEEN_ALERTS_KEY = "fleet-notif-seen-alerts";
const MAX_SEEN_ALERTS = 200;

function loadSeenAlerts(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_ALERTS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    /* localStorage unavailable or corrupted — start fresh */
    return new Set();
  }
}

function saveSeenAlerts(seen: Set<string>) {
  try {
    // Keep only the most recent ids so the set can't grow without bound.
    const ids = Array.from(seen).slice(-MAX_SEEN_ALERTS);
    localStorage.setItem(SEEN_ALERTS_KEY, JSON.stringify(ids));
  } catch {
    /* quota exceeded — silently drop */
  }
}

function alertSeverityToNotif(sev: AlertSeverity): FleetNotification["severity"] {
  return sev === "critical" ? "critical" : sev === "warning" ? "warning" : "info";
}

const ONLINE_STATE: BotConnectionState = "monitoring";
const OFFLINE_STATES: ReadonlySet<BotConnectionState> = new Set<BotConnectionState>([
  "disconnected",
  "error",
  "backoff",
]);

/**
 * Watches the fleet alert stream + bot connection states (already polled by
 * the sidebar / dashboard) and turns new events into notifications. Renders
 * nothing. Mounted once inside the provider so the bell lights up app-wide.
 */
function NotificationBridge() {
  const { push } = useNotifications();
  const { data: alerts } = useFleetAlerts("firing");
  const { data: status } = useFleetStatus();

  const seenAlertsRef = useRef<Set<string>>(loadSeenAlerts());
  // Store name/emoji alongside state so a bot that VANISHES from the fleet
  // status (dropped by fleet-monitor after a disconnect/crash) can still be
  // announced by name — a removed bot is no longer in `status.bots`.
  const prevBotStatesRef = useRef<
    Map<string, { state: BotConnectionState; name: string; emoji: string }> | null
  >(null);

  // Firing alerts → notifications (deduped by alert id, across reloads).
  useEffect(() => {
    if (!alerts?.length) return;
    const seen = seenAlertsRef.current;
    let added = false;
    for (const alert of alerts) {
      if (seen.has(alert.id)) continue;
      seen.add(alert.id);
      added = true;
      push({
        type: "alert",
        severity: alertSeverityToNotif(alert.severity),
        title: alert.ruleName || "Fleet alert",
        message: alert.message,
        botEmoji: alert.botEmoji || undefined,
        botName: alert.botName || undefined,
        botId: alert.botId || undefined,
      });
    }
    if (added) saveSeenAlerts(seen);
  }, [alerts, push]);

  // Bot connect / disconnect transitions → notifications.
  useEffect(() => {
    const bots = status?.bots;
    if (!bots) return;
    const prev = prevBotStatesRef.current;
    const next = new Map<string, { state: BotConnectionState; name: string; emoji: string }>();
    for (const bot of bots) next.set(bot.botId, { state: bot.connectionState, name: bot.name, emoji: bot.emoji });

    // Skip the first snapshot so we don't announce every bot on initial load.
    if (prev) {
      for (const bot of bots) {
        const before = prev.get(bot.botId)?.state;
        if (before === undefined) continue; // newly-appeared bot, not a transition
        const after = bot.connectionState;
        if (before !== ONLINE_STATE && after === ONLINE_STATE) {
          push({
            type: "bot_connected",
            severity: "success",
            title: "Bot connected",
            message: `${bot.name} is now online.`,
            botEmoji: bot.emoji || undefined,
            botName: bot.name || undefined,
            botId: bot.botId || undefined,
          });
        } else if (before === ONLINE_STATE && OFFLINE_STATES.has(after)) {
          push({
            type: "bot_disconnected",
            severity: "warning",
            title: "Bot disconnected",
            message: `${bot.name} went offline (${after}).`,
            botEmoji: bot.emoji || undefined,
            botName: bot.name || undefined,
            botId: bot.botId || undefined,
          });
        }
      }

      // A previously-online bot that is no longer in the fleet status at all was
      // dropped by fleet-monitor (disconnected/crashed) — announce it too, using
      // the name/emoji captured before it vanished. Guard on companyId not
      // changing: a company switch replaces the whole bot set, and every prior
      // bot would look "removed". We can't see the company here, so require the
      // set to overlap (at least one prior bot still present) before treating a
      // missing bot as a genuine removal.
      const someOverlap = bots.some((b) => prev.has(b.botId));
      if (someOverlap) {
        for (const [botId, info] of prev) {
          if (info.state === ONLINE_STATE && !next.has(botId)) {
            push({
              type: "bot_disconnected",
              severity: "warning",
              title: "Bot disconnected",
              message: `${info.name} left the fleet.`,
              botEmoji: info.emoji || undefined,
              botName: info.name || undefined,
              botId: botId || undefined,
            });
          }
        }
      }
    }
    prevBotStatesRef.current = next;
  }, [status, push]);

  return null;
}

// ---------------------------------------------------------------------------
// NotificationBell — sidebar button with unread badge
// ---------------------------------------------------------------------------

export const NotificationBell = forwardRef<
  HTMLButtonElement,
  {
    onClick?: () => void;
    className?: string;
    panelOpen?: boolean;
  }
>(function NotificationBell({ onClick, className, panelOpen }, ref) {
  const { unreadCount } = useNotifications();

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center justify-center w-8 h-8 rounded-md",
        "hover:bg-accent transition-colors",
        className,
      )}
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      aria-expanded={panelOpen}
      aria-haspopup="dialog"
    >
      {/* Bell icon (inline SVG to avoid dependency) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-muted-foreground"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>

      {/* Unread badge */}
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Notification row
// ---------------------------------------------------------------------------

function severityDot(severity: FleetNotification["severity"]): string {
  switch (severity) {
    case "critical":
      return "bg-destructive";
    case "warning":
      return "bg-yellow-500 dark:bg-yellow-400";
    case "success":
      return "bg-green-500 dark:bg-green-400";
    default:
      return "bg-blue-500 dark:bg-blue-400";
  }
}

function NotificationRow({
  notification,
  onSelect,
}: {
  notification: FleetNotification;
  onSelect: (notification: FleetNotification) => void;
}) {
  // A notification about a specific bot is a click-through to that bot's detail
  // page (and marks it read); one without a bot just marks read.
  const linkable = !!notification.botId;
  return (
    <button
      type="button"
      className={cn(
        "flex gap-2 px-3 py-2 border-b last:border-b-0 cursor-pointer transition-colors hover:bg-muted/40 w-full text-left",
        !notification.read && "bg-primary/5",
      )}
      onClick={() => onSelect(notification)}
      aria-label={
        linkable
          ? `View ${notification.botName ?? "bot"} — ${notification.title}`
          : `Mark "${notification.title}" as read`
      }
    >
      {/* Severity dot */}
      <div className="flex-shrink-0 pt-1.5">
        <span
          className={cn("block w-2 h-2 rounded-full", severityDot(notification.severity))}
          aria-label={`Severity: ${notification.severity}`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-xs">
          {notification.botEmoji && <span>{notification.botEmoji}</span>}
          <span className={cn("font-medium", !notification.read && "text-foreground")}>
            {notification.title}
          </span>
        </div>
        <div className="text-xs text-muted-foreground truncate mt-0.5">
          {notification.message}
        </div>
        <div className="text-[10px] text-muted-foreground/60 mt-0.5">
          {timeAgo(notification.timestamp)}
        </div>
      </div>

      {/* Unread dot / click-through affordance */}
      <div className="flex-shrink-0 flex items-center gap-1.5 pt-1.5">
        {!notification.read && (
          <span className="block w-1.5 h-1.5 rounded-full bg-primary" aria-label="Unread" />
        )}
        {linkable && (
          <span className="text-muted-foreground/50" aria-hidden="true">
            ›
          </span>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// NotificationPanel — expandable list
// ---------------------------------------------------------------------------

export function NotificationPanel({
  open,
  onClose,
  triggerRef,
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** Ref to the trigger button — focus is restored here when the panel closes */
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  className?: string;
}) {
  const { notifications, markRead, markAllRead, clear, unreadCount } = useNotifications();
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Selecting a notification marks it read; if it's about a specific bot, close
  // the panel and navigate to that bot's detail page so the operator can act on
  // it — completing the alert/connect → investigate loop.
  const handleSelect = useCallback(
    (n: FleetNotification) => {
      markRead(n.id);
      if (n.botId) {
        onClose();
        navigate(`/bots/${n.botId}`);
      }
    },
    [markRead, onClose, navigate],
  );

  // Close on outside click or Escape key; restore focus to trigger
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
        triggerRef?.current?.focus();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        triggerRef?.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      className={cn(
        "absolute z-50 w-80 max-h-[400px] bg-popover border rounded-lg shadow-lg overflow-hidden flex flex-col",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
        <span className="text-sm font-medium">
          Notifications
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground ml-1">({unreadCount} unread)</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={markAllRead}
            >
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              onClick={clear}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-sm text-muted-foreground" role="status">
            No notifications yet
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationRow key={n.id} notification={n} onSelect={handleSelect} />
          ))
        )}
      </div>
    </div>
  );
}

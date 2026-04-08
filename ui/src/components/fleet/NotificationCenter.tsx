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
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/hooks/useFleetMonitor";

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
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// NotificationBell — sidebar button with unread badge
// ---------------------------------------------------------------------------

export function NotificationBell({
  onClick,
  className,
}: {
  onClick?: () => void;
  className?: string;
}) {
  const { unreadCount } = useNotifications();

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center justify-center w-8 h-8 rounded-md",
        "hover:bg-accent transition-colors",
        className,
      )}
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
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
}

// ---------------------------------------------------------------------------
// Notification row
// ---------------------------------------------------------------------------

function severityDot(severity: FleetNotification["severity"]): string {
  switch (severity) {
    case "critical":
      return "bg-destructive";
    case "warning":
      return "bg-yellow-500";
    case "success":
      return "bg-green-500";
    default:
      return "bg-blue-500";
  }
}

function NotificationRow({
  notification,
  onMarkRead,
}: {
  notification: FleetNotification;
  onMarkRead: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex gap-2 px-3 py-2 border-b last:border-b-0 cursor-pointer transition-colors hover:bg-muted/40 w-full text-left",
        !notification.read && "bg-primary/5",
      )}
      onClick={() => onMarkRead(notification.id)}
      aria-label={`Mark "${notification.title}" as read`}
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

      {/* Unread dot */}
      {!notification.read && (
        <div className="flex-shrink-0 pt-1.5">
          <span className="block w-1.5 h-1.5 rounded-full bg-primary" aria-label="Unread" />
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// NotificationPanel — expandable list
// ---------------------------------------------------------------------------

export function NotificationPanel({
  open,
  onClose,
  className,
}: {
  open: boolean;
  onClose: () => void;
  className?: string;
}) {
  const { notifications, markRead, markAllRead, unreadCount } = useNotifications();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape key
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

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
        {unreadCount > 0 && (
          <button
            className="text-xs text-primary hover:underline"
            onClick={markAllRead}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
            No notifications yet
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationRow key={n.id} notification={n} onMarkRead={markRead} />
          ))
        )}
      </div>
    </div>
  );
}

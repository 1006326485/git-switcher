import { useState, useEffect, useCallback, memo } from "react";
import * as api from "../lib/tauri";
import type { GitNotification } from "../lib/types";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

const EVENT_ICONS: Record<string, string> = {
  fetch: "📥",
  pull: "⬇️",
  push: "⬆️",
  stash: "📦",
  error: "⚠️",
  info: "ℹ️",
  tag: "🏷️",
  rebase: "🔄",
};

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

export const NotificationPanel = memo(function NotificationPanel({
  open,
  onClose,
}: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<GitNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getNotifications();
      setNotifications(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleMarkRead = useCallback(async (id: string) => {
    await api.markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const handleClearAll = useCallback(async () => {
    await api.clearNotifications();
    setNotifications([]);
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(unread.map((n) => api.markNotificationRead(n.id)));
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [notifications]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        className="absolute right-4 top-12 w-80 max-h-96 bg-[var(--surface-1)] rounded-xl shadow-2xl border border-[var(--border-color)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)]">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Notifications</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-blue-500 hover:text-blue-600"
            >
              Mark all read
            </button>
            <button
              onClick={handleClearAll}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Clear
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
            </div>
          )}

          {!loading && notifications.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">No notifications</p>
          )}

          {!loading && notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-2 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${
                !n.read ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
              }`}
              onClick={() => handleMarkRead(n.id)}
            >
              <span className="text-sm shrink-0">{EVENT_ICONS[n.event_type] || "📌"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                  {n.project_name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{n.message}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!n.read && (
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                )}
                <span className="text-xs text-gray-400">{formatRelativeTime(n.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// ── Unread Count Hook ─────────────────────────────────────────────────

export function useUnreadCount(intervalMs = 30000): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const c = await api.getUnreadCount();
        if (active) setCount(c);
      } catch {
        // ignore
      }
    };
    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return count;
}

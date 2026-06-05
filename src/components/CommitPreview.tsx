import { useState, useEffect, memo } from "react";
import { createPortal } from "react-dom";
import { gitGetLog } from "../lib/tauri";
import type { CommitInfo } from "../lib/types";

interface CommitPreviewProps {
  path: string;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}

export const CommitPreview = memo(function CommitPreview({ path, anchorRef, onClose }: CommitPreviewProps) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, [anchorRef]);

  useEffect(() => {
    let cancelled = false;
    gitGetLog(path, 3).then((log) => {
      if (!cancelled) {
        setCommits(log);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [path]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, anchorRef]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return createPortal(
    <div
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
      className="bg-[var(--surface-1)] border border-[var(--border-color)] rounded-xl shadow-lg p-3 min-w-[280px] max-w-[360px] animate-[fadeIn_0.15s_ease-out]"
    >
      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
        Recent Commits
      </div>
      {loading ? (
        <div className="text-xs text-gray-400">Loading...</div>
      ) : commits.length === 0 ? (
        <div className="text-xs text-gray-400 italic">No commits</div>
      ) : (
        <div className="space-y-1.5">
          {commits.map((c) => (
            <div key={c.hash} className="flex items-start gap-2 text-xs">
              <span className="font-mono text-gray-400 dark:text-gray-500 shrink-0">{c.short_hash}</span>
              <span className="text-gray-700 dark:text-gray-300 truncate flex-1">{c.message}</span>
              <span className="text-gray-400 dark:text-gray-500 shrink-0">{formatTime(c.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
});

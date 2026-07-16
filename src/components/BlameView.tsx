import { useState, useEffect, useRef, memo, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as api from "../lib/tauri";
import type { BlameLine } from "../lib/types";
import { parseError } from "../lib/types";

interface BlameViewProps {
  path: string;
  filePath: string;
  onClose: () => void;
}

const ROW_HEIGHT = 20;
const VIRTUALIZE_THRESHOLD = 200;

function timeAgo(ts: number): string {
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))}mo ago`;
  return `${Math.floor(diff / (86400 * 365))}y ago`;
}

function timeColorClass(ts: number): string {
  const now = Date.now() / 1000;
  const days = (now - ts) / 86400;
  if (days < 7) return "bg-blue-200/60 dark:bg-blue-800/40";
  if (days < 30) return "bg-blue-100/50 dark:bg-blue-900/25";
  return "bg-gray-100/40 dark:bg-gray-800/30";
}

export const BlameView = memo(function BlameView({ path, filePath, onClose }: BlameViewProps) {
  const [lines, setLines] = useState<BlameLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .blameFile(path, filePath)
      .then((data) => {
        if (!cancelled) setLines(data);
      })
      .catch((e) => {
        if (!cancelled) setError(parseError(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, filePath]);

  const useVirtual = lines.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 50,
  });

  // Track which lines start a new commit group (for merged cell effect)
  const groupStarts = useMemo(() => {
    const starts = new Set<number>();
    for (let i = 0; i < lines.length; i++) {
      if (i === 0 || lines[i].commit_id !== lines[i - 1].commit_id) {
        starts.add(i);
      }
    }
    return starts;
  }, [lines]);

  const renderLine = (blame: BlameLine, i: number) => {
    const isGroupStart = groupStarts.has(i);
    const colorClass = timeColorClass(blame.timestamp);

    return (
      <tr key={i} className={colorClass}>
        <td className="w-[68px] text-right pr-2 pl-2 select-none text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 font-mono text-[11px]">
          {isGroupStart ? blame.commit_id : ""}
        </td>
        <td className="w-[120px] px-2 truncate text-[11px] text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
          {isGroupStart ? blame.author : ""}
        </td>
        <td className="w-[72px] text-right px-2 text-[11px] text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700 tabular-nums shrink-0">
          {isGroupStart ? timeAgo(blame.timestamp) : ""}
        </td>
        <td className="w-12 text-right pr-2 pl-2 select-none text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700 tabular-nums">
          {blame.line}
        </td>
        <td className="whitespace-pre px-2">{blame.content}</td>
      </tr>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--surface-1)] rounded-xl shadow-xl w-[90vw] max-w-5xl h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--surface-2)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Blame</span>
            <span className="font-mono text-sm text-gray-700 dark:text-gray-300 truncate">{filePath}</span>
            {lines.length > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                {lines.length} lines
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            aria-label="Close blame view"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div ref={scrollRef} className="flex-1 overflow-auto font-mono text-xs leading-5">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">Loading blame...</div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-red-500">{error}</div>
          ) : lines.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">No blame data</div>
          ) : useVirtual ? (
            <table className="w-full border-collapse" style={{ height: virtualizer.getTotalSize() }}>
              <tbody>
                {virtualizer.getVirtualItems().map((vi) => renderLine(lines[vi.index], vi.index))}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((line, i) => renderLine(line, i))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
});
export default BlameView;

import { useState, useEffect, memo } from "react";
import * as api from "../lib/tauri";

interface DiffViewerProps {
  path: string;
  filePath: string;
  onClose: () => void;
}

interface DiffLine {
  type: "add" | "del" | "context" | "header";
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

function parseDiff(raw: string): DiffLine[] {
  const lines = raw.split("\n");
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      // Parse @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({ type: "header", content: line, oldLine: null, newLine: null });
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      result.push({ type: "add", content: line, oldLine: null, newLine });
      newLine++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      result.push({ type: "del", content: line, oldLine, newLine: null });
      oldLine++;
    } else if (line.startsWith("diff") || line.startsWith("index") || line.startsWith("---") || line.startsWith("+++")) {
      result.push({ type: "header", content: line, oldLine: null, newLine: null });
    } else {
      result.push({ type: "context", content: line, oldLine, newLine });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

const lineColors = {
  add: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200",
  del: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200",
  context: "",
  header: "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-semibold",
};

export const DiffViewer = memo(function DiffViewer({ path, filePath, onClose }: DiffViewerProps) {
  const [lines, setLines] = useState<DiffLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getFileDiff(path, filePath)
      .then((raw) => {
        if (cancelled) return;
        if (!raw.trim()) {
          setLines([]);
        } else {
          setLines(parseDiff(raw));
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, filePath]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--surface-1)] rounded-xl shadow-xl w-[90vw] max-w-4xl h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--surface-2)]">
          <span className="font-mono text-sm text-gray-700 dark:text-gray-300 truncate">{filePath}</span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            aria-label="Close diff viewer"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto font-mono text-xs leading-5">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">Loading diff...</div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-red-500">{error}</div>
          ) : lines.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">No changes</div>
          ) : (
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className={lineColors[line.type]}>
                    <td className="w-10 text-right pr-1 pl-1 select-none text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      {line.oldLine ?? ""}
                    </td>
                    <td className="w-10 text-right pr-1 pl-1 select-none text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                      {line.newLine ?? ""}
                    </td>
                    <td className="whitespace-pre px-2">{line.content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
});

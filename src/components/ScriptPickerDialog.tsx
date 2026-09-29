import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as api from "../lib/tauri";
import { parseError, type ProjectScript } from "../lib/types";
import {
  buildPickerItems,
  filterPickerItems,
  type PickerItem,
  type SavedCommandInput,
} from "../lib/scriptPicker";
import { dialogAnimation, scrimAnimation } from "./ui/primitives";
import { CloseIcon, SearchIcon } from "./ui/icons";

interface ScriptPickerDialogProps {
  open: boolean;
  projectPath: string;
  projectTitle: string;
  targets?: { path: string; title: string }[];
  onRun: (script: ProjectScript) => void;
  onClose: () => void;
}

export const ScriptPickerDialog = memo(function ScriptPickerDialog({
  open,
  projectPath,
  projectTitle,
  targets,
  onRun,
  onClose,
}: ScriptPickerDialogProps) {
  const [saved, setSaved] = useState<SavedCommandInput[]>([]);
  const [scripts, setScripts] = useState<ProjectScript[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [commandText, setCommandText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    setSaved([]);
    setScripts([]);
    setError(null);
    setLoading(true);
    let cancelled = false;
    Promise.all([api.listCustomCommands(), api.listProjectScripts(projectPath)])
      .then(([savedList, scriptList]) => {
        if (cancelled) return;
        setSaved(savedList);
        setScripts(scriptList);
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
  }, [open, projectPath]);

  const items = useMemo(
    () =>
      buildPickerItems(
        targets ? saved.filter((c) => !c.project_path) : saved,
        scripts,
        projectPath
      ),
    [saved, scripts, projectPath, targets]
  );
  const filtered = useMemo(() => filterPickerItems(items, query), [items, query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    setCommandText(filtered[selected]?.command ?? "");
  }, [filtered, selected]);

  const select = useCallback((index: number) => {
    setSelected(index);
  }, []);

  const run = useCallback(
    (item: PickerItem) => {
      if (!item) return;
      onRun({ name: item.name, command: commandText.trim() || item.command });
    },
    [onRun, commandText]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selected]) {
        e.preventDefault();
        run(filtered[selected]);
      }
    },
    [filtered, selected, run]
  );

  if (!open) return null;

  const savedItems = filtered.filter((i) => i.kind === "saved");
  const scriptItems = filtered.filter((i) => i.kind === "script");

  const renderItem = (item: PickerItem) => {
    const index = filtered.indexOf(item);
    return (
      <button
        key={`${item.kind}-${item.name}`}
        type="button"
        onClick={() => {
          select(index);
          run(item);
        }}
        onMouseEnter={() => select(index)}
        className={`w-full text-left px-4 py-2 flex items-baseline gap-2.5 transition-colors ${
          index === selected ? "bg-[var(--surface-2)]" : "hover:bg-gray-50 dark:hover:bg-gray-800"
        }`}
      >
        <span className="text-sm text-gray-900 dark:text-gray-100 shrink-0">{item.name}</span>
        {item.isGlobal && (
          <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0">Global</span>
        )}
        <span className="text-xs text-gray-400 truncate">{item.command}</span>
      </button>
    );
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center pt-[18vh] bg-black/40 backdrop-blur-sm ${scrimAnimation}`}
      onClick={onClose}
    >
      <div
        className={`select-none w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] shadow-2xl ${dialogAnimation}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="px-4 py-2.5 border-b border-[var(--border-color)] flex items-center gap-2.5">
          <SearchIcon size={14} />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Run Script</h2>
          <span className="text-xs text-gray-400 truncate flex-1">
            {targets ? `Run on ${targets.length} projects` : projectTitle}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-3 py-2 border-b border-[var(--border-color)]">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            placeholder="Filter commands and scripts"
            aria-label="Filter commands and scripts"
            className="w-full px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface-2)] border border-[var(--border-color)] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>

        <div className="max-h-64 overflow-y-auto py-1">
          {loading && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">Loading commands…</div>
          )}
          {!loading && error && (
            <div className="px-4 py-6 text-center text-sm text-red-500">{error}</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              {items.length === 0
                ? "No saved commands or scripts found"
                : "No matching commands"}
            </div>
          )}
          {!loading && !error && savedItems.length > 0 && (
            <>
              <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Saved Commands
              </div>
              {savedItems.map(renderItem)}
            </>
          )}
          {!loading && !error && scriptItems.length > 0 && (
            <>
              <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Scripts
              </div>
              {scriptItems.map(renderItem)}
            </>
          )}
        </div>

        <div className="px-3 py-2.5 border-t border-[var(--border-color)] flex items-center gap-2">
          <input
            type="text"
            value={commandText}
            onChange={(e) => setCommandText(e.target.value)}
            placeholder="Command"
            aria-label="Command to run"
            className="flex-1 px-2.5 py-1.5 text-sm font-mono rounded-md bg-[var(--surface-2)] border border-[var(--border-color)] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => {
              const item = filtered[selected];
              if (item) run(item);
            }}
            disabled={!filtered[selected] || !commandText.trim()}
            className="h-8 px-3 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
          >
            Run
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
});

export default ScriptPickerDialog;

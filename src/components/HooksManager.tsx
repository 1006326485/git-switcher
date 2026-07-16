import { useState, useCallback, useEffect, memo } from "react";
import * as api from "../lib/tauri";
import type { GitHook } from "../lib/types";
import { parseError } from "../lib/types";

interface HooksManagerProps {
  path: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string, rawError?: unknown, path?: string) => void;
}

export const HooksManager = memo(function HooksManager({ path, onSuccess, onError }: HooksManagerProps) {
  const [hooks, setHooks] = useState<GitHook[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [viewingHook, setViewingHook] = useState<string | null>(null);
  const [hookContent, setHookContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  const loadHooks = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listHooks(path);
      setHooks(list);
    } catch (e) {
      onError(`Failed to load hooks: ${parseError(e)}`);
    } finally {
      setLoading(false);
    }
  }, [path, onError]);

  useEffect(() => {
    if (expanded) loadHooks();
  }, [expanded, loadHooks]);

  const handleToggle = useCallback(
    async (hook: GitHook) => {
      setToggling((prev) => new Set(prev).add(hook.name));
      try {
        await api.toggleHook(path, hook.name, !hook.active);
        onSuccess(`Hook "${hook.name}" ${hook.active ? "disabled" : "enabled"}`);
        await loadHooks();
      } catch (e) {
        onError(`Failed to toggle hook: ${parseError(e)}`);
      } finally {
        setToggling((prev) => {
          const next = new Set(prev);
          next.delete(hook.name);
          return next;
        });
      }
    },
    [path, onSuccess, onError, loadHooks]
  );

  const handleViewContent = useCallback(
    async (hook: GitHook) => {
      if (viewingHook === hook.name) {
        setViewingHook(null);
        setHookContent(null);
        return;
      }
      setLoadingContent(true);
      setViewingHook(hook.name);
      try {
        const content = await api.getHookContent(path, hook.name);
        setHookContent(content);
      } catch (e) {
        setHookContent(`Error: ${parseError(e)}`);
      } finally {
        setLoadingContent(false);
      }
    },
    [path, viewingHook]
  );

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
      >
        <span>{expanded ? "▼" : "▶"}</span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.28 5.78a.75.75 0 00-1.06-1.06L7 7.94 5.78 6.72a.75.75 0 00-1.06 1.06l1.75 1.75a.75.75 0 001.06 0l3.75-3.75z" />
        </svg>
        Git Hooks
        {hooks.length > 0 && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            ({hooks.filter((h) => h.active).length}/{hooks.length})
          </span>
        )}
      </button>
      {expanded && (
        <div className="mt-1 ml-3 space-y-1">
          {loading ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">Loading...</p>
          ) : hooks.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">No hooks found</p>
          ) : (
            hooks.map((hook) => (
              <div key={hook.name} className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => handleToggle(hook)}
                    disabled={toggling.has(hook.name)}
                    className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 ${
                      hook.active
                        ? "bg-green-500"
                        : "bg-gray-300 dark:bg-gray-600"
                    }`}
                    aria-label={`Toggle hook ${hook.name}`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform duration-200 mt-0.5 ${
                        hook.active ? "translate-x-3.5 ml-0.5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <button
                    onClick={() => handleViewContent(hook)}
                    className={`flex-1 truncate text-left font-mono hover:underline ${
                      hook.active
                        ? "text-gray-800 dark:text-gray-200"
                        : "text-gray-400 dark:text-gray-500 line-through"
                    }`}
                    title={hook.name}
                  >
                    {hook.name}
                  </button>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {hook.active ? "on" : "off"}
                  </span>
                </div>
                {viewingHook === hook.name && (
                  <div className="ml-9 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden">
                    <pre className="p-2 text-[11px] font-mono max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-gray-800 dark:text-gray-200">
                      {loadingContent ? "Loading..." : hookContent ?? "Empty"}
                    </pre>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
});

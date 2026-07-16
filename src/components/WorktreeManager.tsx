import { useState, useCallback, memo } from "react";
import * as api from "../lib/tauri";
import type { WorktreeInfo } from "../lib/types";
import { parseError } from "../lib/types";
import { OperationConfirmDialog } from "./OperationConfirmDialog";

interface WorktreeManagerProps {
  path: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onInfo?: (msg: string) => void;
}

export const WorktreeManager = memo(function WorktreeManager({
  path,
  onSuccess,
  onError,
  onInfo,
}: WorktreeManagerProps) {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [showList, setShowList] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [createBranch, setCreateBranch] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState<string | null>(null);

  const loadWorktrees = useCallback(async () => {
    try {
      const list = await api.gitListWorktrees(path);
      setWorktrees(list);
    } catch (e) {
      onError(`Failed to load worktrees: ${parseError(e)}`);
    }
  }, [path, onError]);

  const handleToggleList = useCallback(async () => {
    const next = !showList;
    setShowList(next);
    if (next) {
      setLoading(true);
      await loadWorktrees();
      setLoading(false);
    }
  }, [showList, loadWorktrees]);

  const handleAdd = useCallback(async () => {
    if (!newName.trim()) return;
    setLoading(true);
    onInfo?.("Adding worktree...");
    try {
      await api.gitAddWorktree(
        path,
        newName.trim(),
        newBranch.trim() || undefined,
        createBranch
      );
      onSuccess(`Worktree "${newName.trim()}" created`);
      setNewName("");
      setNewBranch("");
      setCreateBranch(false);
      setShowAddForm(false);
      await loadWorktrees();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, newName, newBranch, createBranch, onSuccess, onError, onInfo, loadWorktrees]);

  const handleRemove = useCallback(
    async (name: string) => {
      setLoading(true);
      onInfo?.(`Removing worktree "${name}"...`);
      try {
        await api.gitRemoveWorktree(path, name);
        onSuccess(`Worktree "${name}" removed`);
        await loadWorktrees();
      } catch (e) {
        onError(parseError(e));
      } finally {
        setLoading(false);
        setConfirmRemoval(null);
      }
    },
    [path, onSuccess, onError, onInfo, loadWorktrees]
  );

  const handlePrune = useCallback(async () => {
    setLoading(true);
    onInfo?.("Pruning worktrees...");
    try {
      const pruned = await api.gitPruneWorktrees(path);
      if (pruned.length > 0) {
        onSuccess(`Pruned ${pruned.length} worktree(s): ${pruned.join(", ")}`);
      } else {
        onSuccess("No prunable worktrees found");
      }
      await loadWorktrees();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, onSuccess, onError, onInfo, loadWorktrees]);

  const shortPath = (p: string) => {
    const parts = p.split("/");
    return parts.length > 3 ? `.../${parts.slice(-2).join("/")}` : p;
  };

  return (
    <>
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggleList}
          aria-expanded={showList}
          aria-label="Toggle worktree list"
          className="flex-1 text-left text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1.5 transition-colors"
        >
          <span className={`transition-transform text-[10px] ${showList ? "rotate-90" : ""}`}>
            &#x25B6;
          </span>
          Worktrees
          {worktrees.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
              {worktrees.length}
            </span>
          )}
        </button>
        {showList && (
          <div className="flex gap-1">
            <button
              onClick={handlePrune}
              disabled={loading}
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
              title="Prune stale worktrees"
            >
              Prune
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              disabled={loading}
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors"
              title="Add worktree"
            >
              {showAddForm ? "Cancel" : "+ Add"}
            </button>
          </div>
        )}
      </div>

      {showList && (
        <div className="space-y-2">
          {/* Add form */}
          {showAddForm && (
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Worktree name"
                  aria-label="Worktree name"
                  className="flex-1 px-2 py-1 rounded border border-[var(--border-color)] bg-[var(--surface-1)] text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  placeholder="Branch (optional)"
                  aria-label="Branch name"
                  className="flex-1 px-2 py-1 rounded border border-[var(--border-color)] bg-[var(--surface-1)] text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={createBranch}
                    onChange={(e) => setCreateBranch(e.target.checked)}
                    className="rounded"
                  />
                  Create new branch
                </label>
                <button
                  onClick={handleAdd}
                  disabled={!newName.trim() || loading}
                  className="px-3 py-1 rounded text-xs font-medium bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white transition-colors"
                >
                  {loading ? "Adding..." : "Create"}
                </button>
              </div>
            </div>
          )}

          {/* Worktree list */}
          {loading && !showAddForm ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic py-1">
              Loading...
            </p>
          ) : worktrees.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic py-1">
              No worktrees
            </p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {worktrees.map((wt) => (
                <div
                  key={wt.name}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border-color)] text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
                        {wt.name}
                      </span>
                      {wt.branch && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-mono text-[10px]">
                          {wt.branch}
                        </span>
                      )}
                      {wt.is_locked && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px]">
                          locked
                        </span>
                      )}
                      {wt.is_prunable && (
                        <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px]">
                          prunable
                        </span>
                      )}
                    </div>
                    <span
                      className="text-[10px] text-gray-500 dark:text-gray-500 truncate block"
                      title={wt.path}
                    >
                      {shortPath(wt.path)}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => setConfirmRemoval(wt.name)}
                      disabled={loading || wt.is_locked}
                      className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50 hover:bg-red-200 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors"
                      aria-label={`Remove worktree ${wt.name}`}
                      title={wt.is_locked ? "Cannot remove locked worktree" : "Remove"}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
      {confirmRemoval && (
        <OperationConfirmDialog
          open
          operation="git_remove_worktree"
          targets={[{ path, label: confirmRemoval }]}
          onConfirm={() => handleRemove(confirmRemoval)}
          onCancel={() => setConfirmRemoval(null)}
        />
      )}
    </>
  );
});
export default WorktreeManager;

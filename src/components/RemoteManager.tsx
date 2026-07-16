import { useState, useCallback, memo } from "react";
import * as api from "../lib/tauri";
import type { RemoteInfo } from "../lib/types";
import { ConfirmDialog } from "./ConfirmDialog";

interface RemoteManagerProps {
  path: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const RemoteManager = memo(function RemoteManager({ path, onSuccess, onError }: RemoteManagerProps) {
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showList, setShowList] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [editingRemote, setEditingRemote] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<RemoteInfo | null>(null);

  const loadRemotes = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.gitListRemotes(path);
      setRemotes(list);
    } catch (e) {
      onError(`Failed to load remotes: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [path, onError]);

  const handleToggle = useCallback(async () => {
    const next = !showList;
    setShowList(next);
    if (next) await loadRemotes();
  }, [showList, loadRemotes]);

  const handleAdd = useCallback(async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    setLoading(true);
    try {
      await api.gitAddRemote(path, newName.trim(), newUrl.trim());
      onSuccess(`Remote "${newName.trim()}" added`);
      setNewName("");
      setNewUrl("");
      await loadRemotes();
    } catch (e) {
      onError(`Failed to add remote: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [path, newName, newUrl, onSuccess, onError, loadRemotes]);

  const handleRemove = useCallback(async () => {
    if (!confirmDelete) return;
    setLoading(true);
    try {
      await api.gitRemoveRemote(path, confirmDelete.name);
      onSuccess(`Remote "${confirmDelete.name}" removed`);
      setConfirmDelete(null);
      await loadRemotes();
    } catch (e) {
      onError(`Failed to remove remote: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [path, confirmDelete, onSuccess, onError, loadRemotes]);

  const handleStartEdit = useCallback((remote: RemoteInfo) => {
    setEditingRemote(remote.name);
    setEditUrl(remote.url);
  }, []);

  const handleSaveUrl = useCallback(async () => {
    if (!editingRemote || !editUrl.trim()) return;
    setLoading(true);
    try {
      await api.gitSetRemoteUrl(path, editingRemote, editUrl.trim());
      onSuccess(`URL updated for "${editingRemote}"`);
      setEditingRemote(null);
      await loadRemotes();
    } catch (e) {
      onError(`Failed to update URL: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [path, editingRemote, editUrl, onSuccess, onError, loadRemotes]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Remote name"
          aria-label="Remote name"
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs min-w-0 flex-1 basis-24 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <input
          type="text"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="URL"
          aria-label="Remote URL"
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs min-w-0 flex-1 basis-24 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim() || !newUrl.trim() || loading}
          aria-label="Add remote"
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 hover:bg-purple-200 dark:hover:bg-purple-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
        >
          {loading ? "Adding..." : "Add Remote"}
        </button>
        <button
          onClick={handleToggle}
          aria-label="Toggle remote list"
          aria-expanded={showList}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[var(--surface-2)] text-gray-700 dark:text-gray-300 border border-[var(--border-color)] hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-150 active:scale-[0.98]"
        >
          Remotes {remotes.length > 0 ? `(${remotes.length})` : ""}
        </button>
      </div>

      {showList && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {remotes.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">No remotes</p>
          ) : (
            remotes.map((r) => (
              <div key={r.name} className="flex items-center gap-2 text-xs">
                <span className="px-1.5 py-0.5 rounded font-mono bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 shrink-0">
                  {r.name}
                </span>
                {editingRemote === r.name ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <input
                      type="text"
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveUrl();
                        if (e.key === "Escape") setEditingRemote(null);
                      }}
                      className="flex-1 px-1.5 py-0.5 rounded border border-purple-400 bg-[var(--surface-1)] text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveUrl}
                      disabled={loading}
                      className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800/50 hover:bg-green-200 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingRemote(null)}
                      className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 truncate text-gray-500 dark:text-gray-400 font-mono" title={r.url}>
                      {r.url}
                    </span>
                    {r.push_url && r.push_url !== r.url && (
                      <span className="shrink-0 text-[10px] text-gray-400" title={`push: ${r.push_url}`}>
                        push: {r.push_url}
                      </span>
                    )}
                    <button
                      onClick={() => handleStartEdit(r)}
                      className="px-1.5 py-0.5 rounded-lg bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 hover:bg-blue-200 dark:hover:bg-blue-900/40 transition-colors active:scale-[0.98]"
                      aria-label={`Edit URL for ${r.name}`}
                      title="Edit URL"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmDelete(r)}
                      disabled={loading}
                      className="px-1.5 py-0.5 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50 hover:bg-red-200 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors active:scale-[0.98]"
                      aria-label={`Remove remote ${r.name}`}
                      title="Remove"
                    >
                      Del
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          open
          title="Remove Remote"
          message={<span>Remove remote "<strong>{confirmDelete.name}</strong>" ({confirmDelete.url})?</span>}
          confirmLabel="Remove"
          onConfirm={handleRemove}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
});

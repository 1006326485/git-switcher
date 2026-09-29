import { useState, useEffect, useCallback, memo } from "react";
import type { GitCredential } from "../lib/types";
import { getGitCredentials, upsertGitCredential, deleteGitCredential } from "../lib/tauri";

interface CredentialsSettingsProps {
  onError?: (msg: string) => void;
}

const MASK = "••••••••";

const emptyForm = { id: "", project_path: "", remote_url: "", username: "", secret: "" };

export const CredentialsSettings = memo(function CredentialsSettings({
  onError,
}: CredentialsSettingsProps) {
  const [creds, setCreds] = useState<GitCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCreds(await getGitCredentials());
    } catch (e) {
      onError?.(`Failed to load credentials: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = useCallback((c: GitCredential) => {
    setEditingId(c.id);
    setForm({
      id: c.id,
      project_path: c.project_path,
      remote_url: c.remote_url,
      username: c.username,
      // Do not prefill the secret; leaving it blank keeps the stored value.
      secret: "",
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
  }, []);

  const handleSubmit = useCallback(async () => {
    const remote_url = form.remote_url.trim();
    const username = form.username.trim();
    if (!remote_url || !username) return;
    setSaving(true);
    try {
      const existing = editingId ? creds.find((c) => c.id === editingId) : undefined;
      await upsertGitCredential({
        id: editingId ?? crypto.randomUUID(),
        project_path: form.project_path.trim(),
        remote_url,
        username,
        // Blank secret on edit means "keep current"; backend upserts the field,
        // so fall back to the stored secret to avoid wiping it.
        secret: form.secret || existing?.secret || "",
      });
      cancelEdit();
      await load();
    } catch (e) {
      onError?.(`Failed to save credential: ${e}`);
    } finally {
      setSaving(false);
    }
  }, [form, editingId, creds, cancelEdit, load, onError]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteGitCredential(id);
        setCreds((prev) => prev.filter((c) => c.id !== id));
      } catch (e) {
        onError?.(`Failed to delete credential: ${e}`);
      }
    },
    [onError]
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Git Credentials
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Credentials for private repository fetch/pull/push, matched by remote URL.
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Credentials are stored in the local database this phase; migrate to the OS
          keychain later for stronger protection.
        </p>
      </div>

      {/* Add / edit form */}
      <div className="space-y-2">
        <div className="flex gap-2 items-end">
          <div className="flex-[2]">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Remote URL
            </label>
            <input
              type="text"
              value={form.remote_url}
              onChange={(e) => setForm((f) => ({ ...f, remote_url: e.target.value }))}
              placeholder="https://github.com/acme/web.git"
              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Username
            </label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="git username"
              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Token / Password
            </label>
            <input
              type="password"
              value={form.secret}
              onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
              placeholder={editingId ? "leave blank to keep current" : "token or password"}
              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Project Path (optional)
            </label>
            <input
              type="text"
              value={form.project_path}
              onChange={(e) => setForm((f) => ({ ...f, project_path: e.target.value }))}
              placeholder="leave blank to apply to all projects"
              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.remote_url.trim() || !form.username.trim()}
            className="h-8 px-3 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
          >
            {saving ? "..." : editingId ? "Save" : "Add"}
          </button>
          {editingId && (
            <button
              onClick={cancelEdit}
              className="h-8 px-3 rounded-lg border border-[var(--border-color)] text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors shrink-0"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Credentials list */}
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : creds.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
          No credentials yet. Add one above.
        </p>
      ) : (
        <div className="space-y-1">
          {creds.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 group"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                  {c.remote_url}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {c.username}
                  {c.project_path ? ` · ${c.project_path}` : " · all projects"}
                </div>
              </div>
              <span
                className="text-xs font-mono text-gray-400 dark:text-gray-500 shrink-0"
                title="Secret is stored locally and masked"
              >
                {MASK}
              </span>
              <button
                onClick={() => startEdit(c)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-all shrink-0"
                title="Edit credential"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25c.081-.286.235-.547.445-.757l8.61-8.61z" />
                </svg>
              </button>
              <button
                onClick={() => handleDelete(c.id)}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all shrink-0"
                title="Delete credential"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

import { useState, useCallback, memo } from "react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../lib/tauri";
import type { RemoteInfo } from "../lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { ChipButton } from "./ui/ChipButton";
import { useContextMenu } from "../hooks/useContextMenu";
import { ContextMenu, MenuSeparator } from "./ui/ContextMenu";
import { MenuItem } from "./ui/primitives";

interface RemoteManagerProps {
  path: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const RemoteManager = memo(function RemoteManager({ path, onSuccess, onError }: RemoteManagerProps) {
  const { t } = useTranslation();
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showList, setShowList] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [editingRemote, setEditingRemote] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<RemoteInfo | null>(null);
  const [menuRemote, setMenuRemote] = useState<RemoteInfo | null>(null);
  const { onContextMenu, close, menuProps } = useContextMenu();

  const openRowMenu = useCallback(
    (e: MouseEvent, remote: RemoteInfo) => {
      const target = e.target;
      if (target instanceof Element && target.closest('button, input, textarea, a, [role="button"]')) return;
      setMenuRemote(remote);
      onContextMenu(e);
    },
    [onContextMenu]
  );

  const loadRemotes = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.gitListRemotes(path);
      setRemotes(list);
    } catch (e) {
      onError(t("remote.loadError", { error: e }));
    } finally {
      setLoading(false);
    }
  }, [path, onError, t]);

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
      onSuccess(t("remote.added", { name: newName.trim() }));
      setNewName("");
      setNewUrl("");
      await loadRemotes();
    } catch (e) {
      onError(t("remote.addError", { error: e }));
    } finally {
      setLoading(false);
    }
  }, [path, newName, newUrl, onSuccess, onError, loadRemotes, t]);

  const handleRemove = useCallback(async () => {
    if (!confirmDelete) return;
    setLoading(true);
    try {
      await api.gitRemoveRemote(path, confirmDelete.name);
      onSuccess(t("remote.removed", { name: confirmDelete.name }));
      setConfirmDelete(null);
      await loadRemotes();
    } catch (e) {
      onError(t("remote.removeError", { error: e }));
    } finally {
      setLoading(false);
    }
  }, [path, confirmDelete, onSuccess, onError, loadRemotes, t]);

  const handleStartEdit = useCallback((remote: RemoteInfo) => {
    setEditingRemote(remote.name);
    setEditUrl(remote.url);
  }, []);

  const handleSaveUrl = useCallback(async () => {
    if (!editingRemote || !editUrl.trim()) return;
    setLoading(true);
    try {
      await api.gitSetRemoteUrl(path, editingRemote, editUrl.trim());
      onSuccess(t("remote.urlUpdated", { name: editingRemote }));
      setEditingRemote(null);
      await loadRemotes();
    } catch (e) {
      onError(t("remote.updateUrlError", { error: e }));
    } finally {
      setLoading(false);
    }
  }, [path, editingRemote, editUrl, onSuccess, onError, loadRemotes, t]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder={t("remote.namePlaceholder")}
          aria-label={t("remote.namePlaceholder")}
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs min-w-0 flex-1 basis-24 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <input
          type="text"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder={t("remote.urlPlaceholder")}
          aria-label={t("remote.urlAria")}
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs min-w-0 flex-1 basis-24 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <ChipButton
          onClick={handleAdd}
          disabled={!newName.trim() || !newUrl.trim() || loading}
          aria-label={t("remote.addAria")}
          tone="purple"
          size="md"
        >
          {loading ? t("remote.adding") : t("remote.add")}
        </ChipButton>
        <ChipButton
          onClick={handleToggle}
          aria-label={t("remote.toggleAria")}
          aria-expanded={showList}
          tone="surface"
          size="md"
        >
          {t("remote.list")} {remotes.length > 0 ? `(${remotes.length})` : ""}
        </ChipButton>
      </div>

      {showList && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {remotes.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">{t("remote.empty")}</p>
          ) : (
            remotes.map((r) => (
              <div
                key={r.name}
                className="flex items-center gap-2 text-xs"
                onContextMenu={(e) => openRowMenu(e, r)}
              >
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
                      {t("common.save")}
                    </button>
                    <button
                      onClick={() => setEditingRemote(null)}
                      className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-200"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 truncate text-gray-500 dark:text-gray-400 font-mono" title={r.url}>
                      {r.url}
                    </span>
                    {r.push_url && r.push_url !== r.url && (
                      <span className="shrink-0 text-[10px] text-gray-400" title={t("remote.pushLabel", { url: r.push_url })}>
                        {t("remote.pushLabel", { url: r.push_url })}
                      </span>
                    )}
                    <ChipButton
                      onClick={() => handleStartEdit(r)}
                      tone="blue"
                      size="sm"
                      aria-label={t("remote.editUrlAria", { name: r.name })}
                      title={t("remote.editUrlTitle")}
                    >
                      {t("remote.edit")}
                    </ChipButton>
                    <ChipButton
                      onClick={() => setConfirmDelete(r)}
                      disabled={loading}
                      tone="red"
                      size="sm"
                      aria-label={t("remote.removeAria", { name: r.name })}
                      title={t("common.remove")}
                    >
                      {t("remote.del")}
                    </ChipButton>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {menuRemote && (
        <ContextMenu {...menuProps} onClose={close}>
          <MenuItem label={t("remote.editUrlTitle")} onClick={() => handleStartEdit(menuRemote)} />
          <MenuItem
            label={t("remote.copyUrl")}
            onClick={() => void navigator.clipboard.writeText(menuRemote.url)}
          />
          <MenuItem
            label={t("remote.copyName")}
            onClick={() => void navigator.clipboard.writeText(menuRemote.name)}
          />
          <MenuSeparator />
          <MenuItem label={t("common.remove")} danger onClick={() => setConfirmDelete(menuRemote)} />
        </ContextMenu>
      )}

      {confirmDelete && (
        <ConfirmDialog
          open
          title={t("remote.removeTitle")}
          message={<span dangerouslySetInnerHTML={{ __html: t("remote.removeMessage", { name: confirmDelete.name, url: confirmDelete.url }) }} />}
          confirmLabel={t("common.remove")}
          onConfirm={handleRemove}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
});

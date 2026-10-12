import { useState, useEffect, useCallback, memo } from "react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../lib/tauri";
import type { TagInfo } from "../lib/types";
import { parseError } from "../lib/types";
import { useContextMenu } from "../hooks/useContextMenu";
import { Modal, Tabs, PrimaryButton, MenuItem } from "./ui/primitives";
import { ContextMenu, MenuSeparator } from "./ui/ContextMenu";
import { OperationConfirmDialog } from "./OperationConfirmDialog";

interface TagManagerProps {
  path: string;
  open: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const TagManager = memo(function TagManager({
  path,
  open,
  onClose,
  onSuccess,
  onError,
}: TagManagerProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"create" | "delete">("create");
  const [tagName, setTagName] = useState("");
  const [tagMessage, setTagMessage] = useState("");
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const loadTags = useCallback(async () => {
    if (!open) return;
    setLoadingTags(true);
    try {
      const list = await api.gitListTags(path);
      setTags(list);
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoadingTags(false);
    }
  }, [path, open, onError]);

  useEffect(() => {
    if (open) {
      loadTags();
    }
  }, [open, loadTags]);

  const handleCreate = useCallback(async () => {
    if (!tagName.trim()) return;
    setLoading(true);
    try {
      await api.gitCreateTag(path, tagName.trim(), tagMessage.trim() || undefined);
      onSuccess(t("tag.created", { name: tagName.trim() }));
      setTagName("");
      setTagMessage("");
      await loadTags();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, tagName, tagMessage, loadTags, onSuccess, onError, t]);

  const handleDelete = useCallback(async () => {
    if (!selectedTag) return;
    setLoading(true);
    try {
      await api.gitDeleteTag(path, selectedTag);
      onSuccess(t("tag.deleted", { name: selectedTag }));
      setSelectedTag("");
      await loadTags();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, selectedTag, loadTags, onSuccess, onError, t]);

  const [menuTag, setMenuTag] = useState<TagInfo | null>(null);
  const {
    onContextMenu: openTagMenu,
    close: closeTagMenu,
    menuProps: tagMenuProps,
  } = useContextMenu();

  const handleRowContextMenu = useCallback(
    (e: MouseEvent<HTMLButtonElement>, tag: TagInfo) => {
      const inner = (e.target as Element).closest('button, input, textarea, a, [role="button"]');
      if (inner && inner !== e.currentTarget) return;
      setMenuTag(tag);
      openTagMenu(e);
      e.preventDefault();
    },
    [openTagMenu]
  );

  const handlePushTag = useCallback(
    async (tag: TagInfo) => {
      try {
        await api.gitPushTag(path, tag.name);
        onSuccess(t("tag.pushedTag", { name: tag.name }));
      } catch (e) {
        onError(parseError(e));
      }
    },
    [path, onSuccess, onError, t]
  );

  const handleCopyTagName = useCallback(
    async (name: string) => {
      try {
        await navigator.clipboard.writeText(name);
        onSuccess(t("tag.copiedName", { name }));
      } catch (e) {
        onError(parseError(e));
      }
    },
    [onSuccess, onError, t]
  );

  const handleCheckoutTag = useCallback(
    async (tag: TagInfo) => {
      setCheckingOut(true);
      try {
        // switch_branch accepts tags: it checks out refs/tags/{name}, leaving a detached HEAD.
        await api.switchBranch(path, tag.name);
        onSuccess(t("tag.checkedOut", { name: tag.name }));
      } catch (e) {
        onError(parseError(e));
      } finally {
        setCheckingOut(false);
      }
    },
    [path, onSuccess, onError, t]
  );

  const openConfirmDelete = useCallback(() => setConfirmDelete(true), []);
  const handleConfirmDelete = useCallback(() => {
    setConfirmDelete(false);
    handleDelete();
  }, [handleDelete]);
  const handleCancelDelete = useCallback(() => setConfirmDelete(false), []);

  return (
    <Modal open={open} onClose={onClose} title={t("tag.title")} width="lg">
      <Tabs
        tabs={[
          { value: "create", label: t("tag.tabCreate") },
          { value: "delete", label: t("tag.tabDelete") },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="px-6 py-5">
        {tab === "create" && (
          <div className="space-y-4">
            <div>
              <label htmlFor="tag-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("tag.nameLabel")}
              </label>
              <input
                id="tag-name"
                type="text"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="v1.0.0"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
              />
            </div>
            <div>
              <label htmlFor="tag-message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("tag.messageLabel")}
              </label>
              <textarea
                id="tag-message"
                value={tagMessage}
                onChange={(e) => setTagMessage(e.target.value)}
                placeholder={t("tag.messagePlaceholder")}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 resize-none"
              />
            </div>
            <PrimaryButton
              onClick={handleCreate}
              disabled={!tagName.trim() || loading}
            >
              {loading ? t("tag.creating") : t("tag.create")}
            </PrimaryButton>
          </div>
        )}

        {tab === "delete" && (
          <div className="space-y-4">
            {loadingTags ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t("tag.loadingTags")}</p>
            ) : tags.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t("tag.empty")}</p>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t("tag.selectLabel")}
                </label>
                <div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border border-gray-200 dark:border-gray-700 p-2">
                  {tags.map((tag) => (
                    <button
                      key={tag.name}
                      onClick={() => setSelectedTag(tag.name)}
                      onContextMenu={(e) => handleRowContextMenu(e, tag)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedTag === tag.name
                          ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
                          : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <span className="font-mono font-medium">{tag.name}</span>
                      {tag.message && (
                        <span className="ml-2 text-gray-500 dark:text-gray-400 truncate">
                          {tag.message.split("\n")[0]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <PrimaryButton
              variant="danger"
              onClick={openConfirmDelete}
              disabled={!selectedTag || loading}
            >
              {loading ? t("tag.deleting") : t("tag.deleteTag", { name: selectedTag })}
            </PrimaryButton>
          </div>
        )}
      </div>

      {menuTag && (
        <ContextMenu {...tagMenuProps} onClose={closeTagMenu}>
          <MenuItem
            label={t("tag.checkoutTag")}
            disabled={checkingOut}
            onClick={() => handleCheckoutTag(menuTag)}
          />
          <MenuItem label={t("tag.pushTag")} onClick={() => handlePushTag(menuTag)} />
          <MenuItem label={t("tag.copyName")} onClick={() => handleCopyTagName(menuTag.name)} />
          <MenuSeparator />
          <MenuItem
            label={t("tag.delete")}
            danger
            onClick={() => {
              setSelectedTag(menuTag.name);
              openConfirmDelete();
            }}
          />
        </ContextMenu>
      )}

      <OperationConfirmDialog
        open={confirmDelete}
        operation="git_delete_tag"
        targets={selectedTag ? [{ path, label: selectedTag }] : []}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </Modal>
  );
});
export default TagManager;

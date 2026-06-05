import { useState, useEffect, useCallback, memo } from "react";
import * as api from "../lib/tauri";
import type { TagInfo } from "../lib/types";
import { Modal, Tabs, PrimaryButton } from "./ui/primitives";
import { ConfirmDialog } from "./ConfirmDialog";

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
  const [tab, setTab] = useState<"create" | "delete">("create");
  const [tagName, setTagName] = useState("");
  const [tagMessage, setTagMessage] = useState("");
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadTags = useCallback(async () => {
    if (!open) return;
    setLoadingTags(true);
    try {
      const list = await api.gitListTags(path);
      setTags(list);
    } catch (e) {
      onError(String(e));
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
      onSuccess(`Created tag "${tagName.trim()}"`);
      setTagName("");
      setTagMessage("");
      await loadTags();
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  }, [path, tagName, tagMessage, loadTags, onSuccess, onError]);

  const handleDelete = useCallback(async () => {
    if (!selectedTag) return;
    setLoading(true);
    try {
      await api.gitDeleteTag(path, selectedTag);
      onSuccess(`Deleted tag "${selectedTag}"`);
      setSelectedTag("");
      await loadTags();
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  }, [path, selectedTag, loadTags, onSuccess, onError]);

  const openConfirmDelete = useCallback(() => setConfirmDelete(true), []);
  const handleConfirmDelete = useCallback(() => {
    setConfirmDelete(false);
    handleDelete();
  }, [handleDelete]);
  const handleCancelDelete = useCallback(() => setConfirmDelete(false), []);

  return (
    <Modal open={open} onClose={onClose} title="Tag Manager">
      <Tabs
        tabs={[
          { value: "create", label: "Create" },
          { value: "delete", label: "Delete" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="px-6 py-5">
        {tab === "create" && (
          <div className="space-y-4">
            <div>
              <label htmlFor="tag-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tag Name
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
                Message (optional, creates annotated tag)
              </label>
              <textarea
                id="tag-message"
                value={tagMessage}
                onChange={(e) => setTagMessage(e.target.value)}
                placeholder="Release notes..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 resize-none"
              />
            </div>
            <PrimaryButton
              onClick={handleCreate}
              disabled={!tagName.trim() || loading}
            >
              {loading ? "Creating..." : "Create Tag"}
            </PrimaryButton>
          </div>
        )}

        {tab === "delete" && (
          <div className="space-y-4">
            {loadingTags ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading tags...</p>
            ) : tags.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No tags found.</p>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Tag to Delete
                </label>
                <div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border border-gray-200 dark:border-gray-700 p-2">
                  {tags.map((tag) => (
                    <button
                      key={tag.name}
                      onClick={() => setSelectedTag(tag.name)}
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
              {loading ? "Deleting..." : `Delete Tag "${selectedTag}"`}
            </PrimaryButton>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Tag"
        message={`Are you sure you want to delete tag "${selectedTag}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </Modal>
  );
});

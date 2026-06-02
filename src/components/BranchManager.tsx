import { useState, useCallback, useMemo, memo } from "react";
import * as api from "../lib/tauri";
import type { BranchInfo, MergeResult } from "../lib/types";
import { Modal, Tabs, PrimaryButton } from "./ui/primitives";
import { SelectDropdown } from "./ui/SelectDropdown";
import { ConfirmDialog } from "./ConfirmDialog";

interface BranchManagerProps {
  path: string;
  branches: BranchInfo[];
  currentBranch: string;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const BranchManager = memo(function BranchManager({
  path,
  branches,
  currentBranch,
  open,
  onClose,
  onRefresh,
  onSuccess,
  onError,
}: BranchManagerProps) {
  const [tab, setTab] = useState<"create" | "delete" | "merge">("create");
  const [newBranchName, setNewBranchName] = useState("");
  const [fromBranch, setFromBranch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState(false);

  const localBranches = branches.filter((b) => !b.is_remote);

  const fromBranchOptions = useMemo(() => [
    { value: "", label: "HEAD (current)" },
    ...localBranches.map((b) => ({ value: b.name, label: b.name })),
  ], [localBranches]);

  const otherBranchOptions = useMemo(() =>
    localBranches.filter((b) => !b.is_current).map((b) => ({ value: b.name, label: b.name })),
    [localBranches]
  );

  const handleCreate = useCallback(async () => {
    if (!newBranchName.trim()) return;
    setLoading(true);
    try {
      await api.createBranch(path, newBranchName.trim(), fromBranch || undefined);
      onSuccess(`Created branch "${newBranchName.trim()}"`);
      setNewBranchName("");
      await onRefresh();
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  }, [path, newBranchName, fromBranch, onRefresh, onSuccess, onError]);

  const handleDelete = useCallback(async () => {
    if (!selectedBranch || selectedBranch === currentBranch) return;
    setLoading(true);
    try {
      await api.deleteBranch(path, selectedBranch);
      onSuccess(`Deleted branch "${selectedBranch}"`);
      setSelectedBranch("");
      await onRefresh();
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  }, [path, selectedBranch, currentBranch, onRefresh, onSuccess, onError]);

  const handleMerge = useCallback(async () => {
    if (!selectedBranch || selectedBranch === currentBranch) return;
    setLoading(true);
    try {
      const result: MergeResult = await api.mergeBranch(path, selectedBranch);
      if (result.success) {
        onSuccess(result.message);
      } else {
        onError(`${result.message}: ${result.conflicts?.join(", ") || "unknown conflicts"}`);
      }
      setSelectedBranch("");
      await onRefresh();
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  }, [path, selectedBranch, currentBranch, onRefresh, onSuccess, onError]);

  const handleConfirmDelete = useCallback(() => {
    setConfirmDelete(false);
    handleDelete();
  }, [handleDelete]);

  const handleCancelDelete = useCallback(() => setConfirmDelete(false), []);

  const handleConfirmMerge = useCallback(() => {
    setConfirmMerge(false);
    handleMerge();
  }, [handleMerge]);

  const handleCancelMerge = useCallback(() => setConfirmMerge(false), []);
  const openConfirmDelete = useCallback(() => setConfirmDelete(true), []);
  const openConfirmMerge = useCallback(() => setConfirmMerge(true), []);

  return (
    <Modal open={open} onClose={onClose} title="Branch Manager">
      <Tabs
        tabs={[
          { value: "create", label: "Create" },
          { value: "delete", label: "Delete" },
          { value: "merge", label: "Merge" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="px-6 py-5">
        {tab === "create" && (
          <div className="space-y-4">
            <div>
              <label htmlFor="new-branch-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Branch Name
              </label>
              <input
                id="new-branch-name"
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="feature/my-feature"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                From Branch (optional)
              </label>
              <SelectDropdown
                options={fromBranchOptions}
                value={fromBranch}
                onChange={setFromBranch}
                placeholder="HEAD (current)"
                ariaLabel="From branch"
              />
            </div>
            <PrimaryButton
              onClick={handleCreate}
              disabled={!newBranchName.trim() || loading}
            >
              {loading ? "Creating..." : "Create Branch"}
            </PrimaryButton>
          </div>
        )}

        {tab === "delete" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Select Branch to Delete
              </label>
              <SelectDropdown
                options={otherBranchOptions}
                value={selectedBranch}
                onChange={setSelectedBranch}
                placeholder="-- Select --"
                ariaLabel="Branch to delete"
              />
            </div>
            <PrimaryButton
              color="red"
              onClick={openConfirmDelete}
              disabled={!selectedBranch || loading}
            >
              {loading ? "Deleting..." : "Delete Branch"}
            </PrimaryButton>
          </div>
        )}

        {tab === "merge" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Merge Into Current ({currentBranch})
              </label>
              <SelectDropdown
                options={otherBranchOptions}
                value={selectedBranch}
                onChange={setSelectedBranch}
                placeholder="-- Select branch to merge --"
                ariaLabel="Branch to merge"
              />
            </div>
            <PrimaryButton
              color="green"
              onClick={openConfirmMerge}
              disabled={!selectedBranch || loading}
            >
              {loading ? "Merging..." : `Merge "${selectedBranch}" into "${currentBranch}"`}
            </PrimaryButton>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Branch"
        message={`Are you sure you want to delete "${selectedBranch}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
      <ConfirmDialog
        open={confirmMerge}
        title="Merge Branch"
        message={`Merge "${selectedBranch}" into "${currentBranch}"? This may create conflicts that need manual resolution.`}
        confirmLabel="Merge"
        confirmColor="green"
        onConfirm={handleConfirmMerge}
        onCancel={handleCancelMerge}
      />
    </Modal>
  );
});

import { useState, useCallback, useMemo, memo, lazy, Suspense } from "react";
import * as api from "../lib/tauri";
import type { BranchInfo, MergeResult } from "../lib/types";
import { parseError } from "../lib/types";
import { Modal, Tabs, PrimaryButton } from "./ui/primitives";
import { SelectDropdown } from "./ui/SelectDropdown";
import { ConfirmDialog } from "./ConfirmDialog";
import { OperationConfirmDialog } from "./OperationConfirmDialog";

const BranchCompareView = lazy(() => import("./BranchCompareView"));

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
  const [tab, setTab] = useState<"create" | "delete" | "merge" | "rebase" | "cherrypick" | "compare">("create");
  const [newBranchName, setNewBranchName] = useState("");
  const [fromBranch, setFromBranch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [commitHash, setCommitHash] = useState("");
  const [rebaseBranch, setRebaseBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareBranchA, setCompareBranchA] = useState("");
  const [compareBranchB, setCompareBranchB] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [mergeStrategy, setMergeStrategy] = useState<"default" | "no-ff" | "squash">("default");
  const [confirmCherryPick, setConfirmCherryPick] = useState(false);
  const [cherryPickConflicts, setCherryPickConflicts] = useState<string[] | null>(null);
  const [abortingCherryPick, setAbortingCherryPick] = useState(false);
  const [squashN, setSquashN] = useState(2);
  const [squashMsg, setSquashMsg] = useState("");
  const [confirmSquash, setConfirmSquash] = useState(false);
  const [confirmRebase, setConfirmRebase] = useState(false);

  const localBranches = branches.filter((b) => !b.is_remote);

  const fromBranchOptions = useMemo(() => [
    { value: "", label: "HEAD (current)" },
    ...localBranches.map((b) => ({ value: b.name, label: b.name })),
  ], [localBranches]);

  const otherBranchOptions = useMemo(() =>
    localBranches.filter((b) => !b.is_current).map((b) => ({
      value: b.name,
      label: b.name,
      hint: b.is_merged ? "merged" : "unmerged",
    })),
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
      onError(parseError(e));
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
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, selectedBranch, currentBranch, onRefresh, onSuccess, onError]);

  const handleMerge = useCallback(async () => {
    if (!selectedBranch || selectedBranch === currentBranch) return;
    setLoading(true);
    try {
      const result: MergeResult = await api.mergeBranch(path, selectedBranch, mergeStrategy);
      if (result.success) {
        onSuccess(result.message);
      } else {
        onError(`${result.message}: ${result.conflicts?.join(", ") || "unknown conflicts"}`);
      }
      setSelectedBranch("");
      await onRefresh();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, selectedBranch, currentBranch, mergeStrategy, onRefresh, onSuccess, onError]);

  const handleCherryPick = useCallback(async () => {
    if (!commitHash.trim()) return;
    setLoading(true);
    setCherryPickConflicts(null);
    try {
      const result: MergeResult = await api.gitCherryPick(path, commitHash.trim());
      if (result.success) {
        onSuccess(result.message);
      } else {
        setCherryPickConflicts(result.conflicts?.length ? result.conflicts : []);
      }
      setCommitHash("");
      await onRefresh();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, commitHash, onRefresh, onSuccess, onError]);

  const handleRebase = useCallback(async () => {
    if (!rebaseBranch) return;
    setLoading(true);
    try {
      const result = await api.gitRebase(path, rebaseBranch);
      if (result.success) {
        onSuccess(result.message || `Rebased onto "${rebaseBranch}"`);
        setRebaseBranch("");
      } else {
        const conflictInfo = result.conflicts.length > 0
          ? `\nConflicts: ${result.conflicts.join(", ")}`
          : "";
        onError(`${result.message}${conflictInfo}`);
      }
      await onRefresh();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, rebaseBranch, onRefresh, onSuccess, onError]);

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

  const handleConfirmCherryPick = useCallback(() => {
    setConfirmCherryPick(false);
    handleCherryPick();
  }, [handleCherryPick]);

  const handleCancelCherryPick = useCallback(() => setConfirmCherryPick(false), []);
  const openConfirmCherryPick = useCallback(() => setConfirmCherryPick(true), []);

  const handleAbortCherryPick = useCallback(async () => {
    setAbortingCherryPick(true);
    try {
      await api.gitAbortCherryPick(path);
      setCherryPickConflicts(null);
      onSuccess("Cherry-pick aborted");
      await onRefresh();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setAbortingCherryPick(false);
    }
  }, [path, onRefresh, onSuccess, onError]);


  const handleSquash = useCallback(async () => {
    if (squashN < 2) return;
    setLoading(true);
    try {
      const result = await api.gitSquashCommits(path, squashN, squashMsg.trim() || undefined);
      if (result.success) {
        onSuccess(result.message || `Squashed ${squashN} commits`);
        setSquashMsg("");
      } else {
        onError(result.message || "Squash failed");
      }
      onRefresh();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, squashN, squashMsg, onRefresh, onSuccess, onError]);

  const handleConfirmSquash = useCallback(() => { setConfirmSquash(false); handleSquash(); }, [handleSquash]);
  const handleCancelSquash = useCallback(() => setConfirmSquash(false), []);
  const openConfirmSquash = useCallback(() => setConfirmSquash(true), []);

  const handleConfirmRebase = useCallback(() => {
    setConfirmRebase(false);
    handleRebase();
  }, [handleRebase]);

  const handleCancelRebase = useCallback(() => setConfirmRebase(false), []);
  const openConfirmRebase = useCallback(() => setConfirmRebase(true), []);

  return (
    <Modal open={open} onClose={onClose} title="Branch Manager">
      <Tabs
        tabs={[
          { value: "create", label: "Create" },
          { value: "delete", label: "Delete" },
          { value: "merge", label: "Merge" },
          { value: "rebase", label: "Rebase" },
          { value: "cherrypick", label: "Cherry-pick" },
          { value: "compare", label: "Compare" },
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
              variant="danger"
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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Merge Strategy
              </label>
              <SelectDropdown
                options={[
                  { value: "default", label: "Default (fast-forward if possible)" },
                  { value: "no-ff", label: "No Fast-Forward (always merge commit)" },
                  { value: "squash", label: "Squash (stage changes only)" },
                ]}
                value={mergeStrategy}
                onChange={(v) => setMergeStrategy(v as "default" | "no-ff" | "squash")}
                placeholder="-- Select strategy --"
                ariaLabel="Merge strategy"
              />
            </div>
            <PrimaryButton
              variant="primary"
              onClick={openConfirmMerge}
              disabled={!selectedBranch || loading}
            >
              {loading ? "Merging..." : `Merge "${selectedBranch}" into "${currentBranch}"`}
            </PrimaryButton>
          </div>
        )}

        {tab === "rebase" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Rebase Current ({currentBranch}) Onto
              </label>
              <SelectDropdown
                options={otherBranchOptions}
                value={rebaseBranch}
                onChange={setRebaseBranch}
                placeholder="-- Select branch to rebase onto --"
                ariaLabel="Branch to rebase onto"
              />
            </div>
            <PrimaryButton
              variant="primary"
              onClick={openConfirmRebase}
              disabled={!rebaseBranch || loading}
            >
              {loading ? "Rebasing..." : `Rebase onto "${rebaseBranch}"`}
            </PrimaryButton>

            <hr className="border-[var(--border-color)]" />
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Squash Commits</h4>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Squash Last N Commits
                </label>
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={squashN}
                  onChange={(e) => setSquashN(Math.max(2, parseInt(e.target.value) || 2))}
                  className="w-24 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Commit Message (optional)
                </label>
                <input
                  type="text"
                  value={squashMsg}
                  onChange={(e) => setSquashMsg(e.target.value)}
                  placeholder="Squashed commit message"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <PrimaryButton
                variant="primary"
                onClick={openConfirmSquash}
                disabled={squashN < 2 || loading}
              >
                {loading ? "Squashing..." : `Squash Last ${squashN} Commits`}
              </PrimaryButton>
            </div>
          </div>
        )}

        {tab === "cherrypick" && (
          <div className="space-y-4">
            <div>
              <label htmlFor="commit-hash" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Commit Hash
              </label>
              <input
                id="commit-hash"
                type="text"
                value={commitHash}
                onChange={(e) => setCommitHash(e.target.value)}
                placeholder="abc1234..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
              />
            </div>
            <PrimaryButton
              variant="primary"
              onClick={openConfirmCherryPick}
              disabled={!commitHash.trim() || loading}
            >
              {loading ? "Cherry-picking..." : "Cherry-pick Commit"}
            </PrimaryButton>

            {cherryPickConflicts && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-red-700 dark:text-red-300">
                    Cherry-pick conflict ({cherryPickConflicts.length} file{cherryPickConflicts.length !== 1 ? "s" : ""})
                  </span>
                  <button
                    onClick={handleAbortCherryPick}
                    disabled={abortingCherryPick}
                    className="px-3 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                  >
                    {abortingCherryPick ? "Aborting..." : "Abort Cherry-pick"}
                  </button>
                </div>
                <ul className="text-xs text-red-600 dark:text-red-400 space-y-0.5 pl-4 list-disc">
                  {cherryPickConflicts.map((f) => (
                    <li key={f} className="font-mono">{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <OperationConfirmDialog
        open={confirmDelete}
        operation="delete_branch"
        targets={selectedBranch ? [{ path, label: selectedBranch }] : []}
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
      <OperationConfirmDialog
        open={confirmCherryPick}
        operation="git_cherry_pick"
        targets={commitHash.trim() ? [{ path, label: commitHash.trim() }] : []}
        onConfirm={handleConfirmCherryPick}
        onCancel={handleCancelCherryPick}
      />

      <OperationConfirmDialog
        open={confirmSquash}
        operation="git_squash_commits"
        targets={[{ path, label: `Last ${squashN} commits` }]}
        onConfirm={handleConfirmSquash}
        onCancel={handleCancelSquash}
      />
      <OperationConfirmDialog
        open={confirmRebase}
        operation="git_rebase"
        targets={rebaseBranch ? [{ path, label: `${currentBranch} onto ${rebaseBranch}` }] : []}
        onConfirm={handleConfirmRebase}
        onCancel={handleCancelRebase}
      />

        {tab === "compare" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Branch A</label>
              <SelectDropdown
                options={localBranches.map((b) => ({ value: b.name, label: b.name + (b.name === currentBranch ? " (current)" : "") }))}
                value={compareBranchA || currentBranch}
                onChange={setCompareBranchA}
                placeholder="Select branch"
                ariaLabel="Branch A"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Branch B</label>
              <SelectDropdown
                options={localBranches.map((b) => ({ value: b.name, label: b.name + (b.name === currentBranch ? " (current)" : "") }))}
                value={compareBranchB}
                onChange={setCompareBranchB}
                placeholder="Select branch"
                ariaLabel="Branch B"
              />
            </div>
            <PrimaryButton
              onClick={() => setCompareOpen(true)}
              disabled={!compareBranchA || !compareBranchB || compareBranchA === compareBranchB}
            >
              Compare
            </PrimaryButton>
            {compareOpen && compareBranchA && compareBranchB && (
              <Suspense fallback={null}>
                <BranchCompareView
                  path={path}
                  branchA={compareBranchA}
                  branchB={compareBranchB}
                  onClose={() => setCompareOpen(false)}
                />
              </Suspense>
            )}
          </div>
        )}

    </Modal>
  );
});
export default BranchManager;

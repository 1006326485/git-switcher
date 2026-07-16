import { useState, useCallback } from "react";
import type { ProjectDetail } from "../lib/types";
import { parseError } from "../lib/types";

interface UseProjectRowOptions {
  detail: ProjectDetail;
  onSwitchBranch: (path: string, branch: string) => Promise<ProjectDetail>;
  onRefresh: (path: string) => Promise<ProjectDetail>;
  onRemove: (id: string) => Promise<void>;
  /** Called when switching branch with uncommitted changes. Return true to proceed. */
  onConfirmDirtySwitch?: (branch: string, modified: number, untracked: number) => boolean | Promise<boolean>;
}

export function useProjectRow({ detail, onSwitchBranch, onRefresh, onRemove, onConfirmDirtySwitch }: UseProjectRowOptions) {
  const { project, status } = detail;
  const [switching, setSwitching] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [branchMgrOpen, setBranchMgrOpen] = useState(false);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  const [tagMgrOpen, setTagMgrOpen] = useState(false);
  const [stashMgrOpen, setStashMgrOpen] = useState(false);
  const [descEditTrigger, setDescEditTrigger] = useState(0);
  const [notesEditTrigger, setNotesEditTrigger] = useState(0);

  const handleSwitch = useCallback(
    async (branch: string) => {
      // Check for uncommitted changes before switching
      const hasChanges = status.modified > 0 || status.untracked > 0;
      if (hasChanges && onConfirmDirtySwitch) {
        const proceed = await onConfirmDirtySwitch(branch, status.modified, status.untracked);
        if (!proceed) return;
      }

      setSwitching(true);
      setSwitchingTo(branch);
      setError(null);
      try {
        await onSwitchBranch(project.path, branch);
      } catch (e) {
        setError(parseError(e));
      } finally {
        setSwitching(false);
        setSwitchingTo(null);
      }
    },
    [project.path, status.modified, status.untracked, onSwitchBranch, onConfirmDirtySwitch]
  );

  const handleGitRefresh = useCallback(async () => {
    try {
      await onRefresh(project.path);
    } catch (e) {
      setError(parseError(e));
    }
  }, [project.path, onRefresh]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await handleGitRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [handleGitRefresh]);

  const handleOpenLog = useCallback(() => setLogOpen(true), []);
  const handleCloseLog = useCallback(() => setLogOpen(false), []);
  const handleOpenBranchMgr = useCallback(() => setBranchMgrOpen(true), []);
  const handleCloseBranchMgr = useCallback(() => setBranchMgrOpen(false), []);
  const handleOpenAiReview = useCallback(() => setAiReviewOpen(true), []);
  const handleCloseAiReview = useCallback(() => setAiReviewOpen(false), []);
  const handleOpenTagMgr = useCallback(() => setTagMgrOpen(true), []);
  const handleCloseTagMgr = useCallback(() => setTagMgrOpen(false), []);
  const handleOpenStashMgr = useCallback(() => setStashMgrOpen(true), []);
  const handleCloseStashMgr = useCallback(() => setStashMgrOpen(false), []);
  const handleEditDescription = useCallback(() => setDescEditTrigger((n) => n + 1), []);
  const handleEditNotes = useCallback(() => setNotesEditTrigger((n) => n + 1), []);
  const handleRemove = useCallback(async () => {
    try {
      await onRemove(project.id);
    } catch (e) {
      setError(parseError(e));
    }
  }, [onRemove, project.id]);

  return {
    switching,
    switchingTo,
    refreshing,
    error,
    logOpen,
    branchMgrOpen,
    aiReviewOpen,
    tagMgrOpen,
    stashMgrOpen,
    handleSwitch,
    handleRefresh,
    handleGitRefresh,
    handleOpenLog,
    handleCloseLog,
    handleOpenBranchMgr,
    handleCloseBranchMgr,
    handleOpenAiReview,
    handleCloseAiReview,
    handleOpenTagMgr,
    handleCloseTagMgr,
    handleOpenStashMgr,
    handleCloseStashMgr,
    handleRemove,
    descEditTrigger,
    handleEditDescription,
    notesEditTrigger,
    handleEditNotes,
  };
}

import { useState, useCallback } from "react";
import type { ProjectDetail } from "../lib/types";

interface UseProjectRowOptions {
  detail: ProjectDetail;
  onSwitchBranch: (path: string, branch: string) => Promise<ProjectDetail>;
  onRefresh: (path: string) => Promise<ProjectDetail>;
  onRemove: (id: string) => Promise<void>;
}

export function useProjectRow({ detail, onSwitchBranch, onRefresh, onRemove }: UseProjectRowOptions) {
  const { project } = detail;
  const [switching, setSwitching] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [branchMgrOpen, setBranchMgrOpen] = useState(false);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);

  const handleSwitch = useCallback(
    async (branch: string) => {
      setSwitching(true);
      setSwitchingTo(branch);
      setError(null);
      try {
        await onSwitchBranch(project.path, branch);
      } catch (e) {
        setError(String(e));
      } finally {
        setSwitching(false);
        setSwitchingTo(null);
      }
    },
    [project.path, onSwitchBranch]
  );

  const handleGitRefresh = useCallback(async () => {
    try {
      await onRefresh(project.path);
    } catch (e) {
      setError(String(e));
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
  const handleRemove = useCallback(async () => {
    try {
      await onRemove(project.id);
    } catch (e) {
      setError(String(e));
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
    handleSwitch,
    handleRefresh,
    handleGitRefresh,
    handleOpenLog,
    handleCloseLog,
    handleOpenBranchMgr,
    handleCloseBranchMgr,
    handleOpenAiReview,
    handleCloseAiReview,
    handleRemove,
  };
}

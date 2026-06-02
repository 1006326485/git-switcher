import { useState, useCallback, useEffect, useRef, memo } from "react";
import type { BranchInfo, ReviewResult } from "../lib/types";
import * as api from "../lib/tauri";
import { Modal } from "./ui/primitives";
import { BranchDropdown } from "./BranchDropdown";
import { MarkdownViewer } from "./MarkdownViewer";

interface AiReviewDialogProps {
  open: boolean;
  onClose: () => void;
  projectPath: string;
  projectName: string;
  branches: BranchInfo[];
  currentBranch: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const AiReviewDialog = memo(function AiReviewDialog({
  open,
  onClose,
  projectPath,
  projectName,
  branches,
  currentBranch,
  onSuccess,
  onError,
}: AiReviewDialogProps) {
  const [baseBranch, setBaseBranch] = useState("main");
  const [headBranch, setHeadBranch] = useState(currentBranch);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Auto-select branches when dialog opens
  useEffect(() => {
    if (open) {
      const mainBranch = branches.find(
        (b) => !b.is_remote && (b.name === "main" || b.name === "master")
      );
      if (mainBranch) setBaseBranch(mainBranch.name);
      setHeadBranch(currentBranch);
    }
  }, [open, branches, currentBranch]);

  const handleReview = useCallback(async () => {
    if (!baseBranch || !headBranch || baseBranch === headBranch) {
      onError("Please select two different branches");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await api.aiReview(projectPath, baseBranch, headBranch);
      if (mountedRef.current) {
        setResult(res);
        onSuccess(`Review complete`);
      }
    } catch (e) {
      if (mountedRef.current) {
        const msg = typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
        onError(msg || "Review failed (check terminal for details)");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [projectPath, baseBranch, headBranch, onSuccess, onError]);

  return (
    <Modal open={open} onClose={onClose} title="AI Code Review" subtitle={projectName} maxWidth="max-w-3xl">
      <div className="px-6 py-5 space-y-5">
        {/* Branch selector */}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Base branch
            </label>
            <BranchDropdown
              currentBranch={baseBranch}
              branches={branches}
              onSwitch={setBaseBranch}
              allowCurrent
            />
          </div>

          <div className="pb-2 text-gray-400">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 8a.75.75 0 01.75-.75h10.69L9.22 4.03a.75.75 0 011.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06-1.06l3.22-3.22H1.75A.75.75 0 011 8z" />
            </svg>
          </div>

          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Head branch (review this)
            </label>
            <BranchDropdown
              currentBranch={headBranch}
              branches={branches}
              onSwitch={setHeadBranch}
              allowCurrent
            />
          </div>

          <button
            onClick={handleReview}
            disabled={loading || baseBranch === headBranch}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            {loading ? (
              <>
                <span className="animate-spin">&#x21BB;</span>
                Reviewing...
              </>
            ) : (
              <>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.28 5.78a.75.75 0 00-1.06-1.06L7 7.94 5.78 6.72a.75.75 0 00-1.06 1.06l1.75 1.75a.75.75 0 001.06 0l3.75-3.75z" />
                </svg>
                Review
              </>
            )}
          </button>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
            <div className="animate-spin text-3xl mb-3">&#x21BB;</div>
            <div className="text-sm font-medium">Analyzing code with AI...</div>
            <div className="text-xs mt-1">This may take 30-60 seconds</div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div>
            {/* Meta bar */}
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {result.model} &middot; {new Date(result.created_at).toLocaleString()}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {result.stats.files_changed} file{result.stats.files_changed !== 1 ? "s" : ""} &middot;{" "}
                <span className="text-green-600 dark:text-green-400">+{result.stats.total_additions}</span>{" "}
                <span className="text-red-600 dark:text-red-400">-{result.stats.total_deletions}</span>
              </span>
            </div>

            {/* Markdown content */}
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              <MarkdownViewer content={result.summary} />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
});

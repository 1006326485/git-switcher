import { useState, useCallback, useEffect, useRef, memo } from "react";
import { listen } from "@tauri-apps/api/event";
import type { BranchInfo, ReviewResult } from "../lib/types";
import * as api from "../lib/tauri";
import { Modal, Tabs } from "./ui/primitives";
import { AiGenerateIcon, ArrowRightIcon } from "./ui/icons";
import { BranchDropdown } from "./BranchDropdown";
import { MarkdownViewer } from "./MarkdownViewer";

type Tab = "review" | "history";

function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return JSON.stringify(e);
}

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
  const [tab, setTab] = useState<Tab>("review");
  const [baseBranch, setBaseBranch] = useState("main");
  const [headBranch, setHeadBranch] = useState(currentBranch);
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const mountedRef = useRef(true);
  const unlistenRef = useRef<(() => void) | null>(null);

  // History state
  const [history, setHistory] = useState<ReviewResult[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Clean up listener on unmount
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  // Auto-select branches when dialog opens
  useEffect(() => {
    if (open) {
      const mainBranch = branches.find(
        (b) => !b.is_remote && (b.name === "main" || b.name === "master")
      );
      if (mainBranch) setBaseBranch(mainBranch.name);
      setHeadBranch(currentBranch);
      setTab("review");
      setResult(null);
      setExpandedId(null);
    }
  }, [open, branches, currentBranch]);

  // Load history when switching to history tab
  useEffect(() => {
    if (!open || tab !== "history") return;
    let cancelled = false;
    setHistoryLoading(true);
    api
      .listReviews(projectPath)
      .then((reviews) => {
        if (!cancelled && mountedRef.current) setHistory(reviews);
      })
      .catch((e) => {
        if (!cancelled && mountedRef.current)
          onError(errorMessage(e) || "Failed to load review history");
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, projectPath, onError]);

  const handleReview = useCallback(async () => {
    if (!baseBranch || !headBranch || baseBranch === headBranch) {
      onError("Please select two different branches");
      return;
    }
    setLoading(true);
    setResult(null);
    setStreamingText("");
    setIsStreaming(true);

    // Set up SSE chunk listener
    if (unlistenRef.current) {
      unlistenRef.current();
    }
    unlistenRef.current = await listen<string>("ai-review-chunk", (event) => {
      if (mountedRef.current) {
        setStreamingText((prev) => prev + event.payload);
      }
    });

    try {
      const res = await api.aiReviewStreaming(projectPath, baseBranch, headBranch);
      if (mountedRef.current) {
        setResult(res);
        setIsStreaming(false);
        onSuccess(`Review complete`);
      }
    } catch (e) {
      if (mountedRef.current) {
        onError(errorMessage(e) || "Review failed (check terminal for details)");
        setIsStreaming(false);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    }
  }, [projectPath, baseBranch, headBranch, onSuccess, onError]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await api.deleteReview(id);
        if (mountedRef.current) {
          setHistory((prev) => prev.filter((r) => r.id !== id));
          if (expandedId === id) setExpandedId(null);
          onSuccess("Review deleted");
        }
      } catch (e) {
        if (mountedRef.current) {
          onError(errorMessage(e) || "Failed to delete review");
        }
      } finally {
        if (mountedRef.current) setDeletingId(null);
      }
    },
    [expandedId, onSuccess, onError]
  );

  const handleViewHistoryReview = useCallback((review: ReviewResult) => {
    setResult(review);
    setTab("review");
  }, []);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI Code Review"
      subtitle={projectName}
      maxWidth="max-w-3xl"
    >
      <Tabs
        tabs={[
          { value: "review" as Tab, label: "Review" },
          { value: "history" as Tab, label: "History" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "review" && (
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
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
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
                  <AiGenerateIcon size={14} />
                  Review
                </>
              )}
            </button>
          </div>

          {/* Loading / Streaming state */}
          {loading && !isStreaming && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
              <div className="animate-spin text-3xl mb-3">&#x21BB;</div>
              <div className="text-sm font-medium">Analyzing code with AI...</div>
              <div className="text-xs mt-1">Connecting to LLM...</div>
            </div>
          )}

          {isStreaming && streamingText && (
            <div className="relative">
              <div className="absolute top-0 right-0 flex items-center gap-1.5 px-2 py-1 text-xs text-blue-500 dark:text-blue-400">
                <span className="animate-pulse">&#x25CF;</span>
                Streaming...
              </div>
              <div className="max-h-[60vh] overflow-y-auto pr-1 pt-6">
                <MarkdownViewer content={streamingText} />
              </div>
            </div>
          )}

          {/* Results */}
          {result && !isStreaming && (
            <div>
              {/* Meta bar */}
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {result.model} &middot;{" "}
                  {new Date(result.created_at).toLocaleString()}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {result.stats.files_changed} file
                  {result.stats.files_changed !== 1 ? "s" : ""} &middot;{" "}
                  <span className="text-green-600 dark:text-green-400">
                    +{result.stats.total_additions}
                  </span>{" "}
                  <span className="text-red-600 dark:text-red-400">
                    -{result.stats.total_deletions}
                  </span>
                </span>
              </div>

              {/* Markdown content */}
              <div className="max-h-[60vh] overflow-y-auto pr-1">
                <MarkdownViewer content={result.summary} />
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="px-6 py-5">
          {historyLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
              <div className="animate-spin text-2xl mb-3">&#x21BB;</div>
              <div className="text-sm">Loading history...</div>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
              <svg
                aria-hidden="true"
                width="40"
                height="40"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="mb-3 opacity-40"
              >
                <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm.75 4.75a.75.75 0 00-1.5 0v3.5a.75.75 0 00.37.65l2.5 1.5a.75.75 0 10.76-1.3L8.75 7.72V4.75z" />
              </svg>
              <div className="text-sm font-medium">No reviews yet</div>
              <div className="text-xs mt-1">
                Run an AI review to see history here
              </div>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
              {history.map((review) => (
                <div
                  key={review.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  {/* Review header row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() =>
                        setExpandedId(
                          expandedId === review.id ? null : review.id
                        )
                      }
                      className="flex-1 flex items-center gap-3 text-left min-w-0"
                    >
                      <svg
                        aria-hidden="true"
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className={`text-gray-400 shrink-0 transition-transform ${
                          expandedId === review.id ? "rotate-90" : ""
                        }`}
                      >
                        <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
                      </svg>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {review.base_branch}
                          </span>
                          <svg
                            aria-hidden="true"
                            width="12"
                            height="12"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className="text-gray-400 shrink-0"
                          >
                            <path d="M1 8a.75.75 0 01.75-.75h10.69L9.22 4.03a.75.75 0 011.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06-1.06l3.22-3.22H1.75A.75.75 0 011 8z" />
                          </svg>
                          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {review.head_branch}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          <span>{review.model}</span>
                          <span>&middot;</span>
                          <span>
                            {new Date(review.created_at).toLocaleDateString()}{" "}
                            {new Date(review.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span>&middot;</span>
                          <span>
                            {review.stats.files_changed} file
                            {review.stats.files_changed !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleViewHistoryReview(review)}
                        title="View in Review tab"
                        className="p-1.5 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      >
                        <svg
                          aria-hidden="true"
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                        >
                          <path d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 010 1.798c-.45.678-1.367 1.932-2.637 3.023C11.671 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 010-1.798c.45-.678 1.367-1.932 2.637-3.023C4.329 2.992 6.019 2 8 2zm0 5a3 3 0 100 6 3 3 0 000-6zm0 2a1 1 0 110 2 1 1 0 010-2z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(review.id)}
                        disabled={deletingId === review.id}
                        title="Delete review"
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                      >
                        {deletingId === review.id ? (
                          <span className="animate-spin text-xs">&#x21BB;</span>
                        ) : (
                          <svg
                            aria-hidden="true"
                            width="14"
                            height="14"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                          >
                            <path d="M11 1.75V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM6.5 1.75v1.25h3V1.75a.25.25 0 00-.25-.25h-2.5a.25.25 0 00-.25.25zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded content */}
                  {expandedId === review.id && (
                    <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700/50">
                      <div className="pt-3 max-h-[40vh] overflow-y-auto pr-1">
                        <MarkdownViewer content={review.summary} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
});

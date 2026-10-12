import { useState, useEffect, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../lib/tauri";
import type { CommitInfo } from "../lib/types";
import { MenuItem, Modal } from "./ui/primitives";
import { ContextMenu, MenuSeparator } from "./ui/ContextMenu";
import { useContextMenu } from "../hooks/useContextMenu";
import { OperationConfirmDialog } from "./OperationConfirmDialog";

const LIMIT = 50;

interface GitLogViewerProps {
  path: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
  unpushedCount?: number;
  onRefresh?: () => void;
  onSuccess?: (message: string) => void;
}

export const GitLogViewer = memo(function GitLogViewer({ path, projectName, open, onClose, unpushedCount = 0, onRefresh, onSuccess }: GitLogViewerProps) {
  const { t } = useTranslation();
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Filter state
  const [authorFilter, setAuthorFilter] = useState("");
  const [messageFilter, setMessageFilter] = useState("");
  const [sinceFilter, setSinceFilter] = useState("");
  const [untilFilter, setUntilFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Interactive rebase state
  const [editingHash, setEditingHash] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<"reword" | "amend">("reword");
  const [confirmRewordHash, setConfirmRewordHash] = useState<string | null>(null);
  const [confirmAmend, setConfirmAmend] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [confirmDropHash, setConfirmDropHash] = useState<string | null>(null);
  const [confirmRevertHash, setConfirmRevertHash] = useState<string | null>(null);
  const [revertConflicts, setRevertConflicts] = useState<string[] | null>(null);
  const [rebaseLoading, setRebaseLoading] = useState(false);
  const [contextTarget, setContextTarget] = useState<{ commit: CommitInfo; index: number } | null>(null);
  const { onContextMenu, close, menuProps } = useContextMenu();

  const buildFilters = useCallback((): api.GitLogFilters => {
    const filters: api.GitLogFilters = {};
    if (authorFilter.trim()) filters.author = authorFilter.trim();
    if (messageFilter.trim()) filters.message_contains = messageFilter.trim();
    if (sinceFilter) filters.since = Math.floor(new Date(sinceFilter).getTime() / 1000);
    if (untilFilter) filters.until = Math.floor(new Date(untilFilter).getTime() / 1000);
    return filters;
  }, [authorFilter, messageFilter, sinceFilter, untilFilter]);

  const fetchLogs = useCallback(
    async (offset: number, append: boolean, filters: api.GitLogFilters) => {
      const data = await api.gitGetLog(path, LIMIT, offset, filters);
      if (append) {
        setCommits((prev) => [...prev, ...data]);
      } else {
        setCommits(data);
      }
      setHasMore(data.length >= LIMIT);
    },
    [path],
  );

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setHasMore(true);
    fetchLogs(0, false, buildFilters())
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [fetchLogs, buildFilters]);

  // Initial load when modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHasMore(true);
    fetchLogs(0, false, {})
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, path, fetchLogs]);

  // Surface an interrupted revert (e.g. reopened modal) so it can be finished.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const state = await api.gitOperationState(path);
        if (state === "revert") {
          const conflicts = await api.gitListConflicts(path);
          if (!cancelled) setRevertConflicts(conflicts);
        }
      } catch {
        // best-effort probe only
      }
    })();
    return () => { cancelled = true; };
  }, [open, path]);

  const handleApplyFilters = useCallback(() => {
    setLoading(true);
    setError(null);
    setHasMore(true);
    fetchLogs(0, false, buildFilters())
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [fetchLogs, buildFilters]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      await fetchLogs(commits.length, true, buildFilters());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingMore(false);
    }
  }, [commits.length, loadingMore, hasMore, fetchLogs, buildFilters]);

  const handleClearFilters = useCallback(() => {
    setAuthorFilter("");
    setMessageFilter("");
    setSinceFilter("");
    setUntilFilter("");
  }, []);

  const hasActiveFilters = authorFilter.trim() || messageFilter.trim() || sinceFilter || untilFilter;

  const formatDate = useCallback((ts: number) => {
    const d = new Date(ts * 1000);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return t("log.today");
    if (days === 1) return t("log.yesterday");
    if (days < 7) return t("log.daysAgo", { count: days });
    return d.toLocaleDateString();
  }, [t]);

  const handleStartReword = useCallback((c: CommitInfo) => {
    setEditMode("reword");
    setEditingHash(c.hash);
    setEditMessage(c.message);
  }, []);

  const handleStartAmend = useCallback((c: CommitInfo) => {
    setEditMode("amend");
    setEditingHash(c.hash);
    setEditMessage(c.message);
  }, []);

  const handleCancelReword = useCallback(() => {
    setEditingHash(null);
    setEditMessage("");
  }, []);

  const handleSaveReword = useCallback(async (hash: string) => {
    if (!editMessage.trim()) return;
    setRebaseLoading(true);
    try {
      await api.gitRewordCommit(path, hash, editMessage.trim());
      reload();
      onRefresh?.();
      setEditingHash(null);
      setEditMessage("");
    } catch (e) {
      setError(String(e));
    } finally {
      setRebaseLoading(false);
    }
  }, [path, editMessage, reload, onRefresh]);

  const handleDrop = useCallback(async (hash: string) => {
    setRebaseLoading(true);
    try {
      await api.gitDropCommit(path, hash);
      reload();
      onRefresh?.();
      setConfirmDropHash(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setRebaseLoading(false);
    }
  }, [path, reload, onRefresh]);

  const handleSaveAmend = useCallback(async () => {
    if (!editMessage.trim()) return;
    setRebaseLoading(true);
    try {
      await api.gitAmendCommit(path, editMessage.trim());
      reload();
      onRefresh?.();
      setEditingHash(null);
      setEditMessage("");
    } catch (e) {
      setError(String(e));
    } finally {
      setRebaseLoading(false);
    }
  }, [path, editMessage, reload, onRefresh]);

  const handleRevert = useCallback(async (hash: string) => {
    setConfirmRevertHash(null);
    setRebaseLoading(true);
    try {
      const result = await api.gitRevertCommit(path, hash);
      if (result.success) {
        setRevertConflicts(null);
        reload();
        onRefresh?.();
      } else {
        setRevertConflicts(result.conflicts);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRebaseLoading(false);
    }
  }, [path, reload, onRefresh]);

  const handleRevertRecovery = useCallback(async (action: "continue" | "abort") => {
    setRebaseLoading(true);
    try {
      if (action === "continue") {
        await api.gitRevertContinue(path);
      } else {
        await api.gitRevertAbort(path);
      }
      setRevertConflicts(null);
      reload();
      onRefresh?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setRebaseLoading(false);
    }
  }, [path, reload, onRefresh]);

  const isRewritable = useCallback((index: number) => {
    return unpushedCount > 0 && index < unpushedCount;
  }, [unpushedCount]);

  const closeContextMenu = useCallback(() => {
    close();
    setContextTarget(null);
  }, [close]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => onSuccess?.(t("log.copiedToClipboard")),
      () => {},
    );
  }, [onSuccess, t]);

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={t("log.title")}
      subtitle={projectName}
      width="xl"
    >
      {/* Filter toggle */}
      <div className="px-6 pb-2 flex items-center gap-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            showFilters || hasActiveFilters
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          {hasActiveFilters ? t("log.filtersActive") : t("log.filters")}
        </button>
        {unpushedCount > 0 && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            {unpushedCount === 1 ? t("log.unpushed_one", { count: unpushedCount }) : t("log.unpushed_other", { count: unpushedCount })}
          </span>
        )}
      </div>

      {/* Filter inputs */}
      {showFilters && (
        <div className="px-6 pb-3 space-y-2 border-b border-gray-100 dark:border-gray-700/50">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("log.author")}</label>
              <input
                type="text"
                value={authorFilter}
                onChange={(e) => setAuthorFilter(e.target.value)}
                placeholder={t("log.authorPlaceholder")}
                className="w-full px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("log.message")}</label>
              <input
                type="text"
                value={messageFilter}
                onChange={(e) => setMessageFilter(e.target.value)}
                placeholder={t("log.messagePlaceholder")}
                className="w-full px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("log.since")}</label>
              <input
                type="date"
                value={sinceFilter}
                onChange={(e) => setSinceFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("log.until")}</label>
              <input
                type="date"
                value={untilFilter}
                onChange={(e) => setUntilFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleApplyFilters}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              {t("log.apply")}
            </button>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {t("log.clear")}
              </button>
            )}
          </div>
        </div>
      )}

      {revertConflicts !== null && (
        <div className="px-6 pb-3">
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-red-700 dark:text-red-300">
                {t("log.revertRecovery")}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRevertRecovery("continue")}
                  disabled={rebaseLoading}
                  className="px-3 py-1 rounded text-xs bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  {t("log.continue")}
                </button>
                <button
                  onClick={() => handleRevertRecovery("abort")}
                  disabled={rebaseLoading}
                  className="px-3 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {t("log.abort")}
                </button>
              </div>
            </div>
            {revertConflicts.length > 0 && (
              <ul className="text-xs text-red-600 dark:text-red-400 space-y-0.5 pl-4 list-disc">
                {revertConflicts.map((f) => (
                  <li key={f} className="font-mono">{f}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="select-text max-h-[60vh] overflow-y-auto" role="region" aria-label={t("log.historyAria")}>
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <span className="animate-spin mr-2">&#x21BB;</span> {t("log.loading")}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-red-500 text-sm">
            {error}
          </div>
        ) : commits.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            {hasActiveFilters ? t("log.noMatch") : t("log.noCommits")}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/50 list-none m-0 p-0">
              {commits.map((c, index) => (
                <li
                  key={c.hash}
                  onContextMenu={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('button, input, textarea, a, [role="button"]')) return;
                    setContextTarget({ commit: c, index });
                    onContextMenu(e);
                  }}
                  className="px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 mt-1">
                      <div className={`w-2 h-2 rounded-full ${isRewritable(index) ? "bg-amber-500 dark:bg-amber-400" : "bg-blue-500 dark:bg-blue-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      {editingHash === c.hash ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editMessage}
                            onChange={(e) => setEditMessage(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-md border border-blue-400 dark:border-blue-500 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                if (editMode === "amend") setConfirmAmend(true);
                                else setConfirmRewordHash(c.hash);
                              }
                              if (e.key === "Escape") handleCancelReword();
                            }}
                            disabled={rebaseLoading}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                if (editMode === "amend") setConfirmAmend(true);
                                else setConfirmRewordHash(c.hash);
                              }}
                              disabled={rebaseLoading || !editMessage.trim()}
                              className="px-3 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
                            >
                              {rebaseLoading ? t("log.saving") : t("log.save")}
                            </button>
                            <button
                              onClick={handleCancelReword}
                              disabled={rebaseLoading}
                              className="px-3 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                              {t("log.cancel")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {c.message}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                            <span className="font-mono">{c.short_hash}</span>
                            <span>{c.author}</span>
                            <span>{formatDate(c.timestamp)}</span>
                            <div className="ml-auto flex gap-1">
                              {index === 0 && (
                                <button
                                  onClick={() => handleStartAmend(c)}
                                  className="px-2 py-0.5 rounded text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                                  title={t("log.amendHint")}
                                >
                                  {t("log.amend")}
                                </button>
                              )}
                              <button
                                onClick={() => setConfirmRevertHash(c.hash)}
                                className="px-2 py-0.5 rounded text-xs font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                                title={t("log.revertHint")}
                              >
                                {t("log.revert")}
                              </button>
                              {isRewritable(index) && (
                                <>
                                  <button
                                    onClick={() => handleStartReword(c)}
                                    className="px-2 py-0.5 rounded text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                    title={t("log.rewordHint")}
                                  >
                                    {t("log.reword")}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDropHash(c.hash)}
                                    className="px-2 py-0.5 rounded text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    title={t("log.dropHint")}
                                  >
                                    {t("log.drop")}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {hasMore && (
              <div className="px-6 py-3">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-300 transition-colors"
                >
                  {loadingMore ? t("log.loadingMore") : t("log.loadMore")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
      {contextTarget && (
        <ContextMenu {...menuProps} onClose={closeContextMenu}>
          {contextTarget.index === 0 && (
            <MenuItem
              label={t("log.amend")}
              onClick={() => {
                closeContextMenu();
                handleStartAmend(contextTarget.commit);
              }}
            />
          )}
          <MenuItem
            label={t("log.revert")}
            onClick={() => {
              closeContextMenu();
              setConfirmRevertHash(contextTarget.commit.hash);
            }}
          />
          {isRewritable(contextTarget.index) && (
            <MenuItem
              label={t("log.reword")}
              onClick={() => {
                closeContextMenu();
                handleStartReword(contextTarget.commit);
              }}
            />
          )}
          <MenuSeparator />
          <MenuItem
            label={t("log.copyHash")}
            onClick={() => {
              closeContextMenu();
              copyToClipboard(contextTarget.commit.short_hash);
            }}
          />
          <MenuItem
            label={t("log.copyFullHash")}
            onClick={() => {
              closeContextMenu();
              copyToClipboard(contextTarget.commit.hash);
            }}
          />
          <MenuItem
            label={t("log.copyMessage")}
            onClick={() => {
              closeContextMenu();
              copyToClipboard(contextTarget.commit.message);
            }}
          />
          {isRewritable(contextTarget.index) && (
            <>
              <MenuSeparator />
              <MenuItem
                danger
                label={t("log.drop")}
                onClick={() => {
                  closeContextMenu();
                  setConfirmDropHash(contextTarget.commit.hash);
                }}
              />
            </>
          )}
        </ContextMenu>
      )}
      {confirmDropHash && (
        <OperationConfirmDialog
          open
          operation="git_drop_commit"
          targets={[{ path, label: confirmDropHash.slice(0, 7) }]}
          onConfirm={() => handleDrop(confirmDropHash)}
          onCancel={() => setConfirmDropHash(null)}
        />
      )}
      {confirmRewordHash && (
        <OperationConfirmDialog
          open
          operation="git_reword_commit"
          targets={[{ path, label: confirmRewordHash.slice(0, 7) }]}
          onConfirm={() => {
            setConfirmRewordHash(null);
            return handleSaveReword(confirmRewordHash);
          }}
          onCancel={() => setConfirmRewordHash(null)}
        />
      )}
      {confirmAmend && (
        <OperationConfirmDialog
          open
          operation="git_amend"
          targets={[{ path, label: "HEAD" }]}
          onConfirm={() => {
            setConfirmAmend(false);
            return handleSaveAmend();
          }}
          onCancel={() => setConfirmAmend(false)}
        />
      )}
      {confirmRevertHash && (
        <OperationConfirmDialog
          open
          operation="git_revert"
          targets={[{ path, label: confirmRevertHash.slice(0, 7) }]}
          onConfirm={() => handleRevert(confirmRevertHash)}
          onCancel={() => setConfirmRevertHash(null)}
        />
      )}
    </>
  );
});
export default GitLogViewer;

import { useState, useEffect, useCallback, useRef, memo } from "react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import * as api from "../lib/tauri";
import type { ReflogEntry } from "../lib/types";
import { parseError } from "../lib/types";
import { useContextMenu } from "../hooks/useContextMenu";
import { ContextMenu, MenuSeparator } from "./ui/ContextMenu";
import { MenuItem } from "./ui/primitives";

function formatRelativeTime(t: TFunction, timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return t("reflog.justNow");
  if (diff < 3600) return t("reflog.mAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("reflog.hAgo", { count: Math.floor(diff / 3600) });
  if (diff < 604800) return t("reflog.dAgo", { count: Math.floor(diff / 86400) });
  return new Date(timestamp * 1000).toLocaleDateString();
}

// Git rejects refs containing whitespace, "..", or any of ~^:?*[\ ; anything else is
// accepted by `git branch`, so that is all the inline form needs to catch early.
const INVALID_BRANCH_NAME = /[\s~^:?*[\\]|\.\./;

function isValidBranchName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && !INVALID_BRANCH_NAME.test(trimmed);
}

interface ReflogViewProps {
  path: string;
  onRefresh?: () => Promise<void>;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

export const ReflogView = memo(function ReflogView({ path, onRefresh, onSuccess, onError }: ReflogViewProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ReflogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [branchEntry, setBranchEntry] = useState<ReflogEntry | null>(null);
  const [branchName, setBranchName] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.gitGetReflog(path, 50);
      if (!cancelledRef.current) setEntries(data);
    } catch (e) {
      if (!cancelledRef.current) setError(parseError(e));
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    return () => { cancelledRef.current = true; };
  }, [load]);

  const handleCheckout = useCallback(async (entry: ReflogEntry) => {
    setCheckingOut(entry.hash);
    try {
      await api.gitCheckoutCommit(path, entry.hash);
      onSuccess?.(t("reflog.checkedOut", { hash: entry.short_hash }));
      await onRefresh?.();
    } catch (e) {
      onError?.(parseError(e));
    } finally {
      setCheckingOut(null);
    }
  }, [path, onRefresh, onSuccess, onError, t]);

  const [menuEntry, setMenuEntry] = useState<ReflogEntry | null>(null);
  const {
    onContextMenu: openEntryMenu,
    close: closeEntryMenu,
    menuProps: entryMenuProps,
  } = useContextMenu();

  const handleRowContextMenu = useCallback(
    (e: MouseEvent<HTMLButtonElement>, entry: ReflogEntry) => {
      const inner = (e.target as Element).closest('button, input, textarea, a, [role="button"]');
      if (inner && inner !== e.currentTarget) return;
      setMenuEntry(entry);
      openEntryMenu(e);
      e.preventDefault();
    },
    [openEntryMenu]
  );

  const handleCopy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        onSuccess?.(t("reflog.copied", { text }));
      } catch (e) {
        onError?.(parseError(e));
      }
    },
    [onSuccess, onError, t]
  );

  const openBranchDialog = useCallback((entry: ReflogEntry) => {
    setBranchEntry(entry);
    setBranchName("");
  }, []);

  const closeBranchDialog = useCallback(() => {
    if (creatingBranch) return;
    setBranchEntry(null);
  }, [creatingBranch]);

  const handleCreateBranch = useCallback(async () => {
    if (!branchEntry || !isValidBranchName(branchName) || creatingBranch) return;
    setCreatingBranch(true);
    try {
      // createBranch(path, name, fromBranch?) points the new branch at the entry's full hash.
      await api.createBranch(path, branchName.trim(), branchEntry.hash);
      onSuccess?.(t("reflog.branchCreated", { name: branchName.trim() }));
      setBranchEntry(null);
      await onRefresh?.();
    } catch (e) {
      onError?.(parseError(e));
    } finally {
      setCreatingBranch(false);
    }
  }, [path, branchEntry, branchName, creatingBranch, onRefresh, onSuccess, onError, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
        <span className="ml-2 text-xs text-gray-500">{t("reflog.loading")}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-red-500 mb-2">{error}</p>
        <button onClick={load} className="text-xs text-blue-500 hover:underline">{t("common.retry")}</button>
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-4">{t("reflog.noEntries")}</p>;
  }

  return (
    <>
      <ul className="select-text divide-y divide-gray-100 dark:divide-gray-700/50 list-none m-0 p-0 max-h-48 overflow-y-auto">
      {entries.map((entry) => (
        <li key={`${entry.hash}-${entry.timestamp}`}>
          <button
            onClick={() => handleCheckout(entry)}
            onContextMenu={(e) => handleRowContextMenu(e, entry)}
            disabled={checkingOut === entry.hash}
            className="w-full text-left px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors disabled:opacity-50 flex items-start gap-2"
            title={t("reflog.checkoutTitle", { hash: entry.hash })}
          >
            <div className="shrink-0 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                {entry.message}
              </p>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                <span className="font-mono">{entry.short_hash}</span>
                <span>{entry.author}</span>
                <span>{formatRelativeTime(t, entry.timestamp)}</span>
                {checkingOut === entry.hash && <span className="text-blue-500">{t("reflog.checkingOut")}</span>}
              </div>
            </div>
          </button>
        </li>
      ))}
      </ul>

      {menuEntry && (
        <ContextMenu {...entryMenuProps} onClose={closeEntryMenu}>
          <MenuItem label={t("reflog.createBranch")} onClick={() => openBranchDialog(menuEntry)} />
          <MenuItem label={t("reflog.checkoutCommit")} onClick={() => handleCheckout(menuEntry)} />
          <MenuSeparator />
          <MenuItem label={t("reflog.copyHash")} onClick={() => handleCopy(menuEntry.short_hash)} />
          <MenuItem label={t("reflog.copyFullHash")} onClick={() => handleCopy(menuEntry.hash)} />
        </ContextMenu>
      )}

      {branchEntry && (
        <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("reflog.createBranchAt", { hash: branchEntry.short_hash })}
          </p>
          <input
            type="text"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeBranchDialog();
              if (e.key === "Enter") handleCreateBranch();
            }}
            placeholder={t("reflog.branchName")}
            aria-label={t("reflog.branchName")}
            disabled={creatingBranch}
            autoFocus
            className="w-full px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={closeBranchDialog}
              disabled={creatingBranch}
              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleCreateBranch}
              disabled={!isValidBranchName(branchName) || creatingBranch}
              className="px-3 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creatingBranch ? t("reflog.creatingBranch") : t("reflog.confirmCreateBranch")}
            </button>
          </div>
        </div>
      )}
    </>
  );
});

export default ReflogView;

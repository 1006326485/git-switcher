import { useMemo, useCallback, useRef, useState, memo, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import type { BranchInfo } from "../lib/types";
import { useDropdownPortal } from "../hooks/useDropdownPortal";
import { filterByFuzzy, parseFuzzyQuery } from "../lib/fuzzyMatch";
import { popoverAnimation } from "./ui/primitives";

interface BranchDropdownProps {
  currentBranch: string;
  branches: BranchInfo[];
  onSwitch: (branch: string) => void;
  loading?: boolean;
  /** When true, allow selecting the branch marked is_current (e.g. for branch-pair dialogs) */
  allowCurrent?: boolean;
  variant?: "default" | "compact";
}

export const BranchDropdown = memo(function BranchDropdown({
  currentBranch,
  branches,
  onSwitch,
  loading,
  allowCurrent,
  variant = "default",
}: BranchDropdownProps) {
  const { t } = useTranslation();
  const [copiedBranch, setCopiedBranch] = useState<string | null>(null);

  const {
    open, search, setSearch, activeIndex, setActiveIndex,
    pos, portalHeight, triggerRef, inputRef, listRef, portalRef,
    close, toggle,
  } = useDropdownPortal({ minWidth: 280 });

  const flatItems = useMemo(() => {
    const filtered = filterByFuzzy(branches, parseFuzzyQuery(search), (b) => [b.name]);
    const local = filtered.filter((b) => !b.is_remote && !b.is_tag);
    const remote = filtered.filter((b) => b.is_remote);
    const tags = filtered.filter((b) => b.is_tag);
    const items: { type: "header" | "branch"; label?: string; branch?: BranchInfo }[] = [];
    if (local.length > 0) {
      items.push({ type: "header", label: t("branchMenu.local") });
      for (const b of local) items.push({ type: "branch", branch: b });
    }
    if (remote.length > 0) {
      items.push({ type: "header", label: t("branchMenu.remote") });
      for (const b of remote) items.push({ type: "branch", branch: b });
    }
    if (tags.length > 0) {
      items.push({ type: "header", label: t("branchMenu.tags") });
      for (const b of tags) items.push({ type: "branch", branch: b });
    }
    return items;
  }, [branches, search, t]);

  const selectableIndices = useMemo(
    () => flatItems.reduce<number[]>((acc, item, i) => {
      if (item.type === "branch") acc.push(i);
      return acc;
    }, []),
    [flatItems]
  );

  // A branch Enter cannot pick: the checked-out one (unless allowed).
  const isBlocked = useCallback(
    (item: { type: "header" | "branch"; branch?: BranchInfo } | undefined): boolean =>
      !item || item.type !== "branch" || (!allowCurrent && !!item.branch?.is_current),
    [allowCurrent]
  );

  // Requirement: whatever the search query, the highlight is the FIRST match.
  // Every keystroke (typing, clearing, reformatting) drops the highlight back
  // to the first row of the NEW result set — the previous index refers to a
  // different list, and Enter after typing must run the top match, not
  // whatever now sits at the old position. A first match that cannot be
  // picked (the checked-out branch) is skipped for the first one that can.
  const topMatch = useMemo(() => {
    const first = selectableIndices.find((i) => !isBlocked(flatItems[i]));
    return first ?? selectableIndices[0] ?? -1;
  }, [selectableIndices, flatItems, isBlocked]);

  const prevSearch = useRef(search);
  if (prevSearch.current !== search) {
    prevSearch.current = search;
    if (activeIndex !== topMatch) setActiveIndex(topMatch);
  } else if (
    open &&
    activeIndex !== topMatch &&
    topMatch >= 0 &&
    (activeIndex < 0 || isBlocked(flatItems[activeIndex]))
  ) {
    // Results arrived or changed under the query (async branch list, or a
    // list that was empty when the menu opened): the highlight must still be
    // a branch that can be picked.
    setActiveIndex(topMatch);
  }

  // A fresh open starts on the first match too, so arrows and Enter work
  // straight away (before this, the highlight only appeared after the first
  // keystroke). Only the open transition reseeds; the user's own moves are
  // left alone, and an empty list keeps "nothing yet" pending until rows
  // arrive (the disabled-row branch above settles it then).
  const prevOpen = useRef(open);
  if (open && !prevOpen.current && topMatch >= 0) {
    setActiveIndex(topMatch);
  }
  prevOpen.current = open;

  const selectBranch = useCallback(
    (branch: BranchInfo) => {
      if (allowCurrent || !branch.is_current) {
        onSwitch(branch.name);
      }
      close();
    },
    [onSwitch, close, allowCurrent]
  );

  const copyBranchName = useCallback(async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      setCopiedBranch(name);
      setTimeout(() => setCopiedBranch(null), 1500);
    } catch {
      // fallback
    }
  }, []);

  // Custom keyboard handler — skips header items
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          if (selectableIndices.length === 0) break;
          setActiveIndex((prev) => {
            const pos = selectableIndices.indexOf(prev);
            const next = pos < selectableIndices.length - 1 ? pos + 1 : 0;
            return selectableIndices[next];
          });
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          if (selectableIndices.length === 0) break;
          setActiveIndex((prev) => {
            const pos = selectableIndices.indexOf(prev);
            const next = pos > 0 ? pos - 1 : selectableIndices.length - 1;
            return selectableIndices[next];
          });
          break;
        }
        case "Enter": {
          e.preventDefault();
          // Never a no-op on a blocked row: the checked-out branch cannot be
          // switched to, so Enter runs the first branch that can.
          const target =
            activeIndex >= 0 && !isBlocked(flatItems[activeIndex])
              ? flatItems[activeIndex]?.branch
              : topMatch >= 0
              ? flatItems[topMatch]?.branch
              : undefined;
          if (target) selectBranch(target);
          break;
        }
        case "Escape":
          e.preventDefault();
          close();
          break;
      }
    },
    [activeIndex, flatItems, selectableIndices, selectBranch, close, setActiveIndex, isBlocked, topMatch]
  );

  const handleToggle = useCallback(
    (e?: ReactMouseEvent) => {
      // Another select's open menu already consumed this press (see
      // useDropdownPortal): only close that one, never swap it for this.
      if (e?.defaultPrevented) return;
      if (!loading) toggle();
    },
    [loading, toggle]
  );

  return (
    <div ref={triggerRef} className="relative">
      {variant === "compact" ? (
        <button
          aria-label={t("branchMenu.branchAriaCompact", { branch: currentBranch })}
          aria-haspopup="listbox"
          aria-expanded={open}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleToggle}
          disabled={loading}
          className="font-mono text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md px-2 py-0.5 transition-colors truncate max-w-40 disabled:opacity-50"
        >
          {currentBranch}
        </button>
      ) : (
        <button
          aria-label={t("branchMenu.branchAria", { branch: currentBranch })}
          aria-haspopup="listbox"
          aria-expanded={open}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleToggle}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm w-full max-w-70 disabled:opacity-50"
        >
          <span className="text-green-600 dark:text-green-400 font-mono">
            &#x2442;
          </span>
          <span className="truncate flex-1 text-left font-medium">
            {currentBranch}
          </span>
          {loading ? (
            <span className="animate-spin">&#x21BB;</span>
          ) : (
            <span className="text-gray-400">&#x25BE;</span>
          )}
        </button>
      )}

      {open && pos && createPortal(
        <div
          ref={portalRef}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
            ...(pos.placeAbove ? { transform: `translateY(-${portalHeight}px)` } : null),
          }}
          className={`origin-bottom-left max-h-80 bg-(--surface-1) border border-(--border-color) rounded-xl shadow-lg overflow-hidden ${popoverAnimation}`}
        >
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("branchMenu.searchPlaceholder")}
              aria-label={t("branchMenu.searchAria")}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div ref={listRef} role="listbox" aria-label={t("branchMenu.listAria")} className="overflow-y-auto max-h-65">
            {flatItems.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                {t("branchMenu.empty")}
              </div>
            ) : (
              flatItems.map((item, i) => {
                if (item.type === "header") {
                  return (
                    <div
                      key={`header-${item.label}`}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase"
                    >
                      {item.label}
                    </div>
                  );
                }

                const b = item.branch!;
                const isActive = i === activeIndex;
                const isDisabled = b.is_current && !allowCurrent;

                // A div with button semantics, not a <button>: the row hosts
                // its own Copy control, and interactive content cannot nest
                // inside a native button.
                return (
                  <div
                    key={b.name}
                    data-index={i}
                    role="option"
                    tabIndex={-1}
                    aria-selected={isActive}
                    aria-disabled={isDisabled}
                    onClick={() => selectBranch(b)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`press w-full text-left px-3 py-2 text-sm flex items-center gap-2 group cursor-pointer transition-colors ${
                      isDisabled
                        ? "cursor-default opacity-60"
                        : isActive
                        ? "bg-blue-100 dark:bg-blue-900/30"
                        : "hover:bg-gray-100 dark:hover:bg-gray-700"
                    } ${
                      b.is_current
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                        : ""
                    }`}
                  >
                    {b.is_current && (
                      <span className="text-blue-500">&#x2713;</span>
                    )}
                    <span
                      className={`font-mono truncate flex-1 ${
                        b.is_remote || b.is_tag
                          ? "text-gray-500 dark:text-gray-400"
                          : ""
                      }`}
                    >
                      {b.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); copyBranchName(b.name); }}
                      className="opacity-0 group-hover:opacity-100 px-1 py-0.5 rounded text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all shrink-0"
                      title={t("branchMenu.copyTitle")}
                    >
                      {copiedBranch === b.name ? "✓" : t("branchMenu.copyLabel")}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});

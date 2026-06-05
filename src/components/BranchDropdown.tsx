import { useMemo, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import type { BranchInfo } from "../lib/types";
import { useDropdownPortal } from "../hooks/useDropdownPortal";

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
  const {
    open, search, setSearch, activeIndex, setActiveIndex,
    pos, triggerRef, inputRef, listRef, portalRef,
    close, toggle,
  } = useDropdownPortal({ minWidth: 280 });

  const flatItems = useMemo(() => {
    const filtered = branches.filter((b) =>
      b.name.toLowerCase().includes(search.toLowerCase())
    );
    const local = filtered.filter((b) => !b.is_remote);
    const remote = filtered.filter((b) => b.is_remote);
    const items: { type: "header" | "branch"; label?: string; branch?: BranchInfo }[] = [];
    if (local.length > 0) {
      items.push({ type: "header", label: "Local" });
      for (const b of local) items.push({ type: "branch", branch: b });
    }
    if (remote.length > 0) {
      items.push({ type: "header", label: "Remote" });
      for (const b of remote) items.push({ type: "branch", branch: b });
    }
    return items;
  }, [branches, search]);

  const selectableIndices = useMemo(
    () => flatItems.reduce<number[]>((acc, item, i) => {
      if (item.type === "branch") acc.push(i);
      return acc;
    }, []),
    [flatItems]
  );

  const selectBranch = useCallback(
    (branch: BranchInfo) => {
      if (allowCurrent || !branch.is_current) {
        onSwitch(branch.name);
      }
      close();
    },
    [onSwitch, close, allowCurrent]
  );

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
          if (activeIndex >= 0 && flatItems[activeIndex]?.branch) {
            selectBranch(flatItems[activeIndex].branch!);
          }
          break;
        }
        case "Escape":
          e.preventDefault();
          close();
          break;
      }
    },
    [activeIndex, flatItems, selectableIndices, selectBranch, close, setActiveIndex]
  );

  const handleToggle = useCallback(() => {
    if (!loading) toggle();
  }, [loading, toggle]);

  return (
    <div ref={triggerRef} className="relative">
      {variant === "compact" ? (
        <button
          aria-label={`Branch: ${currentBranch}. Click to switch.`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={handleToggle}
          disabled={loading}
          className="font-mono text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md px-2 py-0.5 transition-colors truncate max-w-40 disabled:opacity-50"
        >
          {currentBranch}
        </button>
      ) : (
        <button
          aria-label={`Branch: ${currentBranch}. Click to switch branch.`}
          aria-haspopup="listbox"
          aria-expanded={open}
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

      {open && createPortal(
        <div
          ref={portalRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="max-h-80 bg-(--surface-1) border border-(--border-color) rounded-xl shadow-lg overflow-hidden animate-[fadeIn_0.15s_ease-out]"
        >
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search branches..."
              aria-label="Search branches"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div ref={listRef} role="listbox" aria-label="Branches" className="overflow-y-auto max-h-65">
            {flatItems.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                No branches found
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

                return (
                  <button
                    key={b.name}
                    data-index={i}
                    role="option"
                    aria-selected={isActive}
                    aria-disabled={isDisabled}
                    onClick={() => selectBranch(b)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
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
                      className={`font-mono truncate ${
                        b.is_remote
                          ? "text-gray-500 dark:text-gray-400"
                          : ""
                      }`}
                    >
                      {b.name}
                    </span>
                  </button>
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

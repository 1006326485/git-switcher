import { useMemo, useCallback, useEffect, useRef, memo, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { useDropdownPortal } from "../../hooks/useDropdownPortal";
import { filterByFuzzy, parseFuzzyQuery } from "../../lib/fuzzyMatch";
import { popoverAnimation } from "./primitives";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  hint?: string;
  hintStyle?: "badge" | "text";
  /** Machine token for the hint badge color; when present the color
      decision uses this instead of the translated `hint` text. */
  hintKind?: "merged" | "unmerged";
}

interface SelectDropdownProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  size?: "md" | "sm";
  /** Increment to programmatically open the menu (e.g. from a hotkey). */
  openSignal?: number;
  /**
   * Alias trigger for the SAME hotkey action (the terminal sidebar's "New"
   * next to the header's): a press is forwarded here instead of opening a
   * local copy, so one press never opens two menus.
   */
  onOpenSignal?: () => void;
  /** Called after a selection, so the consumer can restore focus. */
  onAfterSelect?: () => void;
  /**
   * Option to highlight when the menu opens, overriding the default
   * "first enabled option". Used when a hotkey carries its own default
   * (e.g. Cmd+N = the active project).
   */
  preferredValue?: string;
}

/**
 * A listbox popover anchored under its trigger.
 *
 * First paint contract: coordinates are computed in a layout effect from the
 * trigger's real box before the browser paints, and the portal is not
 * rendered until they exist (useDropdownPortal), so the menu never appears
 * at the viewport's top-left corner first and then jump under the trigger.
 * The highlighted item is resolved during the very render that opens the
 * menu, so the first visible frame already shows the selection (no highlight
 * "resolve" flash on open).
 */
export const SelectDropdown = memo(function SelectDropdown({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  ariaLabel,
  size = "md",
  openSignal,
  onOpenSignal,
  onAfterSelect,
  preferredValue,
}: SelectDropdownProps) {
  const { t } = useTranslation();
  const defaultPlaceholder = t("ui.select.placeholder");
  const {
    open, setOpen, search, setSearch, activeIndex, setActiveIndex,
    pos, portalHeight, triggerRef, inputRef, listRef, portalRef,
    close,
  } = useDropdownPortal({ minWidth: 260 });
  // Clicking the trigger while open closes it; without this second click the
  // search field (focused on open) would keep the menu open.
  const toggle = useCallback(() => {
    if (open) close();
    else setOpen(true);
  }, [open, close, setOpen]);

  const selectedLabel = options.find((o) => o.value === value)?.label;

  const filtered = useMemo(
    () => filterByFuzzy(options, parseFuzzyQuery(search), (o) => [o.label]),
    [options, search]
  );

  /**
   * The item a fresh open highlights: the caller's preferred default when it
   * is present and enabled, else the first enabled option. Everything else
   * would open with Enter doing nothing, which reads as a broken dropdown.
   */
  const defaultIndex = useMemo(() => {
    if (preferredValue !== undefined) {
      const idx = filtered.findIndex((o) => o.value === preferredValue);
      if (idx >= 0 && !filtered[idx].disabled) return idx;
    }
    return filtered.findIndex((o) => !o.disabled);
  }, [filtered, preferredValue]);

  // A search owns the highlight from the first keystroke, so `preferredValue`
  // (the "which item should a hotkey-opened menu pick" hint) is spent once
  // the user starts typing. A disabled first match is skipped, so Enter
  // always runs the first thing that can actually be run.
  const isSearching = search.length > 0;
  // First option Enter can run in the current result set (-1 when none).
  const firstEnabledIndex = useMemo(() => filtered.findIndex((o) => !o.disabled), [filtered]);
  // The first match is the highlight on EVERY keystroke (typing, clearing,
  // reformatting), so Enter always runs the top of the CURRENT result set.
  const prevSearch = useRef(search);
  if (prevSearch.current !== search) {
    prevSearch.current = search;
    if (activeIndex !== 0) setActiveIndex(0);
  } else if (isSearching && open && activeIndex >= 0 && filtered[activeIndex]?.disabled) {
    // Options arrived or changed under the query: a disabled row was picked
    // before the list settled — move to the first row that can run.
    setActiveIndex(firstEnabledIndex);
  }

  // While searching, arrows walk only the options Enter can run (disabled
  // matches are skipped instead of making Enter a no-op).
  const stepIndex = useCallback(
    (from: number, delta: 1 | -1): number => {
      if (!isSearching) return (Math.max(from, 0) + delta + filtered.length) % filtered.length;
      const count = filtered.length;
      for (let step = 1; step <= count; step += 1) {
        const idx = (((from < 0 ? (delta > 0 ? -1 : 0) : from) + delta * step) % count + count) % count;
        if (!filtered[idx].disabled) return idx;
      }
      return from;
    },
    [filtered, isSearching]
  );

  const selectOption = useCallback(
    (index: number) => {
      const opt = filtered[index];
      if (opt && !opt.disabled) {
        onChange(opt.value);
        close();
        onAfterSelect?.();
      }
    },
    [filtered, onChange, close, onAfterSelect]
  );

  const handleToggle = useCallback(
    (e?: ReactMouseEvent) => {
      // Another select's open menu already swallowed this click (it is
      // portaled into <body>, i.e. outside this trigger's subtree): opening
      // here too would swap one menu for another instead of just closing.
      if (e?.defaultPrevented) return;
      if (disabled) return;
      // Alias trigger (see onOpenSignal): a press is forwarded to the one
      // menu it stands for, in this same handler.
      if (!open && onOpenSignal) {
        onOpenSignal();
        return;
      }
      toggle();
    },
    [disabled, open, onOpenSignal, toggle]
  );

  // Keys are owned wherever focus is while the menu is open (the search
  // field exists only for long lists; a short list must still answer
  // Enter/arrows, and a hotkey-opened menu must close on Escape).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
        triggerRef.current
          ?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
          ?.focus();
        return;
      }
      if (filtered.length === 0) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        const next = stepIndex(activeIndex, delta);
        setActiveIndex(next);
        return;
      }
      if (e.key === "Enter") {
        // Never dead ends on a disabled match: fall back to the first
        // enabled row when the highlight has nothing (or nothing runnable).
        const target =
          activeIndex >= 0 && !filtered[activeIndex].disabled ? activeIndex : firstEnabledIndex;
        if (target < 0) return;
        e.preventDefault();
        e.stopPropagation();
        selectOption(target);
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open, filtered, activeIndex, setActiveIndex, selectOption, close, triggerRef, listRef, isSearching, stepIndex, firstEnabledIndex]);

  // Seed the highlight in the same commit that opens the menu, ahead of
  // paint: the first frame already shows the item Enter would pick.
  const prevOpenForSeed = useRef(open);
  if (open && !prevOpenForSeed.current) {
    setActiveIndex(defaultIndex);
  } else if (!isSearching && open && activeIndex < 0 && firstEnabledIndex >= 0) {
    // The list was empty when the menu opened (the caller's rows were still
    // loading): settle on the first row that can run as soon as one exists.
    setActiveIndex(firstEnabledIndex);
  } else if (!isSearching && open && activeIndex >= 0 && filtered[activeIndex]?.disabled) {
    // Options loaded under an open menu (the async list arrived after the
    // open seeded "nothing yet"): settle on the first one that can run.
    setActiveIndex(firstEnabledIndex);
  }
  prevOpenForSeed.current = open;

  const lastOpenSignal = useRef(0);
  useEffect(() => {
    if (openSignal == null || openSignal <= lastOpenSignal.current) return;
    lastOpenSignal.current = openSignal;
    if (onOpenSignal) {
      onOpenSignal();
      return;
    }
    if (!disabled) setOpen(true);
  }, [openSignal, disabled, setOpen, onOpenSignal]);

  return (
    <div ref={triggerRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleToggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={
          size === "sm"
            ? "flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--surface-2)] text-xs text-gray-600 dark:text-gray-300 w-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            : "flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm w-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        }
      >
        <span
          className={`truncate flex-1 text-left ${selectedLabel || size === "sm" ? "" : "text-gray-400"}`}
        >
          {selectedLabel || placeholder || defaultPlaceholder}
        </span>
        <span className="text-gray-400 shrink-0">&#x25BE;</span>
      </button>

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
          className={`origin-bottom-left bg-(--surface-1) border border-(--border-color) rounded-xl shadow-lg overflow-hidden ${popoverAnimation}`}
        >
          {/* Stays mounted while a query is active: hiding it would drop the
              filter as soon as the results shrink below the threshold. */}
          {(options.length > 5 || search.length > 0) && (
            <div className="p-2 border-b border-(--border-color)">
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  // Every search (typing, clearing, reformatting) starts from
                  // the first match in the NEW list: the previous highlight
                  // index means nothing for a different result set, and Enter
                  // after typing would otherwise pick whichever option now
                  // happens to sit at that old index. The highlight settles on
                  // the first ENABLED match in the render that follows.
                  setActiveIndex(0);
                }}
                placeholder={t("ui.select.searchPlaceholder")}
                aria-label={t("ui.select.searchOptions")}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                className="w-full px-2 py-1.5 text-sm rounded border border-(--border-color) bg-[var(--surface-2)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
          )}
          <div ref={listRef} role="listbox" aria-label={t("ui.select.options")} className="overflow-y-auto max-h-65 py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                {t("ui.select.noOptions")}
              </div>
            ) : (
              filtered.map((opt, i) => {
                const isActive = i === activeIndex;
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    data-index={i}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onClick={() => selectOption(i)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 overflow-hidden transition-colors disabled:opacity-40 ${
                      isActive ? "bg-gray-100 dark:bg-gray-700/60" : ""
                    } ${isSelected ? "text-[var(--accent)] font-medium" : "text-gray-700 dark:text-gray-200"}`}
                  >
                    {isSelected && <span className="text-[var(--accent)] shrink-0">&#x2713;</span>}
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {opt.hint &&
                      (opt.hintStyle === "text" ? (
                        <span className="shrink min-w-0 max-w-[55%] truncate text-[10px] text-gray-400 dark:text-gray-500">
                          {opt.hint}
                        </span>
                      ) : (
                        <span
                          className={`ml-auto shrink-0 max-w-[55%] truncate text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            opt.hint === "merged"
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                              : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                          }`}
                        >
                          {opt.hint}
                        </span>
                      ))}
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

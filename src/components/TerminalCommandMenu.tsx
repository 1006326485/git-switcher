import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { useDropdownPortal } from "../hooks/useDropdownPortal";
import { popoverAnimation } from "./ui/primitives";
import { filterPickerItems, type PickerItem } from "../lib/scriptPicker";

interface CommandMenuProps {
  /** Accessible name of the trigger; also its default tooltip. */
  ariaLabel: string;
  title?: string;
  /** Pickable commands. Empty = nothing to run. */
  items: PickerItem[];
  /** True while the command list is still being fetched. */
  loading: boolean;
  /** Start (or retry) loading the command list. */
  onLoad: () => void;
  onSelect: (item: PickerItem) => void;
  /** Hotkey hint rendered inside the trigger (e.g. "⌘N"). */
  badge?: string;
  badgeTitle?: string;
  /** Increment to open the menu programmatically (hotkey path). */
  openSignal?: number;
  /**
   * Nothing to run: hidden in addition to disabled. A hidden trigger cannot
   * be hovered, so pass `hidden` only from the point the list is KNOWN to be
   * empty (not while it is still loading).
   */
  hidden?: boolean;
  /** Copy for the loading / empty rows (translated by the caller). */
  loadingLabel: string;
  emptyLabel: string;
  /** Shown when a search matches none of the commands. */
  noMatchLabel?: string;
  /** Disabled trigger: never opens. */
  disabled?: boolean;
  /** Trigger body; defaults to a play glyph. */
  triggerContent?: ReactNode;
  className?: string;
  triggerClassName: string;
  /**
   * Hidden until its row is hovered/focused (`group-hover`), unless the
   * menu is open or the consumer says otherwise.
   */
  hoverOnly?: boolean;
}

/**
 * The quick-run dropdown: a command picker anchored under its trigger, built
 * on the SAME dropdown model as SelectDropdown/BranchDropdown (useDropdownPortal
 * — measured before paint, first item highlighted before the first keystroke,
 * arrows/Enter/Escape wherever focus is, an outside press consumed instead of
 * leaking). Once open it always carries a search field, and typing filters by
 * name AND command with the app's shared fuzzy matcher, so a long script list
 * stays usable entirely from the keyboard.
 *
 * The search field takes focus on open (like every other dropdown search in
 * the app): single-line keys then go to the field natively, while arrows and
 * Enter are owned at the document level so they keep working even if focus
 * leaves the field. The trigger's own hotkey still toggles it closed.
 */
export const CommandMenu = memo(function CommandMenu({
  ariaLabel,
  title,
  items,
  loading,
  onLoad,
  onSelect,
  badge,
  badgeTitle,
  openSignal,
  disabled,
  triggerContent,
  loadingLabel,
  emptyLabel,
  noMatchLabel,
  hidden,
  className,
  triggerClassName,
  hoverOnly,
}: CommandMenuProps) {
  const { t } = useTranslation();
  const {
    open, setOpen, search, setSearch, activeIndex, setActiveIndex,
    pos, portalHeight, triggerRef, inputRef, listRef, portalRef,
    close: closeMenu,
  } = useDropdownPortal({ minWidth: 240 });
  // Stable close: a new function identity every render would re-subscribe
  // (and, through the auto-close guard below, re-run) on every render.
  const close = useCallback(() => closeMenu(), [closeMenu]);
  // Safe wherever the shortcut helper is unavailable (standalone mounts).
  const fallbackNoMatch = t?.("terminal.quickRunNoMatch") ?? "No matching commands";

  // No command → nothing to run: the trigger is disabled, so an in-flight
  // fetch that resolves empty must also close a menu that was opened while
  // the list was still loading.
  const empty = !loading && items.length === 0;
  const prevEmpty = useRef(empty);
  if (empty && !prevEmpty.current && open) close();
  prevEmpty.current = empty;

  const filtered = useMemo(() => filterPickerItems(items, search), [items, search]);
  const selectable = !loading && filtered.length > 0;

  // Seed the highlight in the same commit that opens (or that changes the
  // query): the first frame already shows the item Enter would run. Any
  // search text — typing, clearing, replacing — puts the highlight back on
  // the FIRST match of the new list, never on an index the old list owned.
  const prevOpen = useRef(open);
  const prevSearch = useRef(search);
  if (open && (!prevOpen.current || prevSearch.current !== search)) {
    if (activeIndex !== 0) setActiveIndex(0);
  }
  prevOpen.current = open;
  prevSearch.current = search;

  // The list can also change under a fixed query (a re-fetch): keep the
  // highlight in range, and off a gap while the user searched for something.
  const lastCount = useRef(filtered.length);
  if (lastCount.current !== filtered.length) {
    lastCount.current = filtered.length;
    if (open && activeIndex >= filtered.length) {
      setActiveIndex(Math.max(0, filtered.length - 1));
    }
  }

  const openMenu = useCallback(() => {
    setOpen(true);
    onLoad();
  }, [setOpen, onLoad]);

  const toggle = useCallback(() => {
    if (open) close();
    else openMenu();
  }, [open, close, openMenu]);

  const handleToggle = useCallback(
    (e?: ReactMouseEvent) => {
      // Another menu's open popover already consumed this press: only close.
      if (e?.defaultPrevented || disabled) return;
      toggle();
    },
    [disabled, toggle]
  );

  const lastOpenSignal = useRef(0);
  useEffect(() => {
    if (openSignal == null || openSignal <= lastOpenSignal.current) return;
    lastOpenSignal.current = openSignal;
    if (!disabled) openMenu();
  }, [openSignal, disabled, openMenu]);

  // Arrows and Enter are owned wherever focus is while the menu is open.
  // Typing is NOT intercepted: the search field has focus (useDropdownPortal
  // focuses it once placed), so the field edits natively like every other
  // dropdown search. Escape is owned by the portal hook for the same reason.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!selectable) return;
        e.preventDefault();
        e.stopPropagation();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((prev) => (Math.max(prev, 0) + delta + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter") {
        const item = filtered[activeIndex];
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();
        close();
        onSelect(item);
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open, selectable, filtered, activeIndex, close, onSelect, setActiveIndex]);

  const triggerDisabled = disabled || (!loading && items.length === 0);

  // Nothing to run: remove the trigger from the layout entirely (not just
  // visually), so it cannot be hovered, focused, or announced by a screen
  // reader. Callers only pass this once the list is known to be empty.
  if (hidden) return null;

  return (
    <div
      ref={triggerRef}
      className={`${className ?? ""}${hoverOnly && !open ? " invisible group-hover:visible group-focus-within:visible" : ""}`}
      onMouseEnter={onLoad}
    >
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleToggle}
        disabled={triggerDisabled}
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={triggerClassName}
      >
        {triggerContent ?? (
          <svg aria-hidden="true" width="9" height="9" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 2.5v11l9-5.5-9-5.5Z" />
          </svg>
        )}
        {badge && (
          <span className="shrink-0 font-mono text-[9px] opacity-70" title={badgeTitle}>
            {badge}
          </span>
        )}
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
          className={`origin-bottom-left max-h-80 bg-(--surface-1) border border-(--border-color) rounded-xl shadow-lg overflow-hidden ${popoverAnimation}`}
        >
          {/* Always present while open: quick-run is a searchable picker like
              every other dropdown, even for a short command list. */}
          <div className="p-2 border-b border-(--border-color)">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("terminal.quickRunSearchPlaceholder")}
              aria-label={t("terminal.quickRunSearchAria")}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-2 py-1.5 text-sm rounded border border-(--border-color) bg-[var(--surface-2)] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div
            ref={listRef}
            role="listbox"
            aria-label={ariaLabel}
            className="overflow-y-auto max-h-65 py-1"
          >
            {loading && <div className="px-3 py-2 text-xs text-gray-400">{loadingLabel}</div>}
            {!loading && items.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">{emptyLabel}</div>
            )}
            {!loading && items.length > 0 && filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">{noMatchLabel ?? fallbackNoMatch}</div>
            )}
            {!loading &&
              filtered.map((item, i) => (
                <button
                  key={`${item.kind}:${item.name}:${item.command}`}
                  data-index={i}
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => {
                    close();
                    onSelect(item);
                  }}
                  className={`press w-full text-left px-3 py-1.5 flex items-baseline gap-2 transition-colors ${
                    i === activeIndex
                      ? "bg-gray-100 dark:bg-gray-700/60"
                      : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  }`}
                >
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate shrink-0 max-w-[45%]">
                    {item.name}
                  </span>
                  {item.isGlobal && (
                    <span className="text-[9px] uppercase tracking-wide text-gray-400 shrink-0">
                      {t("scriptPicker.global")}
                    </span>
                  )}
                  <span className="ml-auto min-w-0 text-[10.5px] font-mono text-gray-400 truncate">
                    {item.command}
                  </span>
                </button>
              ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});

export default CommandMenu;

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { isShortcutCapturing } from "../lib/shortcutCapture";

interface UseDropdownPortalOptions {
  minWidth?: number;
  align?: "left" | "right";
}

interface PortalPosition {
  top: number;
  left: number;
  width: number;
  /** True when the popover is flipped above the trigger (for tests/hooks). */
  placeAbove: boolean;
}

/**
 * Measure the popover's anchor box (its trigger's border box, fixed
 * coordinates). Shared with the viewport-clamping positioner below.
 */
export function measurePortalAnchor(el: HTMLElement | null) {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width };
}

/**
 * Fixed-position coordinates for a portal popover anchored to `anchor`.
 *
 * A menu flips above its trigger only when the room below cannot hold a main
 * menu (`menuMinHeight`), preferring the side with more space; a short list
 * (a command submenu) always opens on the side that holds it whole. Both
 * axes are clamped to an EDGE margin so a popover near the window edge never
 * renders half off-screen. This is pure so the "never overlaps its trigger,
 * never leaves the viewport" contract is testable without a DOM.
 */
export function computePortalPosition(
  anchor: { top: number; bottom: number; left: number; right: number; width: number },
  opts: { minWidth: number; align: "left" | "right"; estimatedHeight: number; menuMinHeight: number },
  viewport: { width: number; height: number } = {
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }
): PortalPosition {
  const GAP = 4;
  const EDGE = 8;
  const width = Math.max(anchor.width, opts.minWidth);
  const spaceBelow = viewport.height - anchor.bottom - GAP - EDGE;
  const spaceAbove = anchor.top - GAP - EDGE;
  const placeAbove =
    opts.estimatedHeight > spaceBelow
      ? opts.estimatedHeight <= spaceAbove || spaceAbove > spaceBelow
      : opts.estimatedHeight > opts.menuMinHeight && spaceAbove >= opts.estimatedHeight;
  const top = placeAbove ? anchor.top - GAP : anchor.bottom + GAP;
  const rawLeft = opts.align === "right" ? anchor.right - width : anchor.left;
  const maxLeft = Math.max(EDGE, viewport.width - width - EDGE);
  return {
    top,
    left: Math.min(Math.max(EDGE, rawLeft), maxLeft),
    width,
    placeAbove,
  };
}

export function useDropdownPortal({ minWidth = 200, align = "left" }: UseDropdownPortalOptions = {}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  // Fixed-position coordinates, measured BEFORE the portal exists (see the
  // useLayoutEffect below), so the first painted frame is already anchored
  // under the trigger. `placed` gates rendering on that measurement.
  const [coords, setCoords] = useState<PortalPosition | null>(null);
  const [portalHeight, setPortalHeight] = useState(0);
  // Height the next open should plan for: the measured one when known, else
  // an estimate so a low trigger flips above on its very first frame.
  const plannedHeightRef = useRef(0);

  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
    setActiveIndex(-1);
    setCoords(null);
  }, []);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Measure + position in the layout phase of the commit that flips `open`:
  // the coordinates are computed from the trigger's real box before the
  // browser paints, so the portal's first visible frame is already at its
  // final spot (no one-frame flash at the top-left corner).
  useLayoutEffect(() => {
    if (!open) return;
    setCoords(null);
    const anchor = measurePortalAnchor(triggerRef.current);
    if (!anchor) return;
    setCoords(
      computePortalPosition(anchor, {
        minWidth,
        align,
        estimatedHeight: plannedHeightRef.current,
        menuMinHeight: 220,
      })
    );
  }, [open, minWidth, align]);

  // Position updates (scroll/resize, and the portal's own measured height)
  // only run while the portal is mounted; see the layout effect in the
  // options hook below.
  const reposition = useCallback(() => {
    const anchor = measurePortalAnchor(triggerRef.current);
    if (!anchor) return;
    setCoords((prev) => {
      const next = computePortalPosition(anchor, {
        minWidth,
        align,
        estimatedHeight: plannedHeightRef.current,
        menuMinHeight: 220,
      });
      return prev && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.placeAbove === next.placeAbove
        ? prev
        : next;
    });
  }, [minWidth, align]);

  useLayoutEffect(() => {
    const el = portalRef.current;
    if (!open || !el) return;
    const height = el.offsetHeight;
    if (height > 0) {
      setPortalHeight(height);
      plannedHeightRef.current = height;
    }
    reposition();
    // Deliberately keyed on the portal's first layout and the query only:
    // a late flip after the real height becomes known (the very first open
    // has no measurement yet) is rare and lands before anything is painted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search, reposition]);

  // Focus once the portal is placed, and track viewport changes while open.
  useEffect(() => {
    if (!open || !coords) return;
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 0);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, coords, reposition]);

  // Click outside to close. The mousedown closes the menu and is consumed:
  // the following click must not also answer whatever sits under the
  // pointer. Without that, a right-click on another dropdown's own trigger
  // would close one listbox and open the other from a single gesture.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target instanceof Node ? e.target : null;
      if (
        // A trigger opts out of the outside-dismiss when another open
        // dropdown already owned this press (it stops propagation).
        e.defaultPrevented ||
        !target ||
        triggerRef.current?.contains(target) ||
        portalRef.current?.contains(target)
      ) {
        return;
      }
      e.preventDefault();
      close();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, close]);

  // Consume Escape while the dropdown is open, wherever focus is: the search
  // input only exists for long option lists, so without this an enclosing
  // Modal closes together with the dropdown and drops the user's input.
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (isShortcutCapturing()) return;
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
      triggerRef.current
        ?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        ?.focus();
    };
    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [open, close]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // Keyboard navigation helper — call this from onKeyDown on the search input
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, onSelect: (index: number) => void, itemCount: number) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (itemCount === 0) break;
          setActiveIndex((prev) => (prev < itemCount - 1 ? prev + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          if (itemCount === 0) break;
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : itemCount - 1));
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0) onSelect(activeIndex);
          break;
        case "Escape":
          // Consume Escape so an enclosing Modal does not close together with
          // the dropdown (defaultPrevented + stopped propagation).
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          close();
          break;
      }
    },
    [activeIndex, close]
  );

  return {
    open,
    setOpen,
    search,
    setSearch,
    activeIndex,
    setActiveIndex,
    /** Fixed-position coordinates; null until the first open is measured. */
    pos: coords,
    /** Height of the open portal (0 before the first measurement). */
    portalHeight,
    triggerRef,
    inputRef,
    listRef,
    portalRef,
    close,
    toggle,
    handleKeyDown,
  };
}

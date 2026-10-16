import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { popoverAnimation, popoverExitAnimation, usePresence } from "./primitives";
import { isShortcutCapturing } from "../../lib/shortcutCapture";

export interface ContextMenuProps {
  open: boolean;
  anchor: { x: number; y: number };
  onClose: () => void;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  gap?: number;
  edge?: number;
  minWidth?: number;
  restoreFocus?: boolean;
}

type MenuPos = { top?: number; bottom?: number; left: number; maxHeight: number };

// Roughly three items: used only when the anchor leaves no real room on the chosen side.
const MIN_VISIBLE_HEIGHT = 96;

export function ContextMenu({
  open,
  anchor,
  onClose,
  children,
  align = "start",
  gap = 6,
  edge = 8,
  minWidth = 200,
  restoreFocus = false,
}: ContextMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);
  // 110ms popoverOut exit: portal stays mounted one cycle after `open` turns
  // false. Position reset stays bound to `open` (effect below) so a reopened
  // menu re-measures instead of reusing the stale rect.
  const { present, closing } = usePresence(open, 110);

  const updatePos = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    // offsetWidth/offsetHeight report the untransformed layout box. getBoundingClientRect
    // would include the popoverIn entrance scale (0.96), understating the size and
    // leaving the panel hanging past the clamped edge for the rest of the animation.
    const width = panel.offsetWidth || minWidth;
    const height = panel.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left: number;
    if (align === "center") left = anchor.x - width / 2;
    else if (align === "end") left = anchor.x - width;
    else left = anchor.x;
    left = Math.min(Math.max(left, edge), Math.max(vw - width - edge, edge));

    const spaceBelow = vh - anchor.y - gap - edge;
    const spaceAbove = anchor.y - gap - edge;
    const flipUp = spaceBelow < height && spaceAbove > spaceBelow;
    const usable = Math.max(vh - 2 * edge, 0);
    // A viewport resized after opening can leave no room on either side, so never
    // collapse to 0px and never grow past the space the viewport actually has.
    const maxHeight = Math.min(Math.max(flipUp ? spaceAbove : spaceBelow, MIN_VISIBLE_HEIGHT), usable);

    const next: MenuPos = flipUp
      ? {
          bottom: Math.max(Math.min(vh - anchor.y + gap, vh - edge - maxHeight), edge),
          left,
          maxHeight,
        }
      : {
          top: Math.max(Math.min(anchor.y + gap, vh - edge - maxHeight), edge),
          left,
          maxHeight,
        };

    setPos((prev) =>
      prev &&
      prev.top === next.top &&
      prev.bottom === next.bottom &&
      prev.left === next.left &&
      prev.maxHeight === next.maxHeight
        ? prev
        : next
    );
  }, [align, anchor.x, anchor.y, edge, gap, minWidth]);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const panel = panelRef.current;

    const menuItems = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>('[role^="menuitem"]')) : [];

    const focusItem = (items: HTMLElement[], index: number) => {
      if (items.length === 0) return;
      items[((index % items.length) + items.length) % items.length].focus();
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (panel?.contains(e.target as Node)) return;
      onClose();
    };

    const handleKey = (e: KeyboardEvent) => {
      if (isShortcutCapturing()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      const items = menuItems();
      const current = items.findIndex((el) => el === document.activeElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusItem(items, current + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusItem(items, current < 0 ? items.length - 1 : current - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusItem(items, 0);
      } else if (e.key === "End") {
        e.preventDefault();
        focusItem(items, items.length - 1);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKey, true);
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey, true);
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, onClose, updatePos]);

  useLayoutEffect(() => {
    // `present` flips in the same commit as `open` (usePresence render-phase
    // sync), so the fresh portal is measurable on this first pass.
    if (present) updatePos();
  }, [present, updatePos]);

  useEffect(() => {
    if (!open || !restoreFocus) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => opener?.focus();
  }, [open, restoreFocus]);

  if (!present) return null;

  const style: React.CSSProperties = pos
    ? {
        position: "fixed",
        top: pos.top,
        bottom: pos.bottom,
        left: pos.left,
        maxHeight: pos.maxHeight,
        minWidth,
        zIndex: 9999,
      }
    : {
        position: "fixed",
        top: anchor.y + gap,
        left: anchor.x,
        minWidth,
        visibility: "hidden",
        zIndex: 9999,
      };

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      style={style}
      className={`${pos?.bottom !== undefined ? "origin-bottom-left" : "origin-top-left"} bg-(--surface-1) border border-(--border-color) rounded-xl shadow-lg py-1.5 overflow-y-auto overscroll-contain ${closing ? popoverExitAnimation : popoverAnimation}`}
    >
      <div onClick={() => setTimeout(onClose, 0)}>{children}</div>
    </div>,
    document.body
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 border-t border-(--border-color)" />;
}

import { useState, useRef, useEffect, useCallback } from "react";

interface UseDropdownPortalOptions {
  minWidth?: number;
  align?: "left" | "right";
}

export function useDropdownPortal({ minWidth = 200, align = "left" }: UseDropdownPortalOptions = {}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pos, setPos] = useState({ top: 0, left: 0, width: minWidth });

  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
    setActiveIndex(-1);
  }, []);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Position + focus when open
  useEffect(() => {
    if (!open) return;
    const updatePos = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const width = Math.max(rect.width, minWidth);
        const left = align === "right" ? rect.right - width : rect.left;
        setPos({ top: rect.bottom + 4, left, width });
      }
    };
    updatePos();
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 0);
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open, minWidth, align]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        portalRef.current && !portalRef.current.contains(target)
      ) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, close]);

  // Reset active index when search changes (only while open)
  useEffect(() => {
    if (open) setActiveIndex(-1);
  }, [search, open]);

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
          e.preventDefault();
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
    pos,
    triggerRef,
    inputRef,
    listRef,
    portalRef,
    close,
    toggle,
    handleKeyDown,
  };
}

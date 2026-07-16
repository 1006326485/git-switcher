import { memo, useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { PROJECT_COLORS } from "../lib/types";

interface ColorPickerProps {
  currentColor?: string;
  onSelect: (color: string | null) => void;
  trigger: React.ReactNode;
  align?: "left" | "right";
  /** Controlled open state (omit for uncontrolled) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const ColorPicker = memo(function ColorPicker({
  currentColor,
  onSelect,
  trigger,
  align = "right",
  open: controlledOpen,
  onOpenChange,
}: ColorPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (v: boolean) => {
      setInternalOpen(v);
      onOpenChange?.(v);
    },
    [onOpenChange]
  );

  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      left: align === "right" ? rect.right - 190 : rect.left,
    });
  }, [align]);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, updatePos, setOpen]);

  const handleSelect = useCallback(
    (color: string | null) => {
      onSelect(color);
      setOpen(false);
    },
    [onSelect, setOpen]
  );

  return (
    <div ref={triggerRef}>
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
            className="bg-(--surface-1) border border-(--border-color) rounded-xl shadow-lg p-2 max-w-[200px] animate-[fadeIn_0.15s_ease-out]"
          >
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={c.id}
                  onClick={() => handleSelect(c.id)}
                  className={`w-8 h-8 rounded-full ${c.bg} flex items-center justify-center transition-transform hover:scale-110 active:scale-95`}
                >
                  {currentColor === c.id && (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="white">
                      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            <div className="border-t border-gray-100 dark:border-gray-700 pt-1.5">
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className="w-full text-left px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded transition-colors"
              >
                {currentColor ? "Remove color" : "No color"}
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
});

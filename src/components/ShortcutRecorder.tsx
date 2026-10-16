import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatHotkey, normalizeBinding } from "../lib/hotkey";
import { setShortcutCapturing } from "../lib/shortcutCapture";

interface ShortcutRecorderProps {
  initial: string;
  onCommit: (binding: string) => void;
  onCancel: () => void;
  /** Global (Tauri) hotkeys keep Shift on Backquote; in-app bindings drop it. */
  forGlobalHotkey?: boolean;
}

function eventToBinding(e: KeyboardEvent, forGlobalHotkey = false): string | null {
  const isBackquote = e.code === "Backquote";
  const mods: string[] = [];
  if (e.metaKey) mods.push("CmdOrCtrl");
  else if (e.ctrlKey) mods.push("Control");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey && (!isBackquote || forGlobalHotkey)) mods.push("Shift");
  let key: string | null = null;
  if (isBackquote) key = "~";
  else if (e.code === "Space" || e.key === " ") key = "Space";
  else if (typeof e.key === "string" && e.key.length === 1) key = e.key.toUpperCase();
  else if (typeof e.key === "string" && !["Control", "Alt", "Shift", "Meta"].includes(e.key)) key = e.key;
  if (!key) return null;
  return normalizeBinding([...mods, key].join("+"));
}

export function ShortcutRecorder({ initial, onCommit, onCancel, forGlobalHotkey }: ShortcutRecorderProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setShortcutCapturing(true);
    return () => setShortcutCapturing(false);
  }, []);

  const tr = (key: string, fallback: string): string => {
    const v = t(key as never);
    return v === key ? fallback : v;
  };

  return (
    <div data-shortcut-recorder className="flex items-center gap-1 ml-2 shrink-0">
      <input
        ref={inputRef}
        readOnly
        value={pending ? formatHotkey(pending) : ""}
        onKeyDown={(e) => {
          if (e.key === "Tab") return;
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation?.();
          if (e.key === "Escape") {
            onCancel();
            return;
          }
          const next = eventToBinding(e.nativeEvent, forGlobalHotkey);
          if (next) setPending(next);
        }}
        placeholder={tr("shortcuts.editor.pressKeys", "Press keys…")}
        aria-label={tr("shortcuts.editor.capture", "Recording… press a key combination")}
        className="w-28 px-1.5 py-0.5 rounded-md border border-blue-400 bg-[var(--surface-2)] text-[11px] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="button"
        onClick={() => onCommit(pending)}
        disabled={!pending}
        title={tr("shortcuts.editor.save", "Save")}
        aria-label={tr("shortcuts.editor.save", "Save")}
        className="px-1.5 py-0.5 rounded-md text-[11px] font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-40"
      >
        ✓
      </button>
      <button
        type="button"
        onClick={onCancel}
        title={tr("shortcuts.editor.cancel", "Cancel")}
        aria-label={tr("shortcuts.editor.cancel", "Cancel")}
        className="px-1.5 py-0.5 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        ✕
      </button>
    </div>
  );
}

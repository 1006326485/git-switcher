import { memo, useState, useMemo } from "react";
import { Modal } from "./ui/primitives";

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  name: string;
  shortcuts: Shortcut[];
}

const SHORTCUTS: ShortcutCategory[] = [
  {
    name: "General",
    shortcuts: [
      { keys: ["⌘", "K"], description: "Command Palette" },
      { keys: ["⌘", "/"], description: "Keyboard Shortcuts" },
      { keys: ["Escape"], description: "Close dialog / Cancel" },
    ],
  },
  {
    name: "Navigation",
    shortcuts: [
      { keys: ["↑", "↓"], description: "Navigate project list" },
      { keys: ["Enter"], description: "Toggle project details" },
      { keys: ["Space"], description: "Refresh focused project" },
      { keys: ["⌘", "B"], description: "Toggle sidebar" },
    ],
  },
  {
    name: "Git Operations",
    shortcuts: [
      { keys: ["⌘", "⇧", "F"], description: "Search in Command Palette" },
      { keys: ["⌘", "⇧", "A"], description: "Add project" },
      { keys: ["⌘", "R"], description: "Refresh all projects" },
      { keys: ["⌘", "⇧", "G"], description: "Fetch all projects" },
    ],
  },
  {
    name: "View",
    shortcuts: [
      { keys: ["⌘", "1"], description: "Card view" },
      { keys: ["⌘", "2"], description: "List view" },
      { keys: ["⌘", "3"], description: "Compact view" },
      { keys: ["⌘", "4"], description: "Table view" },
      { keys: ["⌘", "5"], description: "Dashboard view" },
    ],
  },
];

function KbdBadge({ label }: { label: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm">
      {label}
    </kbd>
  );
}

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

export const ShortcutsHelp = memo(function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return SHORTCUTS;
    const q = query.toLowerCase();
    return SHORTCUTS.map((cat) => ({
      ...cat,
      shortcuts: cat.shortcuts.filter(
        (s) =>
          s.description.toLowerCase().includes(q) ||
          s.keys.some((k) => k.toLowerCase().includes(q))
      ),
    })).filter((cat) => cat.shortcuts.length > 0);
  }, [query]);

  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts" maxWidth="max-w-xl">
      <div className="px-6 pb-5">
        {/* Search */}
        <div className="mb-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shortcuts..."
            autoFocus
            className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500"
          />
        </div>

        {/* Shortcut list */}
        <div className="space-y-4">
          {filtered.map((cat) => (
            <div key={cat.name}>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                {cat.name}
              </h3>
              <div className="space-y-1">
                {cat.shortcuts.map((s) => (
                  <div
                    key={s.description}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {s.description}
                    </span>
                    <div className="flex items-center gap-1 ml-4 shrink-0">
                      {s.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-xs text-gray-400">+</span>}
                          <KbdBadge label={k} />
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
              No matching shortcuts found.
            </p>
          )}
        </div>

        {/* Footer hint */}
        <p className="mt-4 text-xs text-gray-400 dark:text-gray-500 text-center">
          On macOS, use ⌘. On Windows/Linux, use Ctrl.
        </p>
      </div>
    </Modal>
  );
});
export default ShortcutsHelp;

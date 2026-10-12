import { memo, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Modal, KbdBadge } from "./ui/primitives";

/**
 * The shortcut catalog is keyed rather than holding literal copy, so the
 * table re-renders when the language changes. The search box matches the
 * *translated* description, which is what the user actually reads.
 */
type ShortcutDescriptionKey =
  | "shortcuts.global.terminal"
  | "shortcuts.general.addProject"
  | "shortcuts.general.commandPalette"
  | "shortcuts.general.shortcuts"
  | "shortcuts.general.cancel"
  | "shortcuts.general.closeWindow"
  | "shortcuts.nav.down"
  | "shortcuts.nav.up"
  | "shortcuts.nav.arrows"
  | "shortcuts.nav.toggleDetails"
  | "shortcuts.nav.refreshProject"
  | "shortcuts.nav.toggleSidebar"
  | "shortcuts.git.refreshAll"
  | "shortcuts.git.importExport"
  | "shortcuts.git.quickDiff"
  | "shortcuts.view.focusSearch"
  | "shortcuts.view.card"
  | "shortcuts.view.list"
  | "shortcuts.view.compact"
  | "shortcuts.view.table"
  | "shortcuts.view.dashboard"
  | "shortcuts.terminal.switchGroup"
  | "shortcuts.terminal.switchTab"
  | "shortcuts.terminal.jumpIndex"
  | "shortcuts.terminal.jumpProject"
  | "shortcuts.terminal.newTab"
  | "shortcuts.terminal.closeTab"
  | "shortcuts.terminal.closeTabKey";

interface Shortcut {
  keys: string[];
  descriptionKey: ShortcutDescriptionKey;
}

interface ShortcutCategory {
  nameKey: "shortcuts.group.global" | "shortcuts.group.general" | "shortcuts.group.navigation" | "shortcuts.group.git" | "shortcuts.group.view" | "shortcuts.group.terminal";
  shortcuts: Shortcut[];
}

const SHORTCUTS: ShortcutCategory[] = [
  {
    nameKey: "shortcuts.group.global",
    shortcuts: [
      {
        keys: ["\u2318", "\u21e7", "`"],
        descriptionKey: "shortcuts.global.terminal",
      },
    ],
  },
  {
    nameKey: "shortcuts.group.general",
    shortcuts: [
      { keys: ["\u2318", "N"], descriptionKey: "shortcuts.general.addProject" },
      { keys: ["\u2318", "K"], descriptionKey: "shortcuts.general.commandPalette" },
      { keys: ["\u2318", "/"], descriptionKey: "shortcuts.general.shortcuts" },
      { keys: ["Escape"], descriptionKey: "shortcuts.general.cancel" },
      { keys: ["\u2318", "W"], descriptionKey: "shortcuts.general.closeWindow" },
    ],
  },
  {
    nameKey: "shortcuts.group.navigation",
    shortcuts: [
      { keys: ["j"], descriptionKey: "shortcuts.nav.down" },
      { keys: ["k"], descriptionKey: "shortcuts.nav.up" },
      { keys: ["\u2191", "\u2193"], descriptionKey: "shortcuts.nav.arrows" },
      { keys: ["Enter"], descriptionKey: "shortcuts.nav.toggleDetails" },
      { keys: ["Space"], descriptionKey: "shortcuts.nav.refreshProject" },
      { keys: ["\u2318", "B"], descriptionKey: "shortcuts.nav.toggleSidebar" },
    ],
  },
  {
    nameKey: "shortcuts.group.git",
    shortcuts: [
      { keys: ["\u2318", "R"], descriptionKey: "shortcuts.git.refreshAll" },
      { keys: ["\u2318", "E"], descriptionKey: "shortcuts.git.importExport" },
      { keys: ["\u2318", "D"], descriptionKey: "shortcuts.git.quickDiff" },
    ],
  },
  {
    nameKey: "shortcuts.group.view",
    shortcuts: [
      { keys: ["\u2318", "F"], descriptionKey: "shortcuts.view.focusSearch" },
      { keys: ["\u2318", "1"], descriptionKey: "shortcuts.view.card" },
      { keys: ["\u2318", "2"], descriptionKey: "shortcuts.view.list" },
      { keys: ["\u2318", "3"], descriptionKey: "shortcuts.view.compact" },
      { keys: ["\u2318", "4"], descriptionKey: "shortcuts.view.table" },
      { keys: ["\u2318", "5"], descriptionKey: "shortcuts.view.dashboard" },
    ],
  },
  {
    nameKey: "shortcuts.group.terminal",
    shortcuts: [
      { keys: ["\u2318", "\u2191", "\u2193"], descriptionKey: "shortcuts.terminal.switchGroup" },
      { keys: ["\u2318", "\u2190", "\u2192"], descriptionKey: "shortcuts.terminal.switchTab" },
      { keys: ["\u2325", "1", "\u2026", "9"], descriptionKey: "shortcuts.terminal.jumpIndex" },
      { keys: ["\u2318", "1", "\u2026", "9"], descriptionKey: "shortcuts.terminal.jumpProject" },
      { keys: ["\u2318", "N"], descriptionKey: "shortcuts.terminal.newTab" },
      { keys: ["\u2318", "W"], descriptionKey: "shortcuts.terminal.closeTabKey" },
      { keys: ["Middle click"], descriptionKey: "shortcuts.terminal.closeTab" },
    ],
  },
];

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

export const ShortcutsHelp = memo(function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUTS;
    return SHORTCUTS.map((cat) => ({
      nameKey: cat.nameKey,
      shortcuts: cat.shortcuts.filter(
        (s) =>
          t(s.descriptionKey).toLowerCase().includes(q) ||
          s.keys.some((k) => k.toLowerCase().includes(q))
      ),
    })).filter((cat) => cat.shortcuts.length > 0);
  }, [query, t]);

  return (
    <Modal open={open} onClose={onClose} title={t("shortcuts.title")} width="sm">
      <div className="px-4 pb-3 pt-3">
        {/* Search */}
        <div className="mb-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("shortcuts.searchPlaceholder")}
            autoFocus
            className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] text-[13px] text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500"
          />
        </div>

        {/* Shortcut list */}
        <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-0.5">
          {filtered.map((cat) => (
            <div key={cat.nameKey}>
              <h3 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                {t(cat.nameKey)}
              </h3>
              <div>
                {cat.shortcuts.map((s) => (
                  <div
                    key={s.descriptionKey}
                    className="flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <span className="text-[13px] text-gray-700 dark:text-gray-300">
                      {t(s.descriptionKey)}
                    </span>
                    <div className="flex items-center gap-0.5 ml-3 shrink-0">
                      {s.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-0.5">
                          {i > 0 && <span className="text-[11px] text-gray-400">+</span>}
                          <KbdBadge label={k} size="sm" />
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
              {t("shortcuts.noMatch")}
            </p>
          )}
        </div>

        {/* Footer hint */}
        <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500 text-center">
          {t("shortcuts.footer")}
        </p>
      </div>
    </Modal>
  );
});
export default ShortcutsHelp;

import { memo, useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { Modal, KbdBadge } from "./ui/primitives";
import { ShortcutRecorder } from "./ShortcutRecorder";
import {
  DEFAULT_IN_APP_SHORTCUTS,
  overridesFromSettings,
  resolveInAppShortcuts,
  type ActionId,
} from "../lib/inAppShortcuts";
import {
  SHORTCUT_GROUP_ORDER,
  getDisplayParts,
  getEditorDisplayParts,
  inAppDefinitions,
  referenceDefinitions,
  type ShortcutDefinition,
  type ShortcutGroup,
} from "../lib/shortcutRegistry";
import {
  bindingToDisplayParts,
  bindingsConflict,
  detectMac,
  isSameChord,
  normalizeBinding,
} from "../lib/hotkey";
import { getSettings, updateSettingsPartial } from "../lib/tauri";
import type { AppSettings } from "../lib/types";

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
  | "shortcuts.terminal.switchGroupPrev"
  | "shortcuts.terminal.switchGroupNext"
  | "shortcuts.terminal.switchTabPrev"
  | "shortcuts.terminal.switchTabNext"
  | "shortcuts.terminal.jumpIndex"
  | "shortcuts.terminal.jumpProject"
  | "shortcuts.terminal.newTab"
  | "shortcuts.terminal.closeTab"
  | "shortcuts.terminal.closeTabKey"
  | "shortcuts.terminal.focusInput"
  | "shortcuts.terminal.clearScreen"
  | "shortcuts.inApp.addProject"
  | "shortcuts.inApp.refreshAll"
  | "shortcuts.inApp.focusSearch"
  | "shortcuts.inApp.exportImport"
  | "shortcuts.inApp.toggleSidebar"
  | "shortcuts.inApp.commandPalette"
  | "shortcuts.inApp.shortcutsHelp"
  | "shortcuts.inApp.quickDiff"
  | "shortcuts.inApp.navigateDown"
  | "shortcuts.inApp.navigateUp"
  | "shortcuts.inApp.selectFocused"
  | "shortcuts.inApp.toggleTerminal"
  | "shortcuts.inApp.openSettings";

type InAppDescriptionKey = Extract<ShortcutDescriptionKey, `shortcuts.inApp.${string}`>;

const IN_APP_FALLBACK_EN: Record<InAppDescriptionKey, string> = {
  "shortcuts.inApp.addProject": "Add project",
  "shortcuts.inApp.refreshAll": "Refresh all projects",
  "shortcuts.inApp.focusSearch": "Focus search",
  "shortcuts.inApp.exportImport": "Import / Export",
  "shortcuts.inApp.toggleSidebar": "Toggle sidebar",
  "shortcuts.inApp.commandPalette": "Command Palette",
  "shortcuts.inApp.shortcutsHelp": "Keyboard Shortcuts",
  "shortcuts.inApp.quickDiff": "Quick Diff overview",
  "shortcuts.inApp.navigateDown": "Navigate down in project list",
  "shortcuts.inApp.navigateUp": "Navigate up in project list",
  "shortcuts.inApp.selectFocused": "Select focused project",
  "shortcuts.inApp.toggleTerminal": "Toggle terminal panel",
  "shortcuts.inApp.openSettings": "Open Settings",
};

interface InAppRow {
  def: ShortcutDefinition;
  actionId: ActionId;
  settingsField: keyof AppSettings;
  descriptionKey: string;
  digitRange: boolean;
}

// Every rebindable row, derived from the canonical registry (single source
// of truth with inAppShortcuts.ts, useKeyboardShortcuts, and
// TerminalWorkspace). Since Phase 2 this is all rebindable actions — app,
// view, git, and terminal — not just the original 12.
const IN_APP_ROWS: InAppRow[] = inAppDefinitions().map((def) => ({
  def,
  actionId: def.inAppActionId as ActionId,
  settingsField: def.settingsField as keyof AppSettings,
  descriptionKey: def.descriptionKey,
  digitRange: def.digitRange ?? false,
}));

// Reference rows, derived from the registry (FR5). Unlike the old hardcoded
// lists, these render through bindingToDisplayParts, so Windows/Linux show
// Ctrl/Alt/Shift instead of ⌘/⌥/⇧. Each action appears exactly once: the
// rebindable actions live only in the In-App editor section below, so a
// rebound binding can never sit next to a stale hardcoded default row.
interface ReferenceRow {
  def: ShortcutDefinition;
  parts: string[];
}

interface ReferenceCategory {
  group: ShortcutGroup;
  nameKey: string;
  rows: ReferenceRow[];
}

function buildReferenceCategories(
  globalHotkey: string,
  isMac: boolean
): ReferenceCategory[] {
  return SHORTCUT_GROUP_ORDER.map((group) => ({
    group,
    nameKey: `shortcuts.group.${group}`,
    rows: referenceDefinitions(group).map((def) => ({
      def,
      // The global row shows the user's actual configured hotkey, not just
      // the default, once settings have loaded.
      parts:
        def.id === "globalTerminal" && globalHotkey
          ? bindingToDisplayParts(globalHotkey, isMac)
          : getDisplayParts(def, isMac),
    })),
  }));
}

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

function settingsToOverrides(s: AppSettings): Partial<Record<ActionId, string>> {
  // Registry-driven (Phase 2): every rebindable action's stored binding is
  // picked up here automatically, including Phase 2 additions.
  return overridesFromSettings(s as unknown as Record<string, unknown>);
}

export const ShortcutsHelp = memo(function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [bindings, setBindings] = useState<Record<ActionId, string>>(DEFAULT_IN_APP_SHORTCUTS);
  const [globalHotkey, setGlobalHotkey] = useState("");
  const [editing, setEditing] = useState<ActionId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const labelFor = useCallback(
    (key: string): string => {
      const v = t(key as never) as unknown as string;
      if (typeof v === "string" && v !== key) return v;
      const fb = (IN_APP_FALLBACK_EN as Partial<Record<string, string>>)[key];
      return fb ?? key;
    },
    [t]
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = () => {
      getSettings()
        .then((s) => {
          if (cancelled) return;
          setBindings(resolveInAppShortcuts(settingsToOverrides(s)));
          setGlobalHotkey(s.terminal_hotkey ?? "");
        })
        .catch(() => {});
    };
    load();
    const unlisten = listen("settings-changed", load);
    return () => {
      cancelled = true;
      unlisten.then((f) => f());
    };
  }, [open ]);

  const filtered = useMemo(() => {
    const categories = buildReferenceCategories(globalHotkey, detectMac());
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((cat) => ({
        ...cat,
        rows: cat.rows.filter(
          (row) =>
            labelFor(row.def.descriptionKey).toLowerCase().includes(q) ||
            row.parts.some((k) => k.toLowerCase().includes(q)) ||
            row.def.defaultBinding.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.rows.length > 0);
  }, [query, globalHotkey, labelFor]);

  const filteredInApp = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return IN_APP_ROWS;
    return IN_APP_ROWS.filter((row) => {
      const binding = bindings[row.actionId] ?? DEFAULT_IN_APP_SHORTCUTS[row.actionId];
      return (
        labelFor(row.descriptionKey).toLowerCase().includes(q) ||
        row.actionId.toLowerCase().includes(q) ||
        binding.toLowerCase().includes(q)
      );
    });
  }, [query, bindings, labelFor]);

  const inAppGroupTitle = useMemo(() => {
    const v = t("shortcuts.group.inApp" as never) as unknown as string;
    return typeof v === "string" && v !== "shortcuts.group.inApp" ? v : "In-App";
  }, [t]);

  const trEditor = useCallback(
    (key: string, fallback: string): string => {
      const v = t(key as never) as unknown as string;
      return typeof v === "string" && v !== key ? v : fallback;
    },
    [t]
  );

  // Conflict spaces (FR9, Phase 2): bindings only clash within one
  // handler space. The app/list actions share useKeyboardShortcuts, so two
  // of them can never share a chord; terminal actions live in
  // TerminalWorkspace's capture-phase handler, so the same chord in both
  // spaces is legal by design (context priority decides) — CmdOrCtrl+N is
  // both addProject and terminalNewTab, and that must stay saveable.
  const spaceOf = useCallback((actionId: ActionId): "terminal" | "app" => {
    const row = IN_APP_ROWS.find((r) => r.actionId === actionId);
    return row?.def.context === "terminal" ? "terminal" : "app";
  }, []);

  const findClash = useCallback(
    (actionId: ActionId, candidate: string): string | null => {
      // Escape is the one fixed key: it dismisses dialogs everywhere and
      // can never be rebound to an action.
      if (normalizeBinding(candidate) === "Escape") {
        return labelFor("shortcuts.general.cancel");
      }
      const space = spaceOf(actionId);
      const row = IN_APP_ROWS.find(
        (r) =>
          r.actionId !== actionId &&
          spaceOf(r.actionId) === space &&
          bindingsConflict(candidate, bindings[r.actionId] ?? DEFAULT_IN_APP_SHORTCUTS[r.actionId])
      );
      if (row) return labelFor(row.descriptionKey);
      if (globalHotkey) {
        if (actionId === "toggleTerminal" ? isSameChord(candidate, globalHotkey, detectMac()) : bindingsConflict(candidate, globalHotkey))
          return globalHotkey;
      }
      return null;
    },
    [bindings, globalHotkey, labelFor, spaceOf]
  );

  const commitBinding = useCallback(
    async (actionId: ActionId, settingsField: keyof AppSettings, raw: string) => {
      let normalized = normalizeBinding(raw);
      if (!normalized) return;
      // Digit-range rows (jump by index/project) need a digit key: the
      // stored form canonicalises the recorded digit to "Digit", the
      // placeholder matchDigitRange understands. Anything else would be
      // a dead binding, so refuse it with an explanation.
      const row = IN_APP_ROWS.find((r) => r.actionId === actionId);
      if (row?.digitRange) {
        const parts = normalized.split("+");
        const last = parts[parts.length - 1];
        if (!/^[0-9]$/.test(last) && last !== "Digit") {
          setNotice(trEditor("shortcuts.editor.digitRange", "Jump shortcuts need a digit key (e.g. Alt+1)"));
          return;
        }
        normalized = [...parts.slice(0, -1), "Digit"].join("+");
      }
      if (bindings[actionId] === normalized) {
        setEditing(null);
        return;
      }
      const clashName = findClash(actionId, normalized);
      if (clashName) {
        setNotice(trEditor("shortcuts.editor.conflict", "Conflicts with {{action}}").replace("{{action}}", clashName));
        return;
      }
      const prev = bindings[actionId];
      setBindings((b) => ({ ...b, [actionId]: normalized }));
      setEditing(null);
      try {
        await updateSettingsPartial({ [settingsField]: normalized } as Partial<AppSettings>);
        setNotice(null);
      } catch (e) {
        setBindings((b) => ({ ...b, [actionId]: prev }));
        setNotice(`${normalized}: ${String(e)}`);
      }
    },
    [bindings, findClash, trEditor]
  );

  const resetBinding = useCallback(
    async (actionId: ActionId, settingsField: keyof AppSettings) => {
      const fallback = DEFAULT_IN_APP_SHORTCUTS[actionId];
      const prev = bindings[actionId];
      if (prev === fallback) return;
      const clashName = findClash(actionId, fallback);
      if (clashName) {
        setNotice(trEditor("shortcuts.editor.conflict", "Conflicts with {{action}}").replace("{{action}}", clashName));
        return;
      }
      setBindings((b) => ({ ...b, [actionId]: fallback }));
      try {
        await updateSettingsPartial({ [settingsField]: fallback } as Partial<AppSettings>);
        setNotice(null);
      } catch (e) {
        setBindings((b) => ({ ...b, [actionId]: prev }));
        setNotice(`Failed to reset: ${String(e)}`);
      }
    },
    [bindings, findClash, trEditor]
  );

  return (
    <Modal open={open} onClose={onClose} title={t("shortcuts.title")} width="sm">
      <div className="px-4 pb-3 pt-3">
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

        {notice && (
          <p role="alert" className="mb-2 text-[12px] text-red-600 dark:text-red-400">
            {notice}
          </p>
        )}

        <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-0.5">
          {/* Groups left with no reference rows (git, view since Phase 2:
              all their actions are rebindable editor rows now) render no
              heading at all, instead of an empty section. */}
          {filtered.filter((cat) => cat.rows.length > 0).map((cat) => (
            <div key={cat.group}>
              <h3 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                {t(cat.nameKey as never)}
              </h3>
              <div>
                {cat.rows.map((row) => (
                  <div
                    key={row.def.id}
                    className="flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <span className="text-[13px] text-gray-700 dark:text-gray-300">
                      {labelFor(row.def.descriptionKey)}
                    </span>
                    <div className="flex items-center gap-0.5 ml-3 shrink-0">
                      {row.parts.map((k, i) => (
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
          {filteredInApp.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                {inAppGroupTitle}
              </h3>
              <div>
                {filteredInApp.map((row) => {
                  const binding = bindings[row.actionId] ?? DEFAULT_IN_APP_SHORTCUTS[row.actionId];
                  const isDefault = binding === DEFAULT_IN_APP_SHORTCUTS[row.actionId];
                  const isEditing = editing === row.actionId;
                  return (
                    <div
                      key={row.actionId}
                      className="flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <span className="text-[13px] text-gray-700 dark:text-gray-300">
                        {labelFor(row.descriptionKey)}
                      </span>
                      {isEditing ? (
                        <ShortcutRecorder
                          initial={binding}
                          onCommit={(next) => void commitBinding(row.actionId, row.settingsField, next)}
                          onCancel={() => setEditing(null)}
                        />
                      ) : (
                        <div className="flex items-center gap-1 ml-3 shrink-0">
                          <div className="flex items-center gap-0.5">
                            {(() => {
                              const parts = getEditorDisplayParts(row.def, binding);
                              if (parts.length === 0) {
                                return (
                                  <span className="text-[11px] text-gray-400 dark:text-gray-500 italic">
                                    {trEditor("shortcuts.editor.unbound", "Unbound")}
                                  </span>
                                );
                              }
                              return parts.map((k, i) => (
                                <span key={i} className="flex items-center gap-0.5">
                                  {i > 0 && <span className="text-[11px] text-gray-400">+</span>}
                                  <KbdBadge label={k} size="sm" />
                                </span>
                              ));
                            })()}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setNotice(null);
                              setEditing(row.actionId);
                            }}
                            title="Edit shortcut"
                            aria-label={`Edit ${row.actionId} shortcut`}
                            className="px-1.5 py-0.5 rounded-md text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void resetBinding(row.actionId, row.settingsField)}
                            disabled={isDefault}
                            title="Reset to default"
                            aria-label={`Reset ${row.actionId} shortcut to default`}
                            className="px-1.5 py-0.5 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                          >
                            Reset
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {filtered.every((cat) => cat.rows.length === 0) && filteredInApp.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
              {t("shortcuts.noMatch")}
            </p>
          )}
        </div>

        <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500 text-center">
          {t("shortcuts.footer")}
        </p>
      </div>
    </Modal>
  );
});
export default ShortcutsHelp;

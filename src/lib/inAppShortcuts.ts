export type ActionId =
  | "addProject"
  | "refreshAll"
  | "focusSearch"
  | "exportImport"
  | "toggleSidebar"
  | "commandPalette"
  | "shortcutsHelp"
  | "quickDiff"
  | "navigateDown"
  | "navigateUp"
  | "selectFocused"
  | "toggleTerminal";

import { getInAppDefaults, getSettingsFieldMap } from "./shortcutRegistry";

// The 12 rebindable defaults now live in the canonical registry
// (src/lib/shortcutRegistry.ts) and are re-exported here so existing
// imports and tests keep working. Values are unchanged.
export const DEFAULT_IN_APP_SHORTCUTS: Record<ActionId, string> = getInAppDefaults();

export const SETTINGS_FIELD_TO_ACTION_ID: Record<string, ActionId> = getSettingsFieldMap();

interface ParsedBinding {
  needCmdOrCtrl: boolean;
  needMeta: boolean;
  needCtrl: boolean;
  needAlt: boolean;
  needShift: boolean;
  key: string;
  isBackquote: boolean;
}

export function parseBinding(binding: string): ParsedBinding | null {
  const parts = binding
    .split("+")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  let needCmdOrCtrl = false;
  let needMeta = false;
  let needCtrl = false;
  let needAlt = false;
  let needShift = false;
  const keys: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "cmdorctrl") needCmdOrCtrl = true;
    else if (lower === "cmd" || lower === "command" || lower === "meta" || lower === "super") needMeta = true;
    else if (lower === "ctrl" || lower === "control") needCtrl = true;
    else if (lower === "alt" || lower === "option") needAlt = true;
    else if (lower === "shift") needShift = true;
    else keys.push(part);
  }
  if (keys.length !== 1) return null;
  const key = keys[0];
  const isBackquote = key === "`" || key === "~" || key.toLowerCase() === "backquote";
  return { needCmdOrCtrl, needMeta, needCtrl, needAlt, needShift, key, isBackquote };
}

/**
 * True when the binding is a chord that requires at least one modifier key.
 * Bare bindings (J, K, Enter) are not chords and are never subject to the
 * "clean chord" check.
 */
export function bindingUsesModifier(binding: string): boolean {
  const p = parseBinding(binding);
  if (!p) return false;
  return p.needCmdOrCtrl || p.needMeta || p.needCtrl || p.needAlt || p.needShift;
}

export function matchesBinding(e: KeyboardEvent, binding: string): boolean {
  const p = parseBinding(binding);
  if (!p) return false;
  if (p.isBackquote) {
    if (e.code !== "Backquote") return false;
    if (p.needCmdOrCtrl) {
      if (!(e.metaKey || e.ctrlKey)) return false;
    } else if (p.needCtrl && p.needMeta) {
      if (!e.ctrlKey || !e.metaKey) return false;
    } else if (p.needCtrl) {
      if (!e.ctrlKey || e.metaKey) return false;
    } else if (p.needMeta) {
      if (!e.metaKey || e.ctrlKey) return false;
    } else if (e.metaKey || e.ctrlKey) {
      return false;
    }
    if (e.altKey !== p.needAlt) return false;
    return true;
  }
  if (p.needCmdOrCtrl) {
    if (!(e.metaKey || e.ctrlKey)) return false;
  } else if (p.needCtrl || p.needMeta) {
    if (p.needCtrl !== e.ctrlKey) return false;
    if (p.needMeta !== e.metaKey) return false;
  } else if (e.metaKey || e.ctrlKey) {
    return false;
  }
  if (e.altKey !== p.needAlt) return false;
  if (e.shiftKey !== p.needShift) return false;
  return e.key.toLowerCase() === p.key.toLowerCase();
}

export function matchesGlobalHotkey(e: KeyboardEvent, hotkey: string, isMac: boolean): boolean {
  const p = parseBinding(hotkey);
  if (!p) return false;
  if (p.needCmdOrCtrl) {
    if (isMac) {
      if (!e.metaKey || e.ctrlKey) return false;
    } else if (!e.ctrlKey || e.metaKey) return false;
  } else if (p.needCtrl || p.needMeta) {
    if (p.needCtrl !== e.ctrlKey) return false;
    if (p.needMeta !== e.metaKey) return false;
  } else if (e.metaKey || e.ctrlKey) return false;
  if (e.altKey !== p.needAlt) return false;
  if (e.shiftKey !== p.needShift) return false;
  if (p.isBackquote) return e.code === "Backquote";
  return e.key.toLowerCase() === p.key.toLowerCase();
}

export function resolveInAppShortcuts(
  overrides?: Partial<Record<ActionId, string>>
): Record<ActionId, string> {
  const merged = { ...DEFAULT_IN_APP_SHORTCUTS };
  if (!overrides) return merged;
  for (const [k, v] of Object.entries(overrides)) {
    if (typeof v === "string" && v) merged[k as ActionId] = v;
  }
  return merged;
}

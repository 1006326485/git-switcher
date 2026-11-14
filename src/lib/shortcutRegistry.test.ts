import { describe, expect, it } from "vitest";
import {
  CONTEXT_PRIORITY,
  SHORTCUT_REGISTRY,
  definitionById,
  getDefaultBinding,
  getDisplayParts,
  getInAppDefaults,
  inAppDefinitions,
  referenceDefinitions,
} from "./shortcutRegistry";
import { DEFAULT_IN_APP_SHORTCUTS } from "./inAppShortcuts";
import { bindingToDisplayParts } from "./hotkey";

describe("shortcutRegistry (Phase 1)", () => {
  it("has unique ids and every entry has a description key, context and group", () => {
    const ids = SHORTCUT_REGISTRY.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of SHORTCUT_REGISTRY) {
      expect(def.descriptionKey).toMatch(/^shortcuts\./);
      expect(CONTEXT_PRIORITY).toContain(def.context);
    }
  });

  it("keeps the rebindable defaults, with the terminal toggle on the unshifted backquote", () => {
    const defaults = getInAppDefaults();
    expect(defaults).toMatchObject({
      addProject: "CmdOrCtrl+N",
      refreshAll: "CmdOrCtrl+R",
      focusSearch: "CmdOrCtrl+F",
      exportImport: "CmdOrCtrl+E",
      toggleSidebar: "CmdOrCtrl+B",
      commandPalette: "CmdOrCtrl+K",
      shortcutsHelp: "CmdOrCtrl+/",
      quickDiff: "CmdOrCtrl+D",
      navigateDown: "J",
      navigateUp: "K",
      selectFocused: "Enter",
      toggleTerminal: "CmdOrCtrl+`",
    });
    // inAppShortcuts re-exports the registry defaults, so the old import
    // path and the registry cannot drift apart.
    expect(DEFAULT_IN_APP_SHORTCUTS).toEqual(defaults);
  });

  it("makes view modes, fetch-all, Settings, and terminal actions rebindable (Phase 2)", () => {
    const defaults = getInAppDefaults();
    expect(defaults).toMatchObject({
      viewCard: "CmdOrCtrl+1",
      viewList: "CmdOrCtrl+2",
      viewCompact: "CmdOrCtrl+3",
      viewTable: "CmdOrCtrl+4",
      viewDashboard: "CmdOrCtrl+5",
      fetchAll: "CmdOrCtrl+Shift+G",
      openSettings: "CmdOrCtrl+,",
      terminalSwitchGroupPrev: "CmdOrCtrl+ArrowUp",
      terminalSwitchGroupNext: "CmdOrCtrl+ArrowDown",
      terminalSwitchTabPrev: "CmdOrCtrl+ArrowLeft",
      terminalSwitchTabNext: "CmdOrCtrl+ArrowRight",
      terminalJumpIndex: "Alt+Digit",
      terminalJumpProject: "CmdOrCtrl+Digit",
      terminalNewTab: "CmdOrCtrl+Shift+N",
      terminalNewTabInProject: "CmdOrCtrl+N",
      terminalCloseTab: "CmdOrCtrl+W",
      // Unbound by default: no free universal convention (see registry notes).
      terminalFocusInput: "",
      terminalClearScreen: "",
    });
    // 12 original + 5 views + fetch-all + Settings + 11 terminal actions.
    expect(inAppDefinitions()).toHaveLength(30);
    for (const def of inAppDefinitions()) {
      expect(def.rebindable).toBe(true);
      expect(def.settingsField).toMatch(/^in_app_/);
    }
    const fields = inAppDefinitions().map((d) => d.settingsField);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("marks digit-range bindings and renders them as a range", () => {
    const jumpIndex = definitionById("terminalJumpIndex");
    const jumpProject = definitionById("terminalJumpProject");
    expect(jumpIndex?.digitRange).toBe(true);
    expect(jumpProject?.digitRange).toBe(true);
    expect(getDisplayParts(jumpIndex!, false)).toEqual(["Alt", "1…9"]);
    expect(getDisplayParts(jumpProject!, true)).toEqual(["⌘", "1…9"]);
    // A digit-range row is still a rebindable editor row, not a reference row.
    expect(referenceDefinitions("terminal").map((d) => d.id)).not.toContain("terminalJumpIndex");
  });

  it("pins the FR2 context priority order", () => {
    expect(CONTEXT_PRIORITY).toEqual([
      "recorder",
      "dialog",
      "terminal",
      "palette",
      "list",
      "app",
      "global",
    ]);
  });

  it("covers the formerly hardcoded actions: view modes, fetch-all, terminal", () => {
    for (const id of [
      "viewCard",
      "viewList",
      "viewCompact",
      "viewTable",
      "viewDashboard",
      "fetchAll",
      "globalTerminal",
      "terminalNewTab",
      "terminalNewTabInProject",
      "terminalCloseTab",
      "terminalSwitchGroupPrev",
      "terminalSwitchGroupNext",
      "terminalSwitchTabPrev",
      "terminalSwitchTabNext",
      "terminalJumpIndex",
      "terminalJumpProject",
      "terminalFocusInput",
      "terminalClearScreen",
    ]) {
      expect(definitionById(id)).toBeDefined();
    }
    expect(definitionById("viewCard")?.defaultBinding).toBe("CmdOrCtrl+1");
    expect(definitionById("fetchAll")?.defaultBinding).toBe("CmdOrCtrl+Shift+G");
    // The global terminal hotkey is owned by the backend and stays untouched.
    expect(definitionById("globalTerminal")?.defaultBinding).toBe("CmdOrCtrl+Shift+`");
  });

  it("renders the terminal toggle and global rows with distinct, platform-correct parts", () => {
    const toggle = definitionById("toggleTerminal")!;
    const global = definitionById("globalTerminal")!;
    expect(getDisplayParts(toggle, true)).toEqual(["⌘", "`"]);
    expect(getDisplayParts(toggle, false)).toEqual(["Ctrl", "`"]);
    expect(getDisplayParts(global, true)).toEqual(["⌘", "⇧", "`"]);
    expect(getDisplayParts(global, false)).toEqual(["Ctrl", "Shift", "`"]);
    // The in-app toggle must never render as the Shift chord.
    expect(getDisplayParts(toggle, true)).not.toContain("⇧");
    expect(getDisplayParts(toggle, false)).not.toContain("Shift");
  });

  it("gives refresh-all exactly one owner note and an OS-override flag", () => {
    const def = definitionById("refreshAll");
    expect(def?.overridesOsOrBrowser).toBe(true);
    expect(def?.note).toMatch(/SINGLE OWNER/);
  });

  it("renders platform-correct display parts: no macOS symbols on Windows/Linux", () => {
    const macOnly = ["⌘", "⌥", "⇧", "⌃"];
    for (const def of SHORTCUT_REGISTRY) {
      const parts = getDisplayParts(def, false);
      for (const part of parts) {
        for (const sym of macOnly) {
          expect(part).not.toContain(sym);
        }
      }
      // And the canonical binding round-trips through the existing display
      // helper for every keyboard row except digit-range rows, whose
      // display replaces the placeholder digit with "1…9" by design.
      if (def.defaultBinding && !def.displayParts && !def.digitRange) {
        expect(getDisplayParts(def, true)).toEqual(
          bindingToDisplayParts(def.defaultBinding, true)
        );
      }
    }
  });

  it("derives reference groups for the help panel without the rebindable rows", () => {
    // Reference sections show each action once; rebindable actions live
    // only in the In-App editor section, so no stale duplicate row. Since
    // Phase 2 the view and git groups have no reference rows left (all
    // their actions are rebindable), and the terminal group keeps only
    // the non-keyboard middle-click row.
    expect(referenceDefinitions("view")).toEqual([]);
    expect(referenceDefinitions("git")).toEqual([]);
    expect(referenceDefinitions("terminal").map((d) => d.id)).toEqual([
      "terminalCloseTabMouse",
    ]);
    for (const def of SHORTCUT_REGISTRY) {
      if (def.rebindable) {
        expect(referenceDefinitions(def.group)).not.toContain(def);
      }
    }
  });

  it("resolves per-platform defaults, falling back to the canonical binding", () => {
    const def = definitionById("addProject")!;
    expect(getDefaultBinding(def, "mac")).toBe("CmdOrCtrl+N");
    expect(getDefaultBinding(def, "windows")).toBe("CmdOrCtrl+N");
    const overridden: typeof def = {
      ...def,
      platformDefaults: { mac: "Cmd+X", windows: "Ctrl+X" },
    };
    expect(getDefaultBinding(overridden, "mac")).toBe("Cmd+X");
    expect(getDefaultBinding(overridden, "windows")).toBe("Ctrl+X");
    expect(getDefaultBinding(overridden, "linux")).toBe("CmdOrCtrl+N");
  });

  it("marks composite rows display-only so they are never fed to matchesBinding", () => {
    for (const id of [
      "navigateArrows",
      "navigateToggleDetails",
      "navigateRefreshProject",
      "terminalCloseTabMouse",
    ]) {
      expect(definitionById(id)?.displayOnly).toBe(true);
    }
    // Phase 2: the former terminal pair/range rows are real rebindable
    // single chords / digit-range bindings now, not display-only.
    for (const id of [
      "terminalSwitchGroupPrev",
      "terminalJumpIndex",
      "terminalNewTab",
    ]) {
      expect(definitionById(id)?.displayOnly).not.toBe(true);
    }
  });
});

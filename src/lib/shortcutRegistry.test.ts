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

  it("keeps the 12 rebindable defaults exactly as shipped (no default changes)", () => {
    expect(getInAppDefaults()).toEqual({
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
      toggleTerminal: "Control+~",
    });
    // inAppShortcuts re-exports the registry defaults, so the old import
    // path and the registry cannot drift apart.
    expect(DEFAULT_IN_APP_SHORTCUTS).toEqual(getInAppDefaults());
    expect(inAppDefinitions()).toHaveLength(12);
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
      "terminalCloseTab",
      "terminalSwitchGroup",
      "terminalSwitchTab",
      "terminalJumpIndex",
      "terminalJumpProject",
    ]) {
      expect(definitionById(id)).toBeDefined();
    }
    expect(definitionById("viewCard")?.defaultBinding).toBe("CmdOrCtrl+1");
    expect(definitionById("fetchAll")?.defaultBinding).toBe("CmdOrCtrl+Shift+G");
    // Phase 1 constraint: the global terminal hotkey is untouched.
    expect(definitionById("globalTerminal")?.defaultBinding).toBe("CmdOrCtrl+Shift+`");
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
      // helper for every keyboard row.
      if (def.defaultBinding && !def.displayParts) {
        expect(getDisplayParts(def, true)).toEqual(
          bindingToDisplayParts(def.defaultBinding, true)
        );
      }
    }
  });

  it("derives reference groups for the help panel without the rebindable rows", () => {
    // Reference sections show each action once; the 12 rebindable actions
    // live only in the In-App editor section, so no stale duplicate row.
    expect(referenceDefinitions("view").map((d) => d.id)).toEqual([
      "viewCard",
      "viewList",
      "viewCompact",
      "viewTable",
      "viewDashboard",
    ]);
    expect(referenceDefinitions("git").map((d) => d.id)).toEqual(["fetchAll"]);
    expect(referenceDefinitions("terminal").map((d) => d.id)).toContain("terminalNewTab");
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
      "navigateRefreshProject",
      "terminalSwitchGroup",
      "terminalSwitchTab",
      "terminalJumpIndex",
      "terminalJumpProject",
      "terminalCloseTabMouse",
    ]) {
      expect(definitionById(id)?.displayOnly).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_IN_APP_SHORTCUTS,
  matchesBinding,
  matchesGlobalHotkey,
  resolveInAppShortcuts,
} from "./inAppShortcuts";

function keyEvent(init: Partial<KeyboardEvent>): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("matchesGlobalHotkey", () => {
  it("maps CmdOrCtrl+Shift+~ to Ctrl+Shift+` on pc and Cmd+Shift+~ on mac", () => {
    const pc = keyEvent({ key: "~", code: "Backquote", ctrlKey: true, shiftKey: true });
    expect(matchesGlobalHotkey(pc, "CmdOrCtrl+Shift+~", false)).toBe(true);
    expect(matchesGlobalHotkey(pc, "CmdOrCtrl+Shift+~", true)).toBe(false);
    const mac = keyEvent({ key: "~", code: "Backquote", metaKey: true, shiftKey: true });
    expect(matchesGlobalHotkey(mac, "CmdOrCtrl+Shift+~", true)).toBe(true);
    expect(matchesGlobalHotkey(mac, "CmdOrCtrl+Shift+~", false)).toBe(false);
  });

  it("does not swallow ctrl-only presses for a shift-bound global", () => {
    const e = keyEvent({ key: "`", code: "Backquote", ctrlKey: true });
    expect(matchesGlobalHotkey(e, "CmdOrCtrl+Shift+~", false)).toBe(false);
  });
});

describe("resolveInAppShortcuts", () => {
  it("falls back to defaults when overrides are missing", () => {
    expect(resolveInAppShortcuts()).toEqual(DEFAULT_IN_APP_SHORTCUTS);
    expect(resolveInAppShortcuts({})).toEqual(DEFAULT_IN_APP_SHORTCUTS);
    expect(resolveInAppShortcuts({ toggleTerminal: "" })).toEqual(DEFAULT_IN_APP_SHORTCUTS);
  });

  it("applies overrides", () => {
    const merged = resolveInAppShortcuts({ toggleTerminal: "Ctrl+T" });
    expect(merged.toggleTerminal).toBe("Ctrl+T");
    expect(merged.addProject).toBe(DEFAULT_IN_APP_SHORTCUTS.addProject);
  });
});

describe("matchesBinding for Control+~", () => {
  it("matches Ctrl+` and Ctrl+Shift+` via Backquote code", () => {
    const binding = "Control+~";
    expect(
      matchesBinding(keyEvent({ key: "`", code: "Backquote", ctrlKey: true }), binding)
    ).toBe(true);
    expect(
      matchesBinding(keyEvent({ key: "~", code: "Backquote", ctrlKey: true, shiftKey: true }), binding)
    ).toBe(true);
  });

  it("honours non-default backquote bindings (M1)", () => {
    expect(
      matchesBinding(keyEvent({ key: "~", code: "Backquote", altKey: true }), "Alt+~")
    ).toBe(true);
    expect(
      matchesBinding(keyEvent({ key: "`", code: "Backquote", ctrlKey: true }), "Alt+~")
    ).toBe(false);
    expect(
      matchesBinding(keyEvent({ key: "~", code: "Backquote", metaKey: true, shiftKey: true }), "CmdOrCtrl+~")
    ).toBe(true);
  });

  it("rejects Cmd+~ and bare backquote", () => {
    const binding = "Control+~";
    expect(
      matchesBinding(keyEvent({ key: "~", code: "Backquote", metaKey: true, shiftKey: true }), binding)
    ).toBe(false);
    expect(matchesBinding(keyEvent({ key: "`", code: "Backquote" }), binding)).toBe(false);
  });
});

describe("matchesBinding for classic combos", () => {
  it("treats Cmd and Ctrl as equivalent for CmdOrCtrl", () => {
    expect(matchesBinding(keyEvent({ key: "n", metaKey: true }), "CmdOrCtrl+N")).toBe(true);
    expect(matchesBinding(keyEvent({ key: "n", ctrlKey: true }), "CmdOrCtrl+N")).toBe(true);
    expect(matchesBinding(keyEvent({ key: "n" }), "CmdOrCtrl+N")).toBe(false);
  });
});

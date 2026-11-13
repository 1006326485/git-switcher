import { describe, expect, it } from "vitest";
import {
  DEFAULT_IN_APP_SHORTCUTS,
  matchDigitRange,
  matchesBinding,
  matchesGlobalHotkey,
  overridesFromSettings,
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

describe("matchDigitRange", () => {
  it("matches any digit 1-9 and returns its zero-based index", () => {
    expect(matchDigitRange(keyEvent({ code: "Digit1", altKey: true }), "Alt+Digit", false)).toBe(0);
    expect(matchDigitRange(keyEvent({ code: "Digit9", altKey: true }), "Alt+Digit", false)).toBe(8);
    expect(matchDigitRange(keyEvent({ code: "Digit5", ctrlKey: true }), "CmdOrCtrl+Digit", false)).toBe(4);
    expect(matchDigitRange(keyEvent({ code: "Digit5", metaKey: true }), "CmdOrCtrl+Digit", true)).toBe(4);
  });

  it("ignores the placeholder digit in the stored binding", () => {
    // A rebound "Alt+3" still means Alt + any digit, not only tab 3.
    expect(matchDigitRange(keyEvent({ code: "Digit7", altKey: true }), "Alt+3", false)).toBe(6);
  });

  it("rejects wrong modifiers, shift variants, and non-digit codes", () => {
    expect(matchDigitRange(keyEvent({ code: "Digit1" }), "Alt+Digit", false)).toBeNull();
    expect(matchDigitRange(keyEvent({ code: "Digit1", altKey: true, shiftKey: true }), "Alt+Digit", false)).toBeNull();
    expect(matchDigitRange(keyEvent({ code: "Digit1", metaKey: true }), "Alt+Digit", false)).toBeNull();
    expect(matchDigitRange(keyEvent({ code: "KeyA", altKey: true }), "Alt+Digit", false)).toBeNull();
    expect(matchDigitRange(keyEvent({ code: "Digit0", altKey: true }), "Alt+Digit", false)).toBeNull();
  });

  it("resolves CmdOrCtrl platform-aware: Ctrl never matches on macOS", () => {
    expect(matchDigitRange(keyEvent({ code: "Digit2", ctrlKey: true }), "CmdOrCtrl+Digit", true)).toBeNull();
    expect(matchDigitRange(keyEvent({ code: "Digit2", metaKey: true }), "CmdOrCtrl+Digit", false)).toBeNull();
  });
});

describe("overridesFromSettings", () => {
  it("maps stored settings fields to actions, skipping empty and unknown fields", () => {
    expect(
      overridesFromSettings({
        in_app_view_card: "CmdOrCtrl+9",
        in_app_terminal_new_tab: "CmdOrCtrl+T",
        in_app_terminal_focus_input: "",
        unrelated_field: "CmdOrCtrl+Z",
      })
    ).toEqual({
      viewCard: "CmdOrCtrl+9",
      terminalNewTab: "CmdOrCtrl+T",
    });
  });
});

describe("matchesBinding for classic combos", () => {
  it("treats Cmd and Ctrl as equivalent for CmdOrCtrl", () => {
    expect(matchesBinding(keyEvent({ key: "n", metaKey: true }), "CmdOrCtrl+N")).toBe(true);
    expect(matchesBinding(keyEvent({ key: "n", ctrlKey: true }), "CmdOrCtrl+N")).toBe(true);
    expect(matchesBinding(keyEvent({ key: "n" }), "CmdOrCtrl+N")).toBe(false);
  });
});

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

describe("matchesBinding for the toggleTerminal default (CmdOrCtrl+`)", () => {
  it("matches an unshifted Cmd/Ctrl+` press via the Backquote code", () => {
    const binding = DEFAULT_IN_APP_SHORTCUTS.toggleTerminal;
    expect(binding).toBe("CmdOrCtrl+`");
    expect(
      matchesBinding(keyEvent({ key: "`", code: "Backquote", metaKey: true }), binding, true)
    ).toBe(true);
    expect(
      matchesBinding(keyEvent({ key: "`", code: "Backquote", ctrlKey: true }), binding, false)
    ).toBe(true);
  });

  it("accepts only the platform's modifier, never both", () => {
    const binding = DEFAULT_IN_APP_SHORTCUTS.toggleTerminal;
    const cmd = keyEvent({ key: "`", code: "Backquote", metaKey: true });
    const ctrl = keyEvent({ key: "`", code: "Backquote", ctrlKey: true });
    // macOS: Ctrl+` belongs to the shell, so it must not toggle the panel.
    expect(matchesBinding(cmd, binding, true)).toBe(true);
    expect(matchesBinding(ctrl, binding, true)).toBe(false);
    // Windows/Linux: the Win key is not a Ctrl substitute either.
    expect(matchesBinding(ctrl, binding, false)).toBe(true);
    expect(matchesBinding(cmd, binding, false)).toBe(false);
  });

  it("does not match a Shift-held Cmd/Ctrl+` press (that is the global chord)", () => {
    const binding = DEFAULT_IN_APP_SHORTCUTS.toggleTerminal;
    expect(
      matchesBinding(keyEvent({ key: "~", code: "Backquote", metaKey: true, shiftKey: true }), binding, true)
    ).toBe(false);
    expect(
      matchesBinding(keyEvent({ key: "~", code: "Backquote", ctrlKey: true, shiftKey: true }), binding, false)
    ).toBe(false);
  });

  it("keeps the in-app toggle and the global Shift chord distinguishable", () => {
    const inApp = DEFAULT_IN_APP_SHORTCUTS.toggleTerminal;
    const global = "CmdOrCtrl+Shift+`";
    const unshifted = { key: "`", code: "Backquote", metaKey: true } as const;
    const shifted = { key: "~", code: "Backquote", metaKey: true, shiftKey: true } as const;
    expect(matchesBinding(keyEvent(unshifted), inApp, true)).toBe(true);
    expect(matchesGlobalHotkey(keyEvent(unshifted), global, true)).toBe(false);
    expect(matchesBinding(keyEvent(shifted), inApp, true)).toBe(false);
    expect(matchesGlobalHotkey(keyEvent(shifted), global, true)).toBe(true);
  });

  it("requires Shift for a Shift-bound backquote binding", () => {
    expect(
      matchesBinding(keyEvent({ key: "~", code: "Backquote", metaKey: true, shiftKey: true }), "CmdOrCtrl+Shift+~", true)
    ).toBe(true);
    expect(
      matchesBinding(keyEvent({ key: "`", code: "Backquote", metaKey: true }), "CmdOrCtrl+Shift+~", true)
    ).toBe(false);
  });

  it("honours non-default backquote bindings (M1)", () => {
    expect(
      matchesBinding(keyEvent({ key: "~", code: "Backquote", altKey: true }), "Alt+~")
    ).toBe(true);
    expect(
      matchesBinding(keyEvent({ key: "`", code: "Backquote", ctrlKey: true }), "Alt+~")
    ).toBe(false);
  });

  it("rejects the wrong modifier and bare backquote", () => {
    const binding = DEFAULT_IN_APP_SHORTCUTS.toggleTerminal;
    expect(
      matchesBinding(keyEvent({ key: "`", code: "Backquote", altKey: true }), binding)
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
  it("resolves CmdOrCtrl to Cmd on macOS and Ctrl elsewhere", () => {
    const cmd = keyEvent({ key: "n", metaKey: true });
    const ctrl = keyEvent({ key: "n", ctrlKey: true });
    expect(matchesBinding(cmd, "CmdOrCtrl+N", true)).toBe(true);
    expect(matchesBinding(ctrl, "CmdOrCtrl+N", true)).toBe(false);
    expect(matchesBinding(ctrl, "CmdOrCtrl+N", false)).toBe(true);
    expect(matchesBinding(cmd, "CmdOrCtrl+N", false)).toBe(false);
    expect(matchesBinding(keyEvent({ key: "n" }), "CmdOrCtrl+N", true)).toBe(false);
    expect(matchesBinding(keyEvent({ key: "n" }), "CmdOrCtrl+N", false)).toBe(false);
  });

  it("keeps an explicit Control binding on Ctrl only, on every platform", () => {
    const ctrl = keyEvent({ key: "n", ctrlKey: true });
    const cmd = keyEvent({ key: "n", metaKey: true });
    expect(matchesBinding(ctrl, "Control+N", true)).toBe(true);
    expect(matchesBinding(ctrl, "Control+N", false)).toBe(true);
    expect(matchesBinding(cmd, "Control+N", true)).toBe(false);
    expect(matchesBinding(cmd, "Control+N", false)).toBe(false);
  });
});

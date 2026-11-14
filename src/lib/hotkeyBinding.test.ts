import { describe, expect, it } from "vitest";
import { bindingToDisplayParts, bindingsConflict, isSameChord, normalizeBinding } from "./hotkey";

describe("normalizeBinding", () => {
  it("canonicalises modifiers and key names", () => {
    expect(normalizeBinding("CmdOrCtrl+N")).toBe("CmdOrCtrl+N");
    expect(normalizeBinding("control + ~")).toBe("Control+~");
    expect(normalizeBinding("Control+`")).toBe("Control+~");
    expect(normalizeBinding("n")).toBe("N");
  });

  it("returns empty string for blank input", () => {
    expect(normalizeBinding("   ")).toBe("");
  });
});

describe("bindingsConflict", () => {
  it("flags duplicate and cross-platform-equivalent combos", () => {
    expect(bindingsConflict("Control+~", "CmdOrCtrl+~")).toBe(true);
    expect(bindingsConflict("Control+~", "Control+Shift+~")).toBe(true);
    expect(bindingsConflict("Ctrl+N", "CmdOrCtrl+N")).toBe(true);
    expect(bindingsConflict("Ctrl+N", "Ctrl+Shift+N")).toBe(false);
  });

  it("flags same key with different modifiers as distinct", () => {
    expect(bindingsConflict("Control+~", "Control+Enter")).toBe(false);
  });

  it("ignores blank bindings", () => {
    expect(bindingsConflict("", "Control+~")).toBe(false);
  });

  it("flags reset-to-default collisions (M2)", () => {
    expect(bindingsConflict("CmdOrCtrl+N", "CmdOrCtrl+N")).toBe(true);
    expect(bindingsConflict("CmdOrCtrl+N", "CmdOrCtrl+M")).toBe(false);
  });

  it("flags a toggleTerminal rebound onto the exact global hotkey as a conflict", () => {
    // The recorder registers a shifted Backquote in-app as "CmdOrCtrl+~",
    // so both the recorded and the literal form must still be caught.
    expect(
      isSameChord(normalizeBinding("CmdOrCtrl+Shift+`"), "CmdOrCtrl+Shift+`", true)
    ).toBe(true);
    expect(bindingsConflict("CmdOrCtrl+~", "CmdOrCtrl+Shift+`")).toBe(true);
    expect(normalizeBinding("CmdOrCtrl+Shift+`")).toBe("CmdOrCtrl+Shift+~");
  });

  it("does not flag the unshifted in-app default as a chord conflict", () => {
    // Shift is ignored for backquote conflicts (recorder semantics); the
    // call site keeps the two rows apart via isSameChord's shift check.
    expect(isSameChord("CmdOrCtrl+`", "CmdOrCtrl+Shift+`", true)).toBe(false);
    expect(isSameChord("CmdOrCtrl+`", "CmdOrCtrl+Shift+`", false)).toBe(false);
  });

  it("lets Control+~ be saved on macOS (regression: clash with the global hotkey)", () => {
    // ⌃~ and ⌘⇧` are different physical chords on macOS — CmdOrCtrl resolves
    // to Cmd there — so recording Control+~ for the terminal toggle must not
    // be reported as a conflict. On Windows/Linux CmdOrCtrl *is* Ctrl, so
    // there the same pair genuinely clashes and must stay rejected.
    const globalHotkey = "CmdOrCtrl+Shift+`";
    expect(bindingsConflict("Control+~", globalHotkey, true)).toBe(false);
    expect(bindingsConflict("Control+~", globalHotkey, false)).toBe(true);

    // CmdOrCtrl still means the same thing as an explicit Cmd on macOS.
    expect(bindingsConflict("Cmd+~", "CmdOrCtrl+~", true)).toBe(true);
    // ...and as an explicit Ctrl elsewhere.
    expect(bindingsConflict("Control+~", "CmdOrCtrl+~", false)).toBe(true);
  });
});

describe("bindingToDisplayParts", () => {
  it("splits each segment for badges", () => {
    expect(bindingToDisplayParts("CmdOrCtrl+Shift+`", false)).toEqual(["Ctrl", "Shift", "`"]);
    expect(bindingToDisplayParts("Control+~", true)).toEqual(["⌃", "~"]);
  });

  it("renders the in-app terminal toggle default with ⌘/Ctrl and no Shift", () => {
    expect(bindingToDisplayParts("CmdOrCtrl+`", true)).toEqual(["⌘", "`"]);
    expect(bindingToDisplayParts("CmdOrCtrl+`", false)).toEqual(["Ctrl", "`"]);
  });
});

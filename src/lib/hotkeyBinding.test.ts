import { describe, expect, it } from "vitest";
import { bindingToDisplayParts, bindingsConflict, normalizeBinding } from "./hotkey";

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
});

describe("bindingToDisplayParts", () => {
  it("splits each segment for badges", () => {
    expect(bindingToDisplayParts("CmdOrCtrl+Shift+`", false)).toEqual(["Ctrl", "Shift", "`"]);
    expect(bindingToDisplayParts("Control+~", true)).toEqual(["⌃", "~"]);
  });
});

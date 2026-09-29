import { describe, it, expect } from "vitest";
import { formatHotkey } from "./hotkey";

describe("formatHotkey", () => {
  it("renders mac symbols without separators", () => {
    expect(formatHotkey("CmdOrCtrl+Shift+`", true)).toBe("⌘⇧`");
    expect(formatHotkey("Alt+Space", true)).toBe("⌥Space");
  });

  it("renders pc labels joined with +", () => {
    expect(formatHotkey("CmdOrCtrl+Shift+`", false)).toBe("Ctrl+Shift+`");
    expect(formatHotkey("Alt+Space", false)).toBe("Alt+Space");
  });

  it("keeps unknown key names as typed", () => {
    expect(formatHotkey("CmdOrCtrl+F12", true)).toBe("⌘F12");
    expect(formatHotkey("CmdOrCtrl+F12", false)).toBe("Ctrl+F12");
  });

  it("tolerates stray whitespace around segments", () => {
    expect(formatHotkey(" CmdOrCtrl + Shift + ` ", true)).toBe("⌘⇧`");
  });
});

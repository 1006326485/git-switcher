import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCommandPalette } from "./useCommandPalette";

function setup() {
  return renderHook(() =>
    useCommandPalette(
      {
        onAddProject: vi.fn(),
        onRefreshAll: vi.fn(),
        onToggleSidebar: vi.fn(),
        onExportImport: vi.fn(),
        onBulkImport: vi.fn(),
        onSettings: vi.fn(),
        onExportArchive: vi.fn(),
        onFetchAll: vi.fn(),
        onPullAll: vi.fn(),
        onPushAll: vi.fn(),
        onQuickDiff: vi.fn(),
        onThemeChange: vi.fn(),
        onViewModeChange: vi.fn(),
        currentTheme: "light",
        onRunProjectScript: vi.fn(),
        onLaunchWorkspace: vi.fn(),
        onOpenBuiltInTerminal: vi.fn(),
        onOpenSystemTerminal: vi.fn(),
        onOpenFinder: vi.fn(),
        onOpenVscode: vi.fn(),
        onCopyPath: vi.fn(),
        onFocusTerminal: vi.fn(),
        onClearTerminal: vi.fn(),
      },
      [],
      [],
      () => {}
    )
  );
}

describe("useCommandPalette Phase 2 commands", () => {
  it("exposes per-project open/copy commands through the project picker", () => {
    const { result } = setup();
    for (const id of [
      "open-builtin-terminal",
      "open-system-terminal",
      "open-finder",
      "open-vscode",
      "copy-path",
    ]) {
      const cmd = result.current.commands.find((c) => c.id === id);
      expect(cmd).toBeDefined();
      expect(cmd?._needsProject).toBe(true);
      expect(typeof cmd?._projectAction).toBe("function");
      // No direct shortcut: these are palette-first by design (D3 open).
      expect(cmd?.shortcut).toBeUndefined();
    }
  });

  it("exposes terminal focus/clear as direct palette commands", () => {
    const { result } = setup();
    const focus = result.current.commands.find((c) => c.id === "focus-terminal");
    const clear = result.current.commands.find((c) => c.id === "clear-terminal");
    expect(focus).toBeDefined();
    expect(clear).toBeDefined();
    expect(focus?._needsProject).not.toBe(true);
    expect(clear?._needsProject).not.toBe(true);
    expect(focus?.shortcut).toBeUndefined();
    expect(clear?.shortcut).toBeUndefined();
  });

  it("keeps the existing all-project git commands", () => {
    const { result } = setup();
    for (const id of ["fetch", "pull", "push"]) {
      expect(result.current.commands.find((c) => c.id === id)).toBeDefined();
    }
  });
});

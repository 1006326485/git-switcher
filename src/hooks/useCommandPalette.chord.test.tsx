import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCommandPalette } from "./useCommandPalette";
import { clearHeldKeys } from "../lib/heldKeys";

/**
 * `Cmd+Shift+F` lives outside the rebindable shortcut table and needs the same
 * clean-chord guard as everything else.
 *
 * `Cmd+K` used to live here too — but it was a *second* owner alongside the
 * rebindable table, so it toggled twice and cancelled itself out. It now belongs
 * to the table alone (see useKeyboardShortcuts.chord.test.tsx / App.chord.test.tsx).
 * The test below pins that single-ownership: a clean Cmd+K here must do nothing.
 */

type Actions = Parameters<typeof useCommandPalette>[0];

const actions: Actions = {
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
};

function press(
  code: string,
  key: string,
  modifiers: KeyboardEventInit = {}
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    code,
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  document.body.dispatchEvent(event);
  return event;
}

function release(code: string, key: string): void {
  document.body.dispatchEvent(
    new KeyboardEvent("keyup", { code, key, bubbles: true })
  );
}

function setup() {
  return renderHook(() => useCommandPalette(actions, [], [], vi.fn()));
}

afterEach(() => {
  clearHeldKeys();
});

describe("command palette chord cleanliness", () => {
  it("does not own Cmd+K — no second toggle", () => {
    const { result } = setup();

    act(() => {
      press("MetaLeft", "Meta", { metaKey: true });
      press("KeyK", "k", { metaKey: true });
    });

    expect(result.current.open).toBe(false);
  });

  it("ignores a dirty Cmd+Shift+F", () => {
    const { result } = setup();

    act(() => {
      press("MetaLeft", "Meta", { metaKey: true });
      press("KeyZ", "z", { metaKey: true });
      press("KeyF", "f", { metaKey: true, shiftKey: true });
      release("KeyZ", "z");
    });

    expect(result.current.open).toBe(false);

    act(() => {
      press("KeyF", "f", { metaKey: true, shiftKey: true });
    });

    expect(result.current.open).toBe(true);
    expect(result.current.query).toBe("/");
  });
});

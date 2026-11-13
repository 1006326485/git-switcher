import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { clearHeldKeys } from "../lib/heldKeys";

/**
 * A chord must be clean: `Ctrl` `z` `~` is not `Ctrl+~`, but
 * `Ctrl` `z` `z↑` `~` is. See the bug report behind heldKeys.ts.
 */
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

function setup(onToggleTerminal: () => void, onNavigateDown: () => void) {
  return renderHook(() =>
    useKeyboardShortcuts(
      {
        onAddProject: () => {},
        onRefreshAll: () => {},
        onToggleSidebar: () => {},
        onExportImport: () => {},
        onToggleTerminal,
        onNavigateDown,
      },
      {},
      ""
    )
  );
}

describe("chord cleanliness", () => {
  it("does not fire a chord while another key is still held", () => {
    const onToggleTerminal = vi.fn();
    setup(onToggleTerminal, vi.fn());

    act(() => {
      press("ControlLeft", "Control", { ctrlKey: true });
      press("KeyZ", "z", { ctrlKey: true });
      press("Backquote", "`", { ctrlKey: true });
    });

    expect(onToggleTerminal).not.toHaveBeenCalled();
  });

  it("fires once the intermediate key has been released", () => {
    const onToggleTerminal = vi.fn();
    setup(onToggleTerminal, vi.fn());

    act(() => {
      press("ControlLeft", "Control", { ctrlKey: true });
      press("KeyZ", "z", { ctrlKey: true });
      release("KeyZ", "z");
      press("Backquote", "`", { ctrlKey: true });
    });

    expect(onToggleTerminal).toHaveBeenCalledTimes(1);
  });

  it("still fires a plain, uninterrupted chord", () => {
    const onToggleTerminal = vi.fn();
    setup(onToggleTerminal, vi.fn());

    act(() => {
      press("ControlLeft", "Control", { ctrlKey: true });
      press("Backquote", "`", { ctrlKey: true });
    });

    expect(onToggleTerminal).toHaveBeenCalledTimes(1);
  });

  it("forgets held keys on window blur so the app cannot wedge", () => {
    const onToggleTerminal = vi.fn();
    setup(onToggleTerminal, vi.fn());

    act(() => {
      press("ControlLeft", "Control", { ctrlKey: true });
      press("KeyZ", "z", { ctrlKey: true });
      // The keyup for `z` is swallowed by an app switch.
      window.dispatchEvent(new Event("blur"));
      clearHeldKeys();
      press("Backquote", "`", { ctrlKey: true });
    });

    expect(onToggleTerminal).toHaveBeenCalledTimes(1);
  });

  it("still swallows the keystroke so the webview default cannot fire", () => {
    const onToggleTerminal = vi.fn();
    setup(onToggleTerminal, vi.fn());

    let dirtyChord: KeyboardEvent | undefined;
    act(() => {
      press("ControlLeft", "Control", { ctrlKey: true });
      press("KeyZ", "z", { ctrlKey: true });
      dirtyChord = press("Backquote", "`", { ctrlKey: true });
    });

    expect(onToggleTerminal).not.toHaveBeenCalled();
    expect(dirtyChord?.defaultPrevented).toBe(true);
  });

  it("leaves bare (non-chord) bindings alone", () => {
    const onNavigateDown = vi.fn();
    setup(vi.fn(), onNavigateDown);

    act(() => {
      press("KeyA", "a");
      press("KeyJ", "j");
    });

    expect(onNavigateDown).toHaveBeenCalledTimes(1);
  });
});

describe("Phase 2 rebindable actions", () => {
  function setupAll(
    handlers: Record<string, () => void>,
    bindings: Record<string, string> = {},
    options?: { bareKeysDisabled?: boolean }
  ) {
    return renderHook(() =>
      useKeyboardShortcuts(
        {
          onAddProject: () => {},
          onRefreshAll: () => {},
          onToggleSidebar: () => {},
          onExportImport: () => {},
          ...handlers,
        } as never,
        bindings as never,
        "",
        options
      )
    );
  }

  it("fires view mode, fetch-all, and Open Settings through the hook", () => {
    const onViewModeChange = vi.fn();
    const onFetchAll = vi.fn();
    const onOpenSettings = vi.fn();
    setupAll({ onViewModeChange, onFetchAll, onOpenSettings });
    clearHeldKeys();

    act(() => {
      press("Digit1", "1", { metaKey: true });
      release("Digit1", "1");
      press("KeyG", "G", { metaKey: true, shiftKey: true });
      release("KeyG", "G");
      press("Comma", ",", { metaKey: true });
      release("Comma", ",");
    });

    expect(onViewModeChange).toHaveBeenCalledWith("card");
    expect(onFetchAll).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("honours a rebound view binding instead of the default", () => {
    const onViewModeChange = vi.fn();
    setupAll({ onViewModeChange }, { viewCard: "CmdOrCtrl+9" });
    clearHeldKeys();

    act(() => {
      press("Digit1", "1", { metaKey: true });
      release("Digit1", "1");
      press("Digit9", "9", { metaKey: true });
      release("Digit9", "9");
    });

    expect(onViewModeChange).toHaveBeenCalledTimes(1);
    expect(onViewModeChange).toHaveBeenCalledWith("card");
  });

  it("suppresses bare J/K when bare-key navigation is disabled, but not rebound chords", () => {
    const onNavigateDown = vi.fn();
    setupAll({ onNavigateDown }, {}, { bareKeysDisabled: true });
    clearHeldKeys();

    act(() => {
      press("KeyJ", "j");
    });
    expect(onNavigateDown).not.toHaveBeenCalled();

    const onNavigateDownChord = vi.fn();
    setupAll(
      { onNavigateDown: onNavigateDownChord },
      { navigateDown: "CmdOrCtrl+J" },
      { bareKeysDisabled: true }
    );
    clearHeldKeys();
    act(() => {
      press("KeyJ", "j", { metaKey: true });
    });
    expect(onNavigateDownChord).toHaveBeenCalledTimes(1);
  });
});

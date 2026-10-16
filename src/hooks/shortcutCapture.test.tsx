import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ShortcutRecorder } from "../components/ShortcutRecorder";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { isShortcutCapturing } from "../lib/shortcutCapture";

vi.mock("../lib/tauri", () => ({
  getSettings: vi.fn(),
  updateSettingsPartial: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("shortcut capture guard", () => {
  it("exposes capture state while the recorder is mounted", async () => {
    expect(isShortcutCapturing()).toBe(false);
    const view = render(
      <ShortcutRecorder initial="CmdOrCtrl+N" onCommit={() => {}} onCancel={() => {}} />
    );
    expect(isShortcutCapturing()).toBe(true);
    const input = await screen.findByLabelText("Recording… press a key combination");
    act(() => {
      fireEvent.keyDown(input, { key: "Escape" });
    });
    view.unmount();
    expect(isShortcutCapturing()).toBe(false);
  });

  it("suppresses in-app shortcuts while recording", () => {
    const onAddProject = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(
        {
          onAddProject,
          onRefreshAll: () => {},
          onToggleSidebar: () => {},
          onExportImport: () => {},
        },
        { addProject: "CmdOrCtrl+N" },
        ""
      )
    );
    const view = render(
      <ShortcutRecorder initial="CmdOrCtrl+N" onCommit={() => {}} onCancel={() => {}} />
    );
    const press = () =>
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "n", ctrlKey: true, bubbles: true })
      );
    act(press);
    expect(onAddProject).not.toHaveBeenCalled();
    view.unmount();
    act(press);
    expect(onAddProject).toHaveBeenCalledTimes(1);
  });
});

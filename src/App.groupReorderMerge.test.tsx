import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { ProjectDetail } from "./lib/types";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(() => Promise.resolve(null)),
  save: vi.fn(() => Promise.resolve(null)),
  message: vi.fn(() => Promise.resolve()),
  ask: vi.fn(() => Promise.resolve(true)),
  confirm: vi.fn(() => Promise.resolve(true)),
}));

const groups = [
  { id: "g-cc", name: "CC-UI related", color: "#3B82F6", sort_order: 0, created_at: "2026-06-03T00:49:14Z" },
  { id: "g-gcf", name: "GCF related", color: "#f5ec00", sort_order: 1, created_at: "2026-06-03T00:49:26Z" },
];

function detail(id: string, name: string, groupId: string): ProjectDetail {
  return {
    project: {
      id,
      name,
      path: `/Users/spire/Documents/workspace/${name}`,
      alias: null,
      sort_order: 0,
      group_id: groupId,
      last_active_at: null,
      last_commit_hash: null,
      created_at: "2026-06-03T00:49:14Z",
      updated_at: "2026-06-03T00:49:14Z",
    },
    current_branch: "main",
    branches: [],
    status: { modified: 0, staged: 0, untracked: 0, ahead: 0, behind: 0 },
    group: groups.find((g) => g.id === groupId)!,
    stash_count: 0,
  };
}

// Interleaved global order: group slots are NOT contiguous, so a naive save
// of the visible subset would corrupt positions of the other group.
const allProjects = [
  detail("a1", "a1", "g-cc"),
  detail("b1", "b1", "g-gcf"),
  detail("a2", "a2", "g-cc"),
  detail("b2", "b2", "g-gcf"),
];

const invokeMock = vi.fn((...invokeArgs: unknown[]) => {
  const cmd = invokeArgs[0] as string;
  const table: Record<string, unknown> = {
    get_settings: {
      theme: "light",
      auto_refresh: false,
      refresh_interval_secs: 30,
      view_mode: "card",
      llm: { enabled: false, api_key: "", endpoint: "", model: "", temperature: 0.3, max_tokens: 4096, key_in_keychain: false },
      auto_fetch_on_launch: false,
      terminal_hotkey: "CmdOrCtrl+Shift+`",
      terminal_hide_on_blur: false,
    },
    get_background_status: { paused: true, interval_secs: 30, last_run_at: null },
    list_groups: groups,
    list_projects: allProjects,
    reorder_projects: undefined,
  };
  return Promise.resolve(table[cmd] ?? []);
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

// Capture the onReorder callback App passes down, so the test can invoke it
// with the visible-subset order exactly as ProjectGrid's handleDragEnd would.
let capturedOnReorder: ((ids: string[]) => void) | undefined;
vi.mock("./components/ProjectGrid", () => ({
  ProjectGrid: (props: { onReorder?: (ids: string[]) => void }) => {
    capturedOnReorder = props.onReorder;
    return null;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnReorder = undefined;
  localStorage.clear();
  localStorage.setItem("showSidebar", "true");
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  class ObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
  window.IntersectionObserver = ObserverStub as unknown as typeof IntersectionObserver;
  Element.prototype.scrollIntoView = vi.fn();
});

describe("group reorder merge", () => {
  it("merges a group-subset reorder back into the full global order", async () => {
    const { findByText, getByText } = render(<App />);
    await findByText("CC-UI related", undefined, { timeout: 5000 });

    await act(async () => {
      const { fireEvent } = await import("@testing-library/react");
      fireEvent.click(getByText("CC-UI related"));
    });

    expect(typeof capturedOnReorder).toBe("function");

    // Visible group order was [a1, a2]; user drags to [a2, a1].
    await act(async () => {
      await capturedOnReorder! (["a2", "a1"]);
    });

    const reorderCall = invokeMock.mock.calls.find(([cmd]) => cmd === "reorder_projects");
    expect(reorderCall).toBeDefined();
    // Other-group projects keep their global slots; only g-cc slots change.
    expect((reorderCall as unknown[])[1]).toEqual({ orderedIds: ["a2", "b1", "a1", "b2"] });
  });
});

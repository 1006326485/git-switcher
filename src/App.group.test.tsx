import { render, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
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

const ccProjects = [
  detail("p1", "cc-ui", "g-cc"),
  detail("p2", "cc-be", "g-cc"),
  detail("p3", "mcd-ts-utils", "g-cc"),
];
const gcfProjects = [
  detail("p4", "gcf-player", "g-gcf"),
  detail("p5", "gcf-components", "g-gcf"),
  detail("p6", "gcf-cod", "g-gcf"),
];

const invokeMock = vi.fn((cmd: string, args?: Record<string, unknown>) => {
  const table: Record<string, unknown> = {
    get_settings: {
      theme: "light",
      auto_refresh: false,
      refresh_interval_secs: 30,
      view_mode: "card",
      llm: {
        enabled: false,
        api_key: "",
        endpoint: "",
        model: "",
        temperature: 0.3,
        max_tokens: 4096,
        key_in_keychain: false,
      },
      auto_fetch_on_launch: false,
      terminal_hotkey: "CmdOrCtrl+Shift+`",
      terminal_hide_on_blur: false,
    },
    get_background_status: { paused: true, interval_secs: 30, last_run_at: null },
    list_groups: groups,
    list_projects: [...gcfProjects, ...ccProjects],
    list_projects_in_group:
      args?.groupId === "g-cc" ? ccProjects : args?.groupId === "g-gcf" ? gcfProjects : [],
  };
  return Promise.resolve(table[cmd] ?? []);
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...(args as [string, Record<string, unknown>?])),
}));

beforeEach(() => {
  vi.clearAllMocks();
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

describe("group filtering", () => {
  it("shows group projects after clicking a group", async () => {
    const { findByText, queryByText, getByText } = render(<App />);

    await findByText("gcf-player", undefined, { timeout: 5000 });

    fireEvent.click(getByText("CC-UI related"));

    await findByText("cc-ui", undefined, { timeout: 5000 });
    expect(queryByText("gcf-player")).not.toBeInTheDocument();
    expect(
      invokeMock.mock.calls.some(([cmd]) => cmd === "list_projects_in_group")
    ).toBe(false);
  });
});

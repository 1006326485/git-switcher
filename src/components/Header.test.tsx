import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";
import * as api from "../lib/tauri";
import type { AppSettings } from "../lib/types";

type EventHandler = () => void;
const handlers = new Map<string, EventHandler>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, handler: EventHandler) => {
    handlers.set(event, handler);
    return Promise.resolve(() => {
      handlers.delete(event);
    });
  }),
}));

vi.mock("../lib/tauri", () => ({
  getSettings: vi.fn(),
  getUnreadCount: vi.fn(() => Promise.resolve(0)),
}));

// macOS platform, so CmdOrCtrl renders as ⌘. The default binding mirrors the
// registry default (shortcutRegistry -> CmdOrCtrl+`).
vi.mock("../lib/hotkey", () => ({
  detectMac: () => true,
  formatHotkey: (hotkey: string, isMac = true): string => {
    const symbols: Record<string, string> = isMac
      ? { cmdorctrl: "⌘", cmd: "⌘", alt: "⌥", shift: "⇧", ctrl: "⌃" }
      : { cmdorctrl: "Ctrl", cmd: "Win", alt: "Alt", shift: "Shift", ctrl: "Ctrl" };
    return hotkey
      .split("+")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => symbols[part.toLowerCase()] ?? part)
      .join(isMac ? "" : "+");
  },
}));

const DEFAULT_TERMINAL_HOTKEY = "CmdOrCtrl+`";
const MAC_DEFAULT_HINT = "Terminal (⌘`)";

const settings: AppSettings = {
  theme: "system",
  language: "system",
  auto_refresh: true,
  refresh_interval_secs: 30,
  view_mode: "card",
  llm: {
    enabled: false,
    api_key: "",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    review_prompt: "",
    temperature: 0.3,
    max_tokens: 4096,
    key_in_keychain: false,
  },
  auto_fetch_on_launch: true,
  terminal_hotkey: "CmdOrCtrl+Shift+`",
  terminal_hide_on_blur: false,
  in_app_toggle_terminal: DEFAULT_TERMINAL_HOTKEY,
  in_app_shortcuts_help: "CmdOrCtrl+/",
  tray: {
    git_actions: true,
    recent_projects: true,
    quick_launch: true,
    recent_limit: 5,
    pinned_commands: [],
    notifications: true,
  },
};

const noop = () => {};

function renderHeader() {
  return render(
    <Header
      projectCount={1}
      totalCount={1}
      theme="system"
      viewMode="card"
      searchQuery=""
      activeFilter="all"
      filterCounts={{ all: 1, changed: 0, behind: 0, ahead: 0, stale: 0 }}
      sortBy="custom"
      onSearchChange={noop}
      onFilterChange={noop}
      onThemeChange={noop}
      onViewModeChange={noop}
      onSortChange={noop}
      onAddProject={noop}
      onToggleSidebar={noop}
      onExportImport={noop}
      onBulkImport={noop}
      onSettings={noop}
      onTaskWorkspaces={noop}
      onToggleCommandPalette={noop}
      onToggleTerminal={noop}
      batchLoading={null}
      batchProgress={{} as never}
      onFetchAll={noop}
      onPullAll={noop}
      onPushAll={noop}
      onPullBehind={noop}
      onPushAhead={noop}
      onSyncAll={noop}
      onRunCommandAll={noop}
      behindCount={0}
      aheadCount={0}
      needsAttention={0}
      onAttentionClick={noop}
      onOpenShortcutsHelp={noop}
    />
  );
}

async function emitSettingsChanged() {
  await waitFor(() => expect(handlers.has("settings-changed")).toBe(true));
  await act(async () => {
    handlers.get("settings-changed")!();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  vi.mocked(api.getSettings).mockResolvedValue(settings);
});

describe("Header terminal hint", () => {
  it("shows the default chord before settings load", () => {
    vi.mocked(api.getSettings).mockReturnValue(new Promise(() => {}));
    renderHeader();
    const button = screen.getByRole("button", { name: MAC_DEFAULT_HINT });
    expect(button).toHaveAttribute("title", MAC_DEFAULT_HINT);
  });

  it("shows the stored binding from settings", async () => {
    vi.mocked(api.getSettings).mockResolvedValue({ ...settings, in_app_toggle_terminal: "Alt+T" });
    renderHeader();
    const button = await screen.findByRole("button", { name: "Terminal (⌥T)" });
    expect(button).toHaveAttribute("title", "Terminal (⌥T)");
  });

  it("falls back to the registry default when the field is missing", async () => {
    vi.mocked(api.getSettings).mockResolvedValue({ ...settings, in_app_toggle_terminal: undefined });
    renderHeader();
    expect(await screen.findByRole("button", { name: MAC_DEFAULT_HINT })).toBeInTheDocument();
  });

  it("updates the hint when the Shortcuts panel records a new chord", async () => {
    renderHeader();
    expect(await screen.findByRole("button", { name: MAC_DEFAULT_HINT })).toBeInTheDocument();

    vi.mocked(api.getSettings).mockResolvedValue({
      ...settings,
      in_app_toggle_terminal: "CmdOrCtrl+Shift+T",
    });
    await emitSettingsChanged();

    expect(await screen.findByRole("button", { name: "Terminal (⌘⇧T)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: MAC_DEFAULT_HINT })).not.toBeInTheDocument();
  });

  it("keeps the hint when an unrelated shortcut is re-recorded", async () => {
    vi.mocked(api.getSettings).mockResolvedValue({ ...settings, in_app_toggle_terminal: "Alt+T" });
    renderHeader();
    expect(await screen.findByRole("button", { name: "Terminal (⌥T)" })).toBeInTheDocument();

    vi.mocked(api.getSettings).mockResolvedValue({
      ...settings,
      in_app_toggle_terminal: undefined,
      in_app_shortcuts_help: "",
    });
    await emitSettingsChanged();

    expect(await screen.findByRole("button", { name: "Keyboard shortcuts (⌘/)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminal (⌘`)" })).toBeInTheDocument();
  });

  it("stops listening when unmounted", async () => {
    const { unmount } = renderHeader();
    await waitFor(() => expect(handlers.has("settings-changed")).toBe(true));
    unmount();
    await waitFor(() => expect(handlers.has("settings-changed")).toBe(false));
  });
});

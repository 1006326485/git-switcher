import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TraySettings } from "./TraySettings";
import * as api from "../lib/tauri";
import type { AppSettings } from "../lib/types";

vi.mock("../lib/tauri", () => ({
  getSettings: vi.fn(),
  updateSettingsPartial: vi.fn(),
  listRunPresets: vi.fn(),
  listCustomCommands: vi.fn(),
  rebuildTrayMenu: vi.fn(),
}));

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
    temperature: 0.3,
    max_tokens: 4096,
    key_in_keychain: false,
  },
  auto_fetch_on_launch: true,
  terminal_hotkey: "CmdOrCtrl+Shift+`",
  terminal_hide_on_blur: false,
  tray: {
    git_actions: true,
    recent_projects: true,
    quick_launch: true,
    recent_limit: 5,
    pinned_commands: ["preset:p1"],
    notifications: true,
  },
};

function mockApi() {
  vi.mocked(api.getSettings).mockResolvedValue(settings);
  vi.mocked(api.listRunPresets).mockResolvedValue([
    { id: "p1", name: "Dev Stack", items: [], sort_order: 0, created_at: "2026-01-01" },
  ]);
  vi.mocked(api.listCustomCommands).mockResolvedValue([
    {
      id: "c1",
      name: "Build",
      command: "yarn build",
      shortcut: null,
      project_path: null,
      sort_order: 0,
      created_at: "2026-01-01",
    },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TraySettings", () => {
  it("shows stored tray switches and pins", async () => {
    mockApi();
    render(<TraySettings onError={() => {}} />);

    expect(await screen.findByLabelText("Git shortcuts")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("System notifications")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Dev Stack")).toBeChecked();
    expect(screen.getByLabelText("Build")).not.toBeChecked();
    expect(screen.getByLabelText("Recent project count")).toHaveValue(5);
  });

  it("persists a switch toggle as a tray settings patch", async () => {
    mockApi();
    vi.mocked(api.updateSettingsPartial).mockResolvedValue(settings);
    render(<TraySettings onError={() => {}} />);

    fireEvent.click(await screen.findByLabelText("System notifications"));

    await waitFor(() =>
      expect(api.updateSettingsPartial).toHaveBeenCalledWith({
        tray: { ...settings.tray, notifications: false },
      })
    );
  });

  it("adds a newly pinned entry to the pin list", async () => {
    mockApi();
    vi.mocked(api.updateSettingsPartial).mockResolvedValue(settings);
    render(<TraySettings onError={() => {}} />);

    fireEvent.click(await screen.findByLabelText("Build"));

    await waitFor(() =>
      expect(api.updateSettingsPartial).toHaveBeenCalledWith({
        tray: { ...settings.tray, pinned_commands: ["preset:p1", "saved:c1"] },
      })
    );
  });
});

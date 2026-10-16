import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeneralSettings } from "./GeneralSettings";
import * as api from "../lib/tauri";
import { bindingToDisplayParts } from "../lib/hotkey";
import type { AppSettings } from "../lib/types";

vi.mock("../lib/tauri", () => ({
  getSettings: vi.fn(),
  updateSettingsPartial: vi.fn(),
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
    pinned_commands: [],
    notifications: true,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GeneralSettings terminal hotkey", () => {
  it("shows the stored hotkey as badges", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settings);
    render(<GeneralSettings onError={() => {}} />);

    for (const part of bindingToDisplayParts("CmdOrCtrl+Shift+`")) {
      expect(await screen.findByText(part)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Terminal hotkey" })).toBeInTheDocument();
  });

  it("records keys like the other shortcut editors and persists on save", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settings);
    vi.mocked(api.updateSettingsPartial).mockResolvedValue(settings);
    render(<GeneralSettings onError={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Terminal hotkey" }));
    const recorder = await screen.findByLabelText("Recording… press a key combination");
    fireEvent.keyDown(recorder, { key: " ", code: "Space", altKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.updateSettingsPartial).toHaveBeenCalledWith({ terminal_hotkey: "Alt+Space" })
    );
  });

  it("keeps working when the save is rejected", async () => {
    const onError = vi.fn();
    vi.mocked(api.getSettings).mockResolvedValue(settings);
    vi.mocked(api.updateSettingsPartial).mockRejectedValue(new Error("conflict"));
    render(<GeneralSettings onError={onError} />);

    fireEvent.click(await screen.findByRole("button", { name: "Terminal hotkey" }));
    const recorder = await screen.findByLabelText("Recording… press a key combination");
    fireEvent.keyDown(recorder, { key: " ", code: "Space", altKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
  });
});

describe("GeneralSettings theme switching", () => {
  it("applies the theme to the DOM immediately when a theme button is clicked", async () => {
    vi.mocked(api.getSettings).mockResolvedValue({ ...settings, theme: "light" });
    vi.mocked(api.updateSettingsPartial).mockResolvedValue({ ...settings, theme: "dark" });
    document.documentElement.classList.remove("dark");
    render(<GeneralSettings onError={() => {}} />);

    fireEvent.click(await screen.findByText("Dark"));

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    await waitFor(() =>
      expect(api.updateSettingsPartial).toHaveBeenCalledWith({ theme: "dark" })
    );
  });

  it("reserves space for the saved indicator so toggling it never shifts layout", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settings);
    vi.mocked(api.updateSettingsPartial).mockResolvedValue(settings);
    render(<GeneralSettings onError={() => {}} />);

    // The reserved row exists even before any save (no layout shift on appear).
    await screen.findByRole("button", { name: "Terminal hotkey" });
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeneralSettings } from "./GeneralSettings";
import * as api from "../lib/tauri";
import { formatHotkey } from "../lib/hotkey";
import type { AppSettings } from "../lib/types";

vi.mock("../lib/tauri", () => ({
  getSettings: vi.fn(),
  updateSettingsPartial: vi.fn(),
}));

const settings: AppSettings = {
  theme: "system",
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
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GeneralSettings terminal hotkey", () => {
  it("shows the stored hotkey", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settings);
    render(<GeneralSettings onError={() => {}} />);

    const input = await screen.findByLabelText("Terminal hotkey");
    expect(input).toHaveValue("CmdOrCtrl+Shift+`");
    expect(screen.getByText(formatHotkey("CmdOrCtrl+Shift+`"))).toBeInTheDocument();
  });

  it("persists a new hotkey on blur", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settings);
    vi.mocked(api.updateSettingsPartial).mockResolvedValue(settings);
    render(<GeneralSettings onError={() => {}} />);

    const input = await screen.findByLabelText("Terminal hotkey");
    fireEvent.change(input, { target: { value: "Alt+Space" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(api.updateSettingsPartial).toHaveBeenCalledWith({ terminal_hotkey: "Alt+Space" })
    );
  });

  it("reverts and reports when the shortcut is rejected", async () => {
    const onError = vi.fn();
    vi.mocked(api.getSettings).mockResolvedValue(settings);
    vi.mocked(api.updateSettingsPartial).mockRejectedValue(new Error("conflict"));
    render(<GeneralSettings onError={onError} />);

    const input = await screen.findByLabelText("Terminal hotkey");
    fireEvent.change(input, { target: { value: "Not+A+Shortcut" } });
    fireEvent.blur(input);

    await waitFor(() => expect(onError).toHaveBeenCalled());
    await waitFor(() => expect(input).toHaveValue("CmdOrCtrl+Shift+`"));
  });
});

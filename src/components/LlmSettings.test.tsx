import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmSettings } from "./LlmSettings";
import * as api from "../lib/tauri";
import type { AppSettings, LlmConfig } from "../lib/types";
import { LLM_DEFAULT_REVIEW_PROMPT, promptToStore } from "../lib/llm";

vi.mock("../lib/tauri", () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  listLlmModels: vi.fn(),
}));

const baseLlm: LlmConfig = {
  enabled: true,
  api_key: "sk-test",
  endpoint: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4o-mini",
  review_prompt: "",
  temperature: 0.3,
  max_tokens: 4096,
  key_in_keychain: false,
};

function settingsWith(llm: Partial<LlmConfig> = {}): AppSettings {
  return {
    theme: "system",
    language: "system",
    auto_refresh: true,
    refresh_interval_secs: 30,
    view_mode: "card",
    llm: { ...baseLlm, ...llm },
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
}

beforeEach(() => {
  vi.clearAllMocks();
  class ObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
});

const promptBox = () => screen.getByRole("textbox", { name: "Review prompt" }) as HTMLTextAreaElement;
const modelField = () => screen.getByRole("textbox", { name: "Model" }) as HTMLInputElement;

describe("LlmSettings review prompt", () => {
  it("shows the built-in prompt for a stored default and marks it as default", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settingsWith({ review_prompt: "" }));
    render(<LlmSettings onError={() => {}} />);

    await waitFor(() => expect(promptBox().value).toBe(LLM_DEFAULT_REVIEW_PROMPT));
    expect(screen.getByText("Default")).toBeInTheDocument();
    // Nothing to reset while it is already the default.
    expect(screen.getByRole("button", { name: "Reset to default" })).toBeDisabled();
  });

  it("shows a saved custom prompt verbatim and marks it as customized", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(
      settingsWith({ review_prompt: "Only report security issues." })
    );
    render(<LlmSettings onError={() => {}} />);

    await waitFor(() => expect(promptBox().value).toBe("Only report security issues."));
    expect(screen.getByText("Customized")).toBeInTheDocument();
  });

  it("persists an edited prompt", async () => {
    const settings = settingsWith();
    vi.mocked(api.getSettings).mockResolvedValue(settings);
    vi.mocked(api.updateSettings).mockImplementation(async (next) => next);
    render(<LlmSettings onError={() => {}} />);

    await waitFor(() => expect(promptBox().value).toBe(LLM_DEFAULT_REVIEW_PROMPT));
    fireEvent.change(promptBox(), { target: { value: "Review for concurrency bugs only." } });
    fireEvent.click(screen.getByRole("button", { name: "Save LLM Settings" }));

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    const saved = vi.mocked(api.updateSettings).mock.calls[0][0];
    expect(saved.llm.review_prompt).toBe("Review for concurrency bugs only.");
    // The rest of the config is carried over untouched.
    expect(saved.llm.endpoint).toBe(baseLlm.endpoint);
    expect(saved.llm.model).toBe("gpt-4o-mini");
  });

  it("resets to the built-in prompt, and saving an unedited default stores the empty marker", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(
      settingsWith({ review_prompt: "Only report security issues." })
    );
    vi.mocked(api.updateSettings).mockImplementation(async (next) => next);
    render(<LlmSettings onError={() => {}} />);

    await waitFor(() => expect(promptBox().value).toBe("Only report security issues."));
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(promptBox().value).toBe(LLM_DEFAULT_REVIEW_PROMPT);

    fireEvent.click(screen.getByRole("button", { name: "Save LLM Settings" }));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    // Empty = "use the built-in prompt", so it keeps tracking the default.
    expect(vi.mocked(api.updateSettings).mock.calls[0][0].llm.review_prompt).toBe("");
    expect(promptToStore(LLM_DEFAULT_REVIEW_PROMPT)).toBe("");
  });

  it("edits the same prompt from the expanded editor", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settingsWith());
    render(<LlmSettings onError={() => {}} />);

    await waitFor(() => expect(promptBox().value).toBe(LLM_DEFAULT_REVIEW_PROMPT));
    fireEvent.click(screen.getByRole("button", { name: "Edit full prompt" }));
    const editor = (await screen.findByRole("textbox", {
      name: "Review prompt editor",
    })) as HTMLTextAreaElement;
    expect(editor.value).toBe(LLM_DEFAULT_REVIEW_PROMPT);

    fireEvent.change(editor, { target: { value: "Expanded edit" } });
    expect(promptBox().value).toBe("Expanded edit");
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Review prompt editor" })).not.toBeInTheDocument()
    );
    expect(promptBox().value).toBe("Expanded edit");
  });

  it("treats a settings file without the prompt field as the default prompt", async () => {
    const legacy = settingsWith();
    delete (legacy.llm as Partial<LlmConfig>).review_prompt;
    vi.mocked(api.getSettings).mockResolvedValue(legacy);
    render(<LlmSettings onError={() => {}} />);

    await waitFor(() => expect(promptBox().value).toBe(LLM_DEFAULT_REVIEW_PROMPT));
    expect(screen.getByText("Default")).toBeInTheDocument();
  });
});

describe("LlmSettings model selector", () => {
  it("fetches the model list for the endpoint in the form and selects one", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settingsWith());
    vi.mocked(api.listLlmModels).mockResolvedValue(["gpt-4o", "gpt-4o-mini", "o3-mini"]);
    render(<LlmSettings onError={() => {}} />);

    await waitFor(() => expect(modelField().value).toBe("gpt-4o-mini"));
    fireEvent.click(screen.getByRole("button", { name: "Fetch models" }));

    await waitFor(() =>
      expect(api.listLlmModels).toHaveBeenCalledWith(baseLlm.endpoint, "sk-test")
    );
    expect(await screen.findByText("3 models available")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Model list" }));
    await screen.findByRole("listbox");
    fireEvent.click(screen.getByRole("option", { name: /o3-mini/ }));
    expect(modelField().value).toBe("o3-mini");
  });

  it("fetches for an edited endpoint before it is saved", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settingsWith());
    vi.mocked(api.listLlmModels).mockResolvedValue(["llama3"]);
    render(<LlmSettings onError={() => {}} />);

    const endpoint = await screen.findByRole("textbox", { name: "API Endpoint" });
    fireEvent.change(endpoint, { target: { value: "http://localhost:11434/v1" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch models" }));

    await waitFor(() =>
      expect(api.listLlmModels).toHaveBeenCalledWith("http://localhost:11434/v1", "sk-test")
    );
  });

  it("shows a fetch failure and keeps manual entry working", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settingsWith());
    vi.mocked(api.listLlmModels).mockRejectedValue("LLM model list error (401): bad key");
    render(<LlmSettings onError={() => {}} />);

    await waitFor(() => expect(modelField().value).toBe("gpt-4o-mini"));
    fireEvent.click(screen.getByRole("button", { name: "Fetch models" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load the model list");
    expect(alert).toHaveTextContent("401");

    // The selector is only usable with a fetched list; typing still works.
    expect(screen.getByRole("button", { name: "Model list" })).toBeDisabled();
    fireEvent.change(modelField(), { target: { value: "my-deployment" } });
    expect(modelField().value).toBe("my-deployment");
  });

  it("drops a fetched list when the endpoint is edited so stale models are not offered", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settingsWith());
    vi.mocked(api.listLlmModels).mockResolvedValue(["gpt-4o", "gpt-4o-mini"]);
    render(<LlmSettings onError={() => {}} />);

    await waitFor(() => expect(modelField().value).toBe("gpt-4o-mini"));
    fireEvent.click(screen.getByRole("button", { name: "Fetch models" }));
    expect(await screen.findByText("2 models available")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "API Endpoint" }), {
      target: { value: "https://api.deepseek.com/v1" },
    });
    await waitFor(() => expect(screen.queryByText("2 models available")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Model list" })).toBeDisabled();
  });

  it("shows the URL the list is read from", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settingsWith());
    render(<LlmSettings onError={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText(/Models are read from/)).toHaveTextContent(
        "https://api.openai.com/v1/models"
      )
    );
  });
});

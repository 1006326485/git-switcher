import { describe, expect, it } from "vitest";
import {
  LLM_DEFAULT_REVIEW_PROMPT,
  LLM_PROMPT_DIFF_PLACEHOLDER,
  isDefaultPrompt,
  modelsUrlFor,
  promptEditorValue,
  promptToStore,
} from "./llm";

describe("review prompt", () => {
  // The Rust service owns the prompt it actually sends; the settings editor
  // pre-fills the same text (scripts/check-llm-prompt.mjs pins the two copies
  // together). The diff is appended by the service, never baked in here.
  it("keeps the diff placeholder out of the editable default", () => {
    expect(LLM_DEFAULT_REVIEW_PROMPT).not.toContain(LLM_PROMPT_DIFF_PLACEHOLDER);
    expect(LLM_DEFAULT_REVIEW_PROMPT).toContain("\n## Findings\n");
  });

  it("shows the built-in prompt for the empty marker", () => {
    expect(promptEditorValue("")).toBe(LLM_DEFAULT_REVIEW_PROMPT);
    expect(promptEditorValue("   \n ")).toBe(LLM_DEFAULT_REVIEW_PROMPT);
  });

  it("shows a custom prompt verbatim", () => {
    expect(promptEditorValue("Only security issues.")).toBe("Only security issues.");
  });

  it("stores an unedited built-in prompt as the empty marker", () => {
    expect(promptToStore(LLM_DEFAULT_REVIEW_PROMPT)).toBe("");
    expect(promptToStore(`  ${LLM_DEFAULT_REVIEW_PROMPT}\n`)).toBe("");
    expect(isDefaultPrompt(LLM_DEFAULT_REVIEW_PROMPT)).toBe(true);
  });

  it("stores an edited prompt verbatim", () => {
    const edited = `${LLM_DEFAULT_REVIEW_PROMPT}\n- Also check accessibility`;
    expect(promptToStore(edited)).toBe(edited);
    expect(isDefaultPrompt(edited)).toBe(false);
  });

  it("round-trips through the stored form", () => {
    for (const stored of ["", "Custom prompt."]) {
      expect(promptToStore(promptEditorValue(stored))).toBe(stored);
    }
  });
});

describe("modelsUrlFor", () => {
  it("derives the models URL from a chat endpoint", () => {
    expect(modelsUrlFor("https://api.openai.com/v1/chat/completions")).toBe(
      "https://api.openai.com/v1/models"
    );
    expect(modelsUrlFor("https://api.openai.com/v1/completions")).toBe(
      "https://api.openai.com/v1/models"
    );
    expect(modelsUrlFor(" https://api.deepseek.com/v1/ ")).toBe("https://api.deepseek.com/v1/models");
    expect(modelsUrlFor("http://localhost:8080/v1/models")).toBe("http://localhost:8080/v1/models");
  });
});

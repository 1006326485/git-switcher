/**
 * LLM review prompt helpers.
 *
 * The prompt sent to the model is exactly
 * `LLM_DEFAULT_REVIEW_PROMPT` (or the user's prompt) followed by the diff.
 * The settings editor pre-fills this text so the user edits the real prompt
 * rather than an empty box, and "reset to default" clears the stored copy
 * back to the empty marker ("use the built-in prompt").
 *
 * The Rust side owns the prompt actually sent (`LlmService::DEFAULT_REVIEW_PROMPT`);
 * this copy is the editable starting point in the UI. Keep the two in sync —
 * a unit test compares them so drift cannot go unnoticed.
 */
export const LLM_DEFAULT_REVIEW_PROMPT = `You are an expert code reviewer. Analyze the following git diff and provide a code review in clean, readable Markdown.

## Output Format

Respond in this EXACT Markdown structure:

\`\`\`markdown
## Summary

One paragraph overall assessment of this diff.

## Findings

### 🔴 [Critical] Title of finding
- **File:** \`path/to/file.ext\` (line 42)
- **Category:** Security
- **Description:** Detailed explanation of the issue.
- **Suggestion:** How to fix it.

### 🟡 [Warning] Title of finding
- **File:** \`path/to/file.ext\`
- **Category:** Performance
- **Description:** Explanation.
- **Suggestion:** Fix approach.

### ℹ️ [Info] Title
...

### 💡 [Suggestion] Title
...
\`\`\`

## Guidelines

- Use severity levels: 🔴 Critical, 🟡 Warning, ℹ️ Info, 💡 Suggestion
- Categories: Bug, Security, Performance, Code Quality, Best Practice
- Always include File and Description for each finding
- Suggestion is optional but recommended
- If the code looks good, still provide the Summary section and note that no issues were found
- Only include findings actually present in the diff
- Keep descriptions concise and actionable`;

/** Placeholder that marks where the diff is inserted. */
export const LLM_PROMPT_DIFF_PLACEHOLDER = "{{diff}}";

/**
 * The text the editor shows for a stored prompt: the built-in prompt when the
 * stored value is the empty "use the default" marker.
 */
export function promptEditorValue(stored: string): string {
  return stored.trim() === "" ? LLM_DEFAULT_REVIEW_PROMPT : stored;
}

/**
 * The value to persist for what the editor currently holds.
 *
 * An unedited copy of the built-in prompt is stored as the empty marker so it
 * keeps tracking future improvements to the default; anything the user
 * changed is stored verbatim.
 */
export function promptToStore(editorValue: string): string {
  return editorValue.trim() === LLM_DEFAULT_REVIEW_PROMPT.trim() ? "" : editorValue;
}

/** True when the editor holds the built-in prompt, i.e. nothing custom. */
export function isDefaultPrompt(editorValue: string): boolean {
  return editorValue.trim() === LLM_DEFAULT_REVIEW_PROMPT.trim();
}

/**
 * Derives the models-list URL from a chat endpoint, with the same rules as
 * `LlmService::build_models_url`:
 * `/v1/chat/completions` → `/v1/models`, a base URL `/v1` → `/v1/models`,
 * and an existing `/models` URL is kept.
 */
export function modelsUrlFor(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/models")) return trimmed;
  let base = trimmed;
  for (const suffix of ["/chat/completions", "/completions"]) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }
  return `${base.replace(/\/+$/, "")}/models`;
}

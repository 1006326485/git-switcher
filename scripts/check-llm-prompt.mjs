import { readFileSync } from "node:fs";

// The review prompt exists twice: the Rust service owns the text it sends
// (LlmService::DEFAULT_REVIEW_PROMPT) and the settings editor pre-fills that
// same text (src/lib/llm.ts), because Rust cannot import a TypeScript
// constant. This keeps the copies identical, so "reset to default" shows
// exactly what "no custom prompt" sends. When the default changes on purpose,
// update both and rerun — the check only reports drift, it never rewrites.
const RUST_SOURCE = "src-tauri/src/services/llm_service.rs";
const TS_SOURCE = "src/lib/llm.ts";
const DECLARATION = 'pub const DEFAULT_REVIEW_PROMPT: &\'static str = r#"';

function fail(message) {
  console.error(`llm prompt check failed: ${message}`);
  process.exit(1);
}

const rust = readFileSync(RUST_SOURCE, "utf8");
const start = rust.indexOf(DECLARATION);
if (start < 0) fail(`${RUST_SOURCE}: DEFAULT_REVIEW_PROMPT declaration not found`);
const bodyStart = start + DECLARATION.length;
const end = rust.indexOf('"#;', bodyStart);
if (end < 0) fail(`${RUST_SOURCE}: DEFAULT_REVIEW_PROMPT terminator not found`);
const rustPrompt = rust.slice(bodyStart, end);

const ts = readFileSync(TS_SOURCE, "utf8");
const tsStart = ts.indexOf("export const LLM_DEFAULT_REVIEW_PROMPT = `");
if (tsStart < 0) fail(`${TS_SOURCE}: LLM_DEFAULT_REVIEW_PROMPT declaration not found`);
const tsBodyStart = tsStart + "export const LLM_DEFAULT_REVIEW_PROMPT = `".length;
// Walk the template literal so escaped backticks (\`) do not end it early.
let tsBodyEnd = -1;
for (let i = tsBodyStart; i < ts.length; i += 1) {
  if (ts[i] === "\\") {
    i += 1;
    continue;
  }
  if (ts[i] === "`") {
    tsBodyEnd = i;
    break;
  }
}
if (tsBodyEnd < 0) fail(`${TS_SOURCE}: unterminated LLM_DEFAULT_REVIEW_PROMPT`);
const tsPrompt = ts
  .slice(tsBodyStart, tsBodyEnd)
  .replace(/\\`/g, "`")
  .replace(/\\\$/g, "$")
  .replace(/\\\\/g, "\\");

if (rustPrompt !== tsPrompt) {
  const rustLines = rustPrompt.split("\n");
  const tsLines = tsPrompt.split("\n");
  const at = rustLines.findIndex((line, i) => line !== tsLines[i]);
  fail(
    `the default review prompt differs between ${RUST_SOURCE} and ${TS_SOURCE} ` +
      `(first difference at line ${at + 1}). Update both copies.`
  );
}

console.log(`llm prompt check passed: ${rustPrompt.split("\n").length} lines in sync`);

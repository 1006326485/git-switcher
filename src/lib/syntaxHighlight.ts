/**
 * Lightweight regex-based syntax highlighting for diff viewer.
 * No external dependencies — escapes HTML first, then wraps tokens in <span>.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const KEYWORDS: Record<string, string[]> = {
  js: [
    "break", "case", "catch", "const", "continue", "debugger", "default", "delete",
    "do", "else", "export", "extends", "finally", "for", "function", "if", "import",
    "in", "instanceof", "let", "new", "of", "return", "static", "super", "switch",
    "this", "throw", "try", "typeof", "var", "void", "while", "with", "yield", "async",
    "await", "class", "from", "as", "true", "false", "null", "undefined",
  ],
  ts: [
    "break", "case", "catch", "const", "continue", "debugger", "default", "delete",
    "do", "else", "export", "extends", "finally", "for", "function", "if", "import",
    "in", "instanceof", "let", "new", "of", "return", "static", "super", "switch",
    "this", "throw", "try", "typeof", "var", "void", "while", "with", "yield", "async",
    "await", "class", "from", "as", "type", "interface", "enum", "implements", "declare",
    "abstract", "readonly", "namespace", "module", "true", "false", "null", "undefined",
  ],
  rust: [
    "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else", "enum",
    "extern", "false", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod",
    "move", "mut", "pub", "ref", "return", "self", "Self", "static", "struct", "super",
    "trait", "true", "type", "unsafe", "use", "where", "while", "super", "macro_rules",
  ],
  python: [
    "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
    "elif", "else", "except", "False", "finally", "for", "from", "global", "if", "import",
    "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass", "raise", "return",
    "True", "try", "while", "with", "yield",
  ],
  go: [
    "break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough",
    "for", "func", "go", "goto", "if", "import", "interface", "map", "package", "range",
    "return", "select", "struct", "switch", "type", "var", "true", "false", "nil",
  ],
  java: [
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class",
    "const", "continue", "default", "do", "double", "else", "enum", "extends", "final",
    "finally", "float", "for", "goto", "if", "implements", "import", "instanceof", "int",
    "interface", "long", "native", "new", "package", "private", "protected", "public",
    "return", "short", "static", "strictfp", "super", "switch", "synchronized", "this",
    "throw", "throws", "transient", "try", "void", "volatile", "while", "true", "false", "null",
  ],
};

// Pre-build keyword regex per language (joined with |)
const keywordPatterns: Partial<Record<string, RegExp>> = {};
for (const [lang, kws] of Object.entries(KEYWORDS)) {
  keywordPatterns[lang] = new RegExp("\\b(" + kws.join("|") + ")\\b", "g");
}

// Language-specific syntax patterns
const patterns: Record<string, { comment: RegExp; string: RegExp; number: RegExp; keyword?: RegExp }> = {
  js: {
    comment: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
    string: /(`[\s\S]*?`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
    number: /\b(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+\.?\d*(?:e[+-]?\d+)?|NaN|Infinity)\b/g,
    keyword: keywordPatterns.js,
  },
  ts: {
    comment: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
    string: /(`[\s\S]*?`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
    number: /\b(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+\.?\d*(?:e[+-]?\d+)?|NaN|Infinity)\b/g,
    keyword: keywordPatterns.ts,
  },
  rust: {
    comment: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
    string: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|r#*"[\s\S]*?"#*)/g,
    number: /\b(0x[0-9a-fA-F_]+|0b[01_]+|0o[0-7_]+|\d[\d_]*\.?[\d_]*(?:e[+-]?[\d_]+)?|[\d_]+(?:\.\d[\d_]*)?(?:e[+-]?[\d_]+)?(?:f32|f64|i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize)?)\b/g,
    keyword: keywordPatterns.rust,
  },
  python: {
    comment: /(#.*$)/gm,
    string: /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|f"(?:[^"\\]|\\.)*"|f'(?:[^'\\]|\\.)*')/g,
    number: /\b(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+\.?\d*(?:e[+-]?\d+)?j?)\b/g,
    keyword: keywordPatterns.python,
  },
  go: {
    comment: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
    string: /(`[\s\S]*?`|"(?:[^"\\]|\\.)*")/g,
    number: /\b(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+\.?\d*(?:e[+-]?\d+)?i?)\b/g,
    keyword: keywordPatterns.go,
  },
  java: {
    comment: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
    string: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
    number: /\b(0x[0-9a-fA-F]+[lL]?|0b[01]+[lL]?|0[0-7]+[lL]?|\d+\.?\d*(?:e[+-]?\d+)?[fFdDlL]?)\b/g,
    keyword: keywordPatterns.java,
  },
  html: {
    comment: /(<!--[\s\S]*?-->)/g,
    string: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
    number: /\b(\d+\.?\d*)\b/g,
  },
  css: {
    comment: /(\/\*[\s\S]*?\*\/)/g,
    string: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
    number: /\b(\d+\.?\d*(?:px|em|rem|%|vh|vw|vmin|vmax|deg|rad|s|ms|ch|ex|fr)?)\b/g,
  },
  json: {
    comment: /(^\s*$)/gm, // JSON has no comments
    string: /("(?:[^"\\]|\\.)*")/g,
    number: /\b(-?\d+\.?\d*(?:e[+-]?\d+)?)\b/g,
  },
  markdown: {
    comment: /(<!--[\s\S]*?-->)/g,
    string: /(```[\s\S]*?```|`[^`]+`)/g,
    number: /\b(\d+\.?\d*)\b/g,
  },
  shell: {
    comment: /(#.*$)/gm,
    string: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
    number: /\b(\d+\.?\d*)\b/g,
  },
};

/** Detect language from file path */
export function getLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "js";
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return "ts";
    case "rs":
      return "rust";
    case "py":
    case "pyi":
    case "pyw":
      return "python";
    case "go":
      return "go";
    case "java":
    case "kt":
    case "kts":
      return "java";
    case "html":
    case "htm":
    case "xml":
    case "svg":
    case "vue":
    case "svelte":
      return "html";
    case "css":
    case "scss":
    case "sass":
    case "less":
      return "css";
    case "json":
    case "jsonc":
      return "json";
    case "md":
    case "mdx":
      return "markdown";
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
    case "yml":
    case "yaml":
    case "toml":
    case "ini":
    case "conf":
      return "shell";
    default:
      return "";
  }
}

/** Get a human-readable label for the language badge */
export function getLanguageLabel(language: string): string {
  const labels: Record<string, string> = {
    js: "JavaScript",
    ts: "TypeScript",
    rust: "Rust",
    python: "Python",
    go: "Go",
    java: "Java",
    html: "HTML",
    css: "CSS",
    json: "JSON",
    markdown: "Markdown",
    shell: "Shell",
  };
  return labels[language] ?? "";
}

/**
 * Apply syntax highlighting to a single line.
 * Input is raw code (may include diff +/- prefix).
 * Returns an HTML string with <span> tags.
 */
export function highlightLine(line: string, language: string): string {
  const p = language ? patterns[language] : undefined;
  if (!p) return escapeHtml(line);

  let result = escapeHtml(line);
  result = result.replace(p.comment, '<span class="syn-comment">$1</span>');
  result = result.replace(p.string, '<span class="syn-string">$1</span>');
  result = result.replace(p.number, '<span class="syn-number">$1</span>');
  if (p.keyword) {
    result = result.replace(p.keyword, '<span class="syn-keyword">$1</span>');
  }
  return result;
}

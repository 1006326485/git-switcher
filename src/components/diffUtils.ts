export interface DiffLine {
  type: "add" | "del" | "context" | "header";
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface DiffSummary {
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
}

export function computeDiffStats(files: { additions: number; deletions: number }[]): DiffSummary {
  let totalAdditions = 0;
  let totalDeletions = 0;
  for (const f of files) {
    totalAdditions += f.additions;
    totalDeletions += f.deletions;
  }
  return { totalFiles: files.length, totalAdditions, totalDeletions };
}

export interface DiffHunkPair {
  old: { line: number | null; content: string }[];
  new: { line: number | null; content: string }[];
}

export interface WordDiff {
  type: "same" | "added" | "removed";
  text: string;
}

/**
 * Compute word-level diff between two strings using LCS.
 * Splits on whitespace boundaries, preserving trailing spaces in tokens.
 */
export function computeWordDiff(oldLine: string, newLine: string): WordDiff[] {
  // Split into word tokens (preserving spaces as separate tokens)
  const tokenize = (s: string): string[] => {
    const tokens: string[] = [];
    let i = 0;
    while (i < s.length) {
      if (s[i] === " " || s[i] === "\t") {
        let j = i;
        while (j < s.length && (s[j] === " " || s[j] === "\t")) j++;
        tokens.push(s.slice(i, j));
        i = j;
      } else {
        let j = i;
        while (j < s.length && s[j] !== " " && s[j] !== "\t") j++;
        tokens.push(s.slice(i, j));
        i = j;
      }
    }
    return tokens;
  };

  const a = tokenize(oldLine);
  const b = tokenize(newLine);
  const m = a.length;
  const n = b.length;

  // LCS DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to build diff segments
  const segments: WordDiff[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      segments.push({ type: "same", text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      segments.push({ type: "added", text: b[j - 1] });
      j--;
    } else {
      segments.push({ type: "removed", text: a[i - 1] });
      i--;
    }
  }

  return segments.reverse();
}

export interface CollapsedDiff {
  type: "visible" | "collapsed";
  lines: DiffLine[];
  hiddenCount: number;
}

/**
 * Collapse large blocks of unchanged (context) lines.
 * Shows `contextLines` before and after each change block;
 * middle portions of long context runs become a single "collapsed" entry.
 */
export function collapseUnchangedLines(lines: DiffLine[], contextLines = 2): CollapsedDiff[] {
  const result: CollapsedDiff[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type !== "context") {
      // Non-context line — emit as-is, grouped with adjacent non-context lines
      const start = i;
      while (i < lines.length && lines[i].type !== "context") i++;
      result.push({ type: "visible", lines: lines.slice(start, i), hiddenCount: 0 });
      continue;
    }
    // Context block
    const start = i;
    while (i < lines.length && lines[i].type === "context") i++;
    const ctx = lines.slice(start, i);
    if (ctx.length <= contextLines * 2 + 1) {
      result.push({ type: "visible", lines: ctx, hiddenCount: 0 });
    } else {
      // Leading context
      result.push({ type: "visible", lines: ctx.slice(0, contextLines), hiddenCount: 0 });
      // Collapsed middle
      const hidden = ctx.slice(contextLines, ctx.length - contextLines);
      result.push({ type: "collapsed", lines: hidden, hiddenCount: hidden.length });
      // Trailing context
      result.push({ type: "visible", lines: ctx.slice(ctx.length - contextLines), hiddenCount: 0 });
    }
  }
  return result;
}

/** Flatten a CollapsedDiff array back to DiffLine[] (all expanded). */
export function flattenCollapsed(items: CollapsedDiff[]): DiffLine[] {
  return items.flatMap((item) => item.lines);
}

export function parseDiff(raw: string): DiffLine[] {
  const lines = raw.split("\n");
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({ type: "header", content: line, oldLine: null, newLine: null });
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      result.push({ type: "add", content: line, oldLine: null, newLine });
      newLine++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      result.push({ type: "del", content: line, oldLine, newLine: null });
      oldLine++;
    } else if (line.startsWith("diff") || line.startsWith("index") || line.startsWith("---") || line.startsWith("+++")) {
      result.push({ type: "header", content: line, oldLine: null, newLine: null });
    } else {
      result.push({ type: "context", content: line, oldLine, newLine });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

/**
 * Parse unified diff into side-by-side hunk pairs.
 * All headers (diff/index/---/+++/@@) are stored as context pairs with null line numbers.
 * Each hunk pair has equal-length old/new arrays for aligned rendering.
 */
export function parseDiffSideBySide(raw: string): DiffHunkPair[] {
  const lines = raw.split("\n");
  const result: DiffHunkPair[] = [];
  let oldLine = 0;
  let newLine = 0;
  let hunkOld: DiffHunkPair["old"] = [];
  let hunkNew: DiffHunkPair["new"] = [];

  const flushHunk = () => {
    if (hunkOld.length > 0 || hunkNew.length > 0) {
      result.push({ old: hunkOld, new: hunkNew });
      hunkOld = [];
      hunkNew = [];
    }
  };

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      flushHunk();
      hunkOld.push({ line: null, content: line });
      hunkNew.push({ line: null, content: line });
    } else if (line.startsWith("diff") || line.startsWith("index") || line.startsWith("---") || line.startsWith("+++")) {
      flushHunk();
      hunkOld.push({ line: null, content: line });
      hunkNew.push({ line: null, content: line });
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      hunkOld.push({ line: null, content: "" });
      hunkNew.push({ line: newLine, content: line });
      newLine++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      hunkOld.push({ line: oldLine, content: line });
      hunkNew.push({ line: null, content: "" });
      oldLine++;
    } else {
      hunkOld.push({ line: oldLine, content: line });
      hunkNew.push({ line: newLine, content: line });
      oldLine++;
      newLine++;
    }
  }

  flushHunk();
  return result;
}

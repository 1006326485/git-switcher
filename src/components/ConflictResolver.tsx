import { useState, useEffect, useCallback, memo } from "react";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import * as api from "../lib/tauri";
import { parseError } from "../lib/types";

// ── Conflict marker parsing ─────────────────────────────────────────────────
// The working-tree file of a conflicted path carries git's conflict markers
// (<<<<<<< ours / ======= / >>>>>>> theirs, optionally with a ||||||| base
// block in diff3 style). We split the file into plain text and conflict
// sections so each hunk can be resolved as ours / theirs / both.

export type ConflictChoice = "ours" | "theirs" | "both";

export interface ConflictSection {
  kind: "text" | "conflict";
  /** Plain text lines (kind === "text"). */
  lines: string[];
  /** Ours block (kind === "conflict"). */
  ours: string[];
  /** diff3 base block, empty when the file uses default merge style. */
  base: string[];
  /** Theirs block (kind === "conflict"). */
  theirs: string[];
}

const MARKER_OURS = "<<<<<<<";
const MARKER_BASE = "|||||||";
const MARKER_SPLIT = "=======";
const MARKER_THEIRS = ">>>>>>>";

/** Split file content into plain text and conflict-marker sections. */
export function parseConflictSections(content: string): ConflictSection[] {
  const sections: ConflictSection[] = [];
  let text: string[] = [];
  let ours: string[] = [];
  let base: string[] = [];
  let theirs: string[] = [];
  let inConflict = false;
  let inBase = false;
  let inTheirs = false;

  const flushText = () => {
    if (text.length > 0) {
      sections.push({ kind: "text", lines: text, ours: [], base: [], theirs: [] });
      text = [];
    }
  };
  const flushConflict = () => {
    sections.push({ kind: "conflict", lines: [], ours, base, theirs });
    ours = [];
    base = [];
    theirs = [];
    inConflict = false;
    inBase = false;
    inTheirs = false;
  };

  for (const line of content.split("\n")) {
    if (!inConflict) {
      if (line.startsWith(MARKER_OURS)) {
        flushText();
        inConflict = true;
      } else {
        text.push(line);
      }
    } else if (!inTheirs && !inBase && line.startsWith(MARKER_BASE)) {
      inBase = true;
    } else if (!inTheirs && line.startsWith(MARKER_SPLIT)) {
      inTheirs = true;
      inBase = false;
    } else if (line.startsWith(MARKER_THEIRS)) {
      flushConflict();
    } else if (inTheirs) {
      theirs.push(line);
    } else if (inBase) {
      base.push(line);
    } else {
      ours.push(line);
    }
  }
  if (inConflict) flushConflict();
  else flushText();
  return sections;
}

/** Materialize sections back into file content using one choice per hunk. */
export function resolveConflictSections(
  sections: ConflictSection[],
  choices: ConflictChoice[]
): string {
  const out: string[] = [];
  let conflictIdx = 0;
  for (const section of sections) {
    if (section.kind === "text") {
      out.push(...section.lines);
    } else {
      const choice = choices[conflictIdx] ?? "both";
      if (choice === "ours" || choice === "both") out.push(...section.ours);
      if (choice === "theirs" || choice === "both") out.push(...section.theirs);
      conflictIdx++;
    }
  }
  return out.join("\n");
}

export function countConflicts(sections: ConflictSection[]): number {
  return sections.filter((s) => s.kind === "conflict").length;
}

// ── Component ──────────────────────────────────────────────────────────────

interface ConflictResolverProps {
  path: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onRefresh: () => void;
}

function joinRepoPath(path: string, filePath: string): string {
  return `${path.replace(/\/+$/, "")}/${filePath}`;
}

export const ConflictResolver = memo(function ConflictResolver({
  path,
  onSuccess,
  onError,
  onRefresh,
}: ConflictResolverProps) {
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  // Per-file hunk state: parsed sections + one choice per conflict hunk.
  const [preview, setPreview] = useState<{
    file: string;
    sections: ConflictSection[];
    choices: ConflictChoice[];
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadConflicts = useCallback(async () => {
    try {
      const files = await api.gitListConflicts(path);
      setConflicts(files);
    } catch { /* ignore */ }
  }, [path]);

  useEffect(() => { loadConflicts(); }, [loadConflicts]);

  // Whole-file resolution through the backend (checkout --ours/--theirs + add).
  const handleResolve = useCallback(async (filePath: string, resolution: string) => {
    setResolving(filePath);
    try {
      await api.gitResolveConflict(path, filePath, resolution);
      setConflicts((prev) => prev.filter((f) => f !== filePath));
      if (preview?.file === filePath) setPreview(null);
      onSuccess(`Resolved ${filePath} (${resolution})`);
      onRefresh();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setResolving(null);
    }
  }, [path, onSuccess, onError, onRefresh, preview]);

  // Load the conflicted file and show its marker hunks for per-hunk choice.
  const handleTogglePreview = useCallback(async (filePath: string) => {
    if (preview?.file === filePath) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const content = await api.readTextFile(joinRepoPath(path, filePath));
      const sections = parseConflictSections(content);
      setPreview({ file: filePath, sections, choices: sections.map(() => "both") });
    } catch (e) {
      onError(parseError(e));
    } finally {
      setPreviewLoading(false);
    }
  }, [path, preview, onError]);

  const handleChoice = useCallback((idx: number, choice: ConflictChoice) => {
    setPreview((prev) =>
      prev ? { ...prev, choices: prev.choices.map((c, i) => (i === idx ? choice : c)) } : prev
    );
  }, []);

  // Write the resolved content back to the working tree and stage it.
  const handleApply = useCallback(async () => {
    if (!preview) return;
    setResolving(preview.file);
    try {
      const content = resolveConflictSections(preview.sections, preview.choices);
      await writeTextFile(joinRepoPath(path, preview.file), content);
      await api.gitStageFile(path, preview.file);
      setConflicts((prev) => prev.filter((f) => f !== preview.file));
      onSuccess(`Resolved ${preview.file} (hunks applied)`);
      setPreview(null);
      onRefresh();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setResolving(null);
    }
  }, [preview, path, onSuccess, onError, onRefresh]);

  const handleAbort = useCallback(async () => {
    setLoading(true);
    try {
      await api.gitAbortMerge(path);
      setConflicts([]);
      setPreview(null);
      onSuccess("Merge aborted");
      onRefresh();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, onSuccess, onError, onRefresh]);

  if (conflicts.length === 0) return null;

  return (
    <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800/30 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-red-700 dark:text-red-300">
          ⚠ {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""} to resolve
        </h4>
        <button
          onClick={handleAbort}
          disabled={loading}
          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300"
        >
          {loading ? "Aborting..." : "Abort Merge"}
        </button>
      </div>
      <div className="space-y-1">
        {conflicts.map((f) => (
          <div key={f} className="rounded border border-red-200/60 dark:border-red-800/30">
            <div className="flex items-center gap-2 text-xs p-1.5">
              <span className="flex-1 font-mono text-red-600 dark:text-red-400 truncate">{f}</span>
              <button
                onClick={() => handleResolve(f, "ours")}
                disabled={resolving === f}
                className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-200 disabled:opacity-50"
              >
                Ours
              </button>
              <button
                onClick={() => handleResolve(f, "theirs")}
                disabled={resolving === f}
                className="px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-200 disabled:opacity-50"
              >
                Theirs
              </button>
              <button
                onClick={() => handleTogglePreview(f)}
                disabled={previewLoading}
                aria-expanded={preview?.file === f}
                className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-50"
              >
                {preview?.file === f ? "Hide hunks" : "Resolve hunks…"}
              </button>
            </div>

            {preview?.file === f && (
              <div className="select-text border-t border-red-200/60 dark:border-red-800/30 p-2 space-y-2">
                {preview.sections.map((section, i) => {
                  if (section.kind === "text") {
                    return (
                      <pre key={i} className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-pre-wrap max-h-20 overflow-auto">
                        {section.lines.slice(0, 8).join("\n")}
                        {section.lines.length > 8 ? "\n…" : ""}
                      </pre>
                    );
                  }
                  const conflictNo = preview.sections.slice(0, i).filter((s) => s.kind === "conflict").length;
                  const choice = preview.choices[conflictNo] ?? "both";
                  return (
                    <div key={i} className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 dark:bg-gray-800/60">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-1">
                          Hunk {conflictNo + 1}
                        </span>
                        {(["ours", "theirs", "both"] as ConflictChoice[]).map((c) => (
                          <button
                            key={c}
                            role="radio"
                            aria-checked={choice === c}
                            onClick={() => handleChoice(conflictNo, c)}
                            className={`px-2 py-0.5 rounded text-[11px] capitalize ${
                              choice === c
                                ? "bg-blue-500 text-white"
                                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 text-[11px] font-mono">
                        <pre className="p-2 whitespace-pre-wrap bg-blue-50/60 dark:bg-blue-900/10 text-blue-800 dark:text-blue-300 max-h-40 overflow-auto border-b sm:border-b-0 sm:border-r border-gray-200 dark:border-gray-700">
                          {section.ours.join("\n")}
                        </pre>
                        <pre className="p-2 whitespace-pre-wrap bg-green-50/60 dark:bg-green-900/10 text-green-800 dark:text-green-300 max-h-40 overflow-auto">
                          {section.theirs.join("\n")}
                        </pre>
                      </div>
                      {section.base.length > 0 && (
                        <pre className="p-2 text-[11px] font-mono whitespace-pre-wrap bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 max-h-24 overflow-auto border-t border-gray-200 dark:border-gray-700">
                          {"base:\n"}{section.base.join("\n")}
                        </pre>
                      )}
                    </div>
                  );
                })}
                <div className="flex justify-end">
                  <button
                    onClick={handleApply}
                    disabled={resolving === f}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                  >
                    {resolving === f ? "Applying..." : "Apply hunks & stage"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

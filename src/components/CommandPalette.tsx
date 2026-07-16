import { memo, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ProjectMatch } from "../hooks/useCommandPalette";
import type { SearchResult } from "../lib/types";
import { searchContent } from "../lib/tauri";

export interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  action: () => void;
  _needsProject?: boolean;
  _projectAction?: (projectPath: string) => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  matchedProjects: ProjectMatch[];
  recentProjects: ProjectMatch[];
  query: string;
  onQueryChange: (q: string) => void;
  onScrollToProject: (id: string) => void;
  onAddRecent: (id: string, name: string, lastBranch: string) => void;
}

const QUICK_TAGS = [
  { label: "behind", description: "Projects behind remote" },
  { label: "changes", description: "Projects with modifications" },
  { label: "stale", description: "Inactive for 30+ days" },
];

const STATUS_COLORS = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200 dark:bg-amber-700/60 text-inherit rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export const CommandPalette = memo(function CommandPalette({
  open,
  onClose,
  commands,
  matchedProjects,
  recentProjects,
  query,
  onQueryChange,
  onScrollToProject,
  onAddRecent,
}: CommandPaletteProps) {
  const [section, setSection] = useState<"projects" | "commands" | "content">("commands");
  const [projectIdx, setProjectIdx] = useState(0);
  const [cmdIdx, setCmdIdx] = useState(0);
  const [contentIdx, setContentIdx] = useState(0);
  const [contentResults, setContentResults] = useState<SearchResult[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isContentSearch = query.startsWith("/");
  const contentQuery = isContentSearch ? query.slice(1) : "";
  const debouncedContentQuery = useDebounce(contentQuery, 300);

  // Content search via IPC
  useEffect(() => {
    if (!isContentSearch) {
      setContentResults([]);
      setContentLoading(false);
      return;
    }
    const q = debouncedContentQuery.trim();
    if (!q) {
      setContentResults([]);
      setContentLoading(false);
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    searchContent(q, { maxResults: 100 })
      .then((results) => {
        if (!cancelled) {
          setContentResults(results);
          setContentLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContentResults([]);
          setContentLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [isContentSearch, debouncedContentQuery]);

  const filteredCmds = useMemo(
    () =>
      commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.category.toLowerCase().includes(query.toLowerCase())
      ),
    [commands, query]
  );

  // Handle "/" prefix detection from initial query (Cmd+Shift+F)
  useEffect(() => {
    if (open && query === "/" && section !== "content") {
      setSection("content");
    }
  }, [open, query]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group content results by project
  const groupedResults = useMemo(() => {
    const groups = new Map<string, SearchResult[]>();
    for (const r of contentResults) {
      const existing = groups.get(r.projectName);
      if (existing) {
        existing.push(r);
      } else {
        groups.set(r.projectName, [r]);
      }
    }
    return groups;
  }, [contentResults]);

  const hasProjects = matchedProjects.length > 0;

  // Reset state when opening
  useEffect(() => {
    if (open) {
      if (query !== "/") {
        onQueryChange("");
      }
      setProjectIdx(0);
      setCmdIdx(0);
      setContentIdx(0);
      if (query.startsWith("/")) {
        setSection("content");
      } else if (recentProjects.length > 0 || hasProjects) {
        setSection("projects");
      } else {
        setSection("commands");
      }
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset indices when results change
  useEffect(() => {
    setProjectIdx(0);
    setCmdIdx(0);
    setContentIdx(0);
    if (isContentSearch) {
      setSection("content");
    } else if (recentProjects.length > 0 || hasProjects) {
      setSection("projects");
    } else {
      setSection("commands");
    }
  }, [query, hasProjects, isContentSearch, recentProjects.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector("[data-active]");
    if (active) active.scrollIntoView({ block: "nearest" });
  }, [projectIdx, cmdIdx, contentIdx, section]);

  const handleSelectContentResult = useCallback((result: SearchResult) => {
    // Find the project by name and scroll to it
    const match = matchedProjects.find(
      (pm) => pm.detail.project.name === result.projectName
    );
    if (match) {
      onScrollToProject(match.detail.project.id);
    }
    onClose();
  }, [matchedProjects, onScrollToProject, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      if (isContentSearch) return; // No section switching in content mode
      if (e.shiftKey) {
        setSection((s) => (s === "commands" ? "projects" : "commands"));
      } else {
        setSection((s) => (s === "projects" ? "commands" : "projects"));
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (section === "content") {
        setContentIdx((i) => Math.min(i + 1, contentResults.length - 1));
      } else if (section === "projects") {
        const total = !query.trim()
          ? recentProjects.length + matchedProjects.length
          : matchedProjects.length;
        setProjectIdx((i) => Math.min(i + 1, total - 1));
      } else {
        setCmdIdx((i) => Math.min(i + 1, filteredCmds.length - 1));
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (section === "content") {
        setContentIdx((i) => Math.max(i - 1, 0));
      } else if (section === "projects") {
        setProjectIdx((i) => Math.max(i - 1, 0));
      } else {
        setCmdIdx((i) => Math.max(i - 1, 0));
      }
      return;
    }

    if (e.key === "Enter") {
      if (section === "content" && contentResults[contentIdx]) {
        handleSelectContentResult(contentResults[contentIdx]);
      } else if (section === "projects") {
        const projMatch = !query.trim() && projectIdx < recentProjects.length
          ? recentProjects[projectIdx]
          : matchedProjects[query.trim() ? projectIdx : projectIdx - recentProjects.length];
        if (projMatch) {
          onScrollToProject(projMatch.detail.project.id);
          onAddRecent(
            projMatch.detail.project.id,
            projMatch.detail.project.alias || projMatch.detail.project.name,
            projMatch.detail.current_branch,
          );
          onClose();
        }
      } else if (section === "commands" && filteredCmds[cmdIdx]) {
        const cmd = filteredCmds[cmdIdx];
        if (cmd._needsProject) {
          const proj = matchedProjects[0]?.detail?.project;
          if (proj) {
            cmd._projectAction?.(proj.path);
          }
        } else {
          cmd.action();
        }
        onClose();
      }
      return;
    }

    if (e.key === "Escape") onClose();
  };

  if (!open) return null;

  let flatIdx = 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-(--surface-1) rounded-xl shadow-2xl border border-(--border-color) overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isContentSearch
              ? "Search across all repositories..."
              : "Search projects, commands, or / for content search..."
          }
          aria-label="Search projects, commands, and content"
          className="w-full px-4 py-3 text-sm bg-transparent border-b border-(--border-color) outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
        />

        {/* Quick tags — hidden in content search mode */}
        {!isContentSearch && (
          <div className="flex gap-2 px-4 py-2 border-b border-(--border-color)">
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag.label}
                className="px-2.5 py-0.5 text-xs rounded-full bg-(--surface-2) text-gray-600 dark:text-gray-300 hover:bg-(--accent) hover:text-white transition-colors"
                onClick={() => onQueryChange(tag.label)}
                title={tag.description}
              >
                {tag.label}
              </button>
            ))}
          </div>
        )}

        <div ref={listRef} className="max-h-96 overflow-y-auto">
          {/* Content search results */}
          {isContentSearch && (
            <div role="listbox" aria-label="Content search results">
              {contentLoading && (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Searching...
                </div>
              )}

              {!contentLoading && contentQuery.trim() && contentResults.length === 0 && (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">
                  No results found for "{contentQuery}"
                </p>
              )}

              {!contentLoading && !contentQuery.trim() && (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">
                  Type to search file contents across all repositories
                </p>
              )}

              {!contentLoading && contentResults.length > 0 && (
                <>
                  <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 flex items-center justify-between">
                    <span>Content Matches</span>
                    <span className="normal-case font-normal opacity-70">
                      {contentResults.length} result{contentResults.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {Array.from(groupedResults).map(([projectName, results]) => (
                    <div key={projectName}>
                      <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/10">
                        {projectName}
                      </div>
                      {results.map((result) => {
                        const idx = flatIdx++;
                        const isActive = idx === contentIdx;
                        return (
                          <button
                            key={`${result.projectName}-${result.filePath}-${result.lineNumber}`}
                            data-active={isActive ? "" : undefined}
                            role="option"
                            aria-selected={isActive}
                            className={`w-full px-4 py-1.5 text-left text-sm flex flex-col gap-0.5 ${
                              isActive
                                ? "bg-amber-50 dark:bg-amber-900/20"
                                : "hover:bg-(--surface-2)"
                            } text-gray-900 dark:text-gray-100`}
                            onClick={() => handleSelectContentResult(result)}
                            onMouseEnter={() => {
                              setSection("content");
                              setContentIdx(idx);
                            }}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 truncate shrink-0 max-w-[50%]">
                                {highlightMatch(result.filePath, contentQuery)}
                              </span>
                              <span className="text-[10px] text-gray-400 shrink-0">
                                :{result.lineNumber}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate leading-relaxed">
                              {highlightMatch(result.lineContent, contentQuery)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Projects section — hidden in content search mode */}
          {!isContentSearch && (recentProjects.length > 0 || matchedProjects.length > 0) && (
            <div role="listbox" aria-label="Projects">
              {recentProjects.length > 0 && !query.trim() && (
                <>
                  <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20">
                    Recent Projects
                  </div>
                  {recentProjects.map((pm, i) => {
                    const { detail, statusColor } = pm;
                    const { project, current_branch } = detail;
                    const isActive = section === "projects" && i === projectIdx;
                    return (
                      <button
                        key={`recent-${project.id}`}
                        data-active={isActive ? "" : undefined}
                        role="option"
                        aria-selected={isActive}
                        className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 ${
                          isActive
                            ? "bg-blue-50 dark:bg-blue-900/30"
                            : "hover:bg-(--surface-2)"
                        } text-gray-900 dark:text-gray-100`}
                        onClick={() => {
                          onScrollToProject(project.id);
                          onAddRecent(project.id, project.alias || project.name, current_branch);
                          onClose();
                        }}
                        onMouseEnter={() => {
                          setSection("projects");
                          setProjectIdx(i);
                        }}
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[statusColor]}`}
                        />
                        <span className="flex-1 min-w-0 truncate">
                          <span className="font-medium">{project.alias || project.name}</span>
                          <span className="text-gray-400 mx-1.5">&mdash;</span>
                          <span className="text-blue-600 dark:text-blue-400">
                            {current_branch}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
              {matchedProjects.length > 0 && (
                <>
                  <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-(--surface-2)">
                    Projects
                  </div>
                  {matchedProjects.map((pm, i) => {
                    const { detail, statusColor } = pm;
                    const { project, current_branch, status } = detail;
                    const recentOffset = recentProjects.length > 0 && !query.trim() ? recentProjects.length : 0;
                    const isActive = section === "projects" && i + recentOffset === projectIdx;
                    const hasChanges = status.modified + status.staged + status.untracked > 0;

                    return (
                      <button
                        key={project.id}
                        data-active={isActive ? "" : undefined}
                        role="option"
                        aria-selected={isActive}
                        className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 ${
                          isActive
                            ? "bg-blue-50 dark:bg-blue-900/30"
                            : "hover:bg-(--surface-2)"
                        } text-gray-900 dark:text-gray-100`}
                        onClick={() => {
                          onScrollToProject(project.id);
                          onAddRecent(project.id, project.alias || project.name, current_branch);
                          onClose();
                        }}
                        onMouseEnter={() => {
                          setSection("projects");
                          setProjectIdx(i + recentOffset);
                        }}
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[statusColor]}`}
                        />
                        <span className="flex-1 min-w-0 truncate">
                          <span className="font-medium">{project.alias || project.name}</span>
                          <span className="text-gray-400 mx-1.5">&mdash;</span>
                          <span className="text-blue-600 dark:text-blue-400">
                            {current_branch}
                          </span>
                          {hasChanges && (
                            <span className="ml-1.5 text-amber-500 text-xs">
                              ({status.modified + status.staged + status.untracked})
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-gray-400 truncate max-w-[160px] shrink-0">
                          {project.path}
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Commands section — hidden in content search mode */}
          {!isContentSearch && (
            <div role="listbox" aria-label="Commands">
              <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-(--surface-2)">
                Commands
              </div>
              {filteredCmds.map((cmd, i) => {
                const isActive = section === "commands" && i === cmdIdx;
                return (
                  <button
                    key={cmd.id}
                    data-active={isActive ? "" : undefined}
                    role="option"
                    aria-selected={isActive}
                    className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between ${
                      isActive
                        ? "bg-blue-50 dark:bg-blue-900/30"
                        : "hover:bg-(--surface-2)"
                    } text-gray-900 dark:text-gray-100`}
                    onClick={() => {
                      if (cmd._needsProject) {
                        const proj = matchedProjects[0]?.detail?.project;
                        if (proj) {
                          cmd._projectAction?.(proj.path);
                        }
                      } else {
                        cmd.action();
                      }
                      onClose();
                    }}
                    onMouseEnter={() => {
                      setSection("commands");
                      setCmdIdx(i);
                    }}
                  >
                    <span>
                      <span className="text-gray-400 mr-2">{cmd.category}</span>
                      {cmd.label}
                    </span>
                    {cmd.shortcut && (
                      <kbd className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
              {filteredCmds.length === 0 && !hasProjects && (
                <p className="px-4 py-3 text-sm text-gray-400">
                  No results found
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-1.5 text-[10px] text-gray-400 border-t border-(--border-color) flex items-center gap-3">
          <span><kbd className="bg-gray-100 dark:bg-gray-800 px-1 rounded">↑↓</kbd> navigate</span>
          <span><kbd className="bg-gray-100 dark:bg-gray-800 px-1 rounded">Enter</kbd> select</span>
          {!isContentSearch && (
            <span><kbd className="bg-gray-100 dark:bg-gray-800 px-1 rounded">Tab</kbd> switch section</span>
          )}
          <span><kbd className="bg-gray-100 dark:bg-gray-800 px-1 rounded">/</kbd> content search</span>
          <span><kbd className="bg-gray-100 dark:bg-gray-800 px-1 rounded">Esc</kbd> close</span>
        </div>
      </div>
    </div>,
    document.body
  );
});
export default CommandPalette;

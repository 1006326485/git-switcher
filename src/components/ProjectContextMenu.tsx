import { useCallback, memo, useState, lazy, Suspense } from "react";
import * as api from "../lib/tauri";
import { parseError, PROJECT_COLORS, type ProjectScript, type GitFileEntry } from "../lib/types";
import { DropdownMenu, MenuItem, IconButton, Modal } from "./ui/primitives";
import { ColorPicker } from "./ColorPicker";
import { ScriptPickerDialog } from "./ScriptPickerDialog";
import {
  KebabIcon,
  BranchIcon,
  ClockIcon,
  AiGenerateIcon,
  TerminalIcon,
  FinderIcon,
  VscodeIcon,
} from "./ui/icons";

// ── Project Tools (second-level menu) ───────────────────────────────────────
// The tool panels below used to ship with zero UI entry points. They are
// lazily loaded so the main bundle stays small.
const ReflogView = lazy(() => import("./ReflogView").then((m) => ({ default: m.ReflogView })));
const FileHistoryView = lazy(() => import("./FileHistoryView").then((m) => ({ default: m.FileHistoryView })));
const BlameView = lazy(() => import("./BlameView").then((m) => ({ default: m.BlameView })));
const InteractiveRebase = lazy(() => import("./InteractiveRebase").then((m) => ({ default: m.InteractiveRebase })));
const WorktreeManager = lazy(() => import("./WorktreeManager").then((m) => ({ default: m.WorktreeManager })));
const SubmoduleManager = lazy(() => import("./SubmoduleManager").then((m) => ({ default: m.SubmoduleManager })));
const BisectPanel = lazy(() => import("./BisectPanel").then((m) => ({ default: m.BisectPanel })));
const HooksManager = lazy(() => import("./HooksManager").then((m) => ({ default: m.HooksManager })));
const GitignoreEditor = lazy(() => import("./GitignoreEditor").then((m) => ({ default: m.GitignoreEditor })));
const ProjectStatsPanel = lazy(() => import("./ProjectStatsPanel").then((m) => ({ default: m.ProjectStatsPanel })));

type ToolId =
  | "reflog"
  | "filehistory"
  | "blame"
  | "rebase"
  | "worktrees"
  | "submodules"
  | "bisect"
  | "hooks"
  | "gitignore"
  | "stats";

type FileTool = "filehistory" | "blame";

const TOOL_GROUPS: { label: string; items: { id: ToolId; label: string }[] }[] = [
  {
    label: "History",
    items: [
      { id: "reflog", label: "Reflog" },
      { id: "filehistory", label: "File History…" },
      { id: "blame", label: "Blame…" },
      { id: "rebase", label: "Interactive Rebase…" },
    ],
  },
  {
    label: "Worktree",
    items: [
      { id: "worktrees", label: "Worktrees" },
      { id: "submodules", label: "Submodules" },
    ],
  },
  {
    label: "Tools",
    items: [
      { id: "bisect", label: "Bisect" },
      { id: "hooks", label: "Git Hooks" },
      { id: "gitignore", label: ".gitignore Editor…" },
      { id: "stats", label: "Project Stats" },
    ],
  },
];

interface ProjectContextMenuProps {
  projectId: string;
  currentColor?: string;
  path: string;
  title: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  /** Refresh hook for git-mutating tools (reflog checkout, rebase, …). */
  onGitRefresh?: () => void | Promise<void>;
  onOpenBranchManager?: () => void;
  onOpenTagManager?: () => void;
  onOpenLogViewer?: () => void;
  onOpenAiReview?: () => void;
  onOpenBuiltInTerminal?: (path: string) => void;
  onRunProjectScript?: (script: ProjectScript) => void;
  onColorChange?: (color: string | null) => void;
  onEditDescription?: () => void;
  notes?: string;
  onEditNotes?: () => void;
}

export const ProjectContextMenu = memo(function ProjectContextMenu({
  projectId,
  currentColor,
  path,
  title,
  onSuccess,
  onError,
  onOpenBranchManager,
  onOpenTagManager,
  onOpenLogViewer,
  onOpenAiReview,
  onOpenBuiltInTerminal,
  onRunProjectScript,
  onColorChange,
  onEditDescription,
  notes,
  onEditNotes,
  onGitRefresh,
}: ProjectContextMenuProps) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [scriptPickerOpen, setScriptPickerOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [filePickerFor, setFilePickerFor] = useState<FileTool | null>(null);
  const [repoFiles, setRepoFiles] = useState<GitFileEntry[]>([]);
  const [fileQuery, setFileQuery] = useState("");
  const [pickedFile, setPickedFile] = useState<{ tool: FileTool; file: string } | null>(null);
  const [rebaseOpen, setRebaseOpen] = useState(false);
  const [gitignoreOpen, setGitignoreOpen] = useState(false);

  const handleToolRefresh = useCallback(async () => {
    await onGitRefresh?.();
  }, [onGitRefresh]);

  const loadRepoFiles = useCallback(async () => {
    try {
      setRepoFiles(await api.gitGetFiles(path));
    } catch (e) {
      onError(parseError(e));
    }
  }, [path, onError]);

  const handleToolSelect = useCallback(
    (id: ToolId) => {
      // Dialog-style tools host their own Modal, so they run standalone.
      if (id === "rebase") {
        setToolsOpen(false);
        setRebaseOpen(true);
        return;
      }
      if (id === "gitignore") {
        setToolsOpen(false);
        setGitignoreOpen(true);
        return;
      }
      // File-scoped tools ask for a file first, then open standalone.
      if (id === "filehistory" || id === "blame") {
        setFilePickerFor(id);
        setActiveTool(null);
        void loadRepoFiles();
        return;
      }
      setFilePickerFor(null);
      setActiveTool(id);
    },
    [loadRepoFiles]
  );

  const handleFilePick = useCallback(
    (tool: FileTool, filePath: string) => {
      setToolsOpen(false);
      setFilePickerFor(null);
      setFileQuery("");
      setPickedFile({ tool, file: filePath });
    },
    []
  );

  const closeTools = useCallback(() => {
    setToolsOpen(false);
    setActiveTool(null);
    setFilePickerFor(null);
    setFileQuery("");
  }, []);

  const handleAction = useCallback(
    async (name: string, fn: () => Promise<void>) => {
      try {
        await fn();
        onSuccess(`Opened in ${name}`);
      } catch (e) {
        onError(parseError(e));
      }
    },
    [onSuccess, onError]
  );

  const handleOpenTerminal = useCallback(() => handleAction("Terminal", () => api.openInTerminal(path)), [handleAction, path]);
  const handleOpenFinder = useCallback(() => handleAction("Finder", () => api.openInFinder(path)), [handleAction, path]);
  const handleOpenVscode = useCallback(() => handleAction("VS Code", () => api.openInVscode(path)), [handleAction, path]);

  const handleColorSelect = useCallback(
    async (color: string | null) => {
      try {
        await api.setProjectColor(projectId, color);
        onColorChange?.(color);
        onSuccess(color ? `Color set to ${color}` : "Color removed");
      } catch (e) {
        onError(parseError(e));
      }
    },
    [projectId, onSuccess, onError, onColorChange]
  );

  return (
    <>
    <DropdownMenu
      trigger={
        <IconButton title="More actions">
          <KebabIcon />
        </IconButton>
      }
    >
      {onOpenBranchManager && (
        <MenuItem
          icon={<BranchIcon />}
          label="Branch Manager"
          description="Create, delete, merge branches"
          onClick={onOpenBranchManager}
        />
      )}
      {onOpenTagManager && (
        <MenuItem
          icon={
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 010 2.474l-5.026 5.026a1.75 1.75 0 01-2.474 0l-6.25-6.25A1.752 1.752 0 011 7.775zM12 7.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
            </svg>
          }
          label="Tags"
          description="Create, delete tags"
          onClick={onOpenTagManager}
        />
      )}
      {onOpenLogViewer && (
        <MenuItem
          icon={<ClockIcon />}
          label="Commit History"
          description="View commit log"
          onClick={onOpenLogViewer}
        />
      )}
      {onOpenAiReview && (
        <MenuItem
          icon={<AiGenerateIcon />}
          label="AI Code Review"
          description="Review diff with LLM"
          onClick={onOpenAiReview}
        />
      )}

      <MenuItem
        icon={<ClockIcon />}
        label="Project Tools"
        description="History, worktrees, hooks & more"
        onClick={() => setToolsOpen(true)}
      />

      {onEditDescription && (
        <MenuItem
          icon={
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61z" />
            </svg>
          }
          label="Edit Description"
          description="Set project description"
          onClick={onEditDescription}
        />
      )}

      {onEditNotes && (
        <MenuItem
          icon={
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0113.25 15H2.75A1.75 1.75 0 011 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H2.75zM4 5.75A.75.75 0 014.75 5h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 014 5.75zm0 3A.75.75 0 014.75 8h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 014 8.75zm0 3a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75z" />
            </svg>
          }
          label="Notes"
          description={notes ? "Edit notes" : "Add notes"}
          onClick={onEditNotes}
        />
      )}

      <MenuItem
        icon={
          <span
            className={`w-3.5 h-3.5 rounded-full inline-block ${
              currentColor
                ? (PROJECT_COLORS.find((x) => x.id === currentColor)?.bg ?? "bg-gray-400")
                : "bg-gray-400"
            }`}
          />
        }
        label="Set Color"
        description={currentColor ? `Current: ${currentColor}` : "No color set"}
        onClick={() => setColorPickerOpen(true)}
      />

      <div className="border-t border-gray-100 dark:border-gray-700 my-1" />

      {onRunProjectScript && (
        <MenuItem
          icon={<TerminalIcon />}
          label="Run Script…"
          description="Run a package.json script"
          onClick={() => setScriptPickerOpen(true)}
        />
      )}
      {onOpenBuiltInTerminal && (
        <MenuItem
          icon={<TerminalIcon />}
          label="Open Built-in Terminal"
          onClick={() => onOpenBuiltInTerminal(path)}
        />
      )}
      <MenuItem
        icon={<TerminalIcon />}
        label="Open in System Terminal"
        onClick={handleOpenTerminal}
      />
      <MenuItem
        icon={<FinderIcon />}
        label="Open in Finder"
        onClick={handleOpenFinder}
      />
      <MenuItem
        icon={<VscodeIcon />}
        label="Open in VS Code"
        onClick={handleOpenVscode}
      />
    </DropdownMenu>
    <ColorPicker
      currentColor={currentColor}
      onSelect={handleColorSelect}
      trigger={<span />}
      align="right"
      open={colorPickerOpen}
      onOpenChange={setColorPickerOpen}
    />
    <ScriptPickerDialog
      open={scriptPickerOpen}
      projectPath={path}
      projectTitle={title}
      onRun={(script) => {
        setScriptPickerOpen(false);
        onRunProjectScript?.(script);
      }}
      onClose={() => setScriptPickerOpen(false)}
    />

    {/* Second-level Tools menu, grouped by git domain */}
    <Modal
      open={toolsOpen}
      onClose={closeTools}
      title="Project Tools"
      subtitle={title}
      maxWidth="max-w-3xl"
    >
      <div className="flex flex-col sm:flex-row gap-3 p-4">
        <nav className="sm:w-44 shrink-0 space-y-3" aria-label="Project tools">
          {TOOL_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {group.label}
              </div>
              <div className="space-y-0.5" role="group" aria-label={group.label}>
                {group.items.map((item) => {
                  const selected =
                    activeTool === item.id ||
                    (filePickerFor === item.id) ||
                    (item.id === "rebase" && rebaseOpen) ||
                    (item.id === "gitignore" && gitignoreOpen);
                  return (
                    <button
                      key={item.id}
                      aria-current={selected ? "true" : undefined}
                      onClick={() => handleToolSelect(item.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors ${
                        selected
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="flex-1 min-w-0 border-t sm:border-t-0 sm:border-l border-gray-100 dark:border-gray-700 sm:pl-3 pt-3 sm:pt-0">
          <Suspense fallback={<div className="text-xs text-gray-400 p-2">Loading…</div>}>
            {filePickerFor && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={fileQuery}
                  onChange={(e) => setFileQuery(e.target.value)}
                  placeholder="Filter files…"
                  aria-label="Filter files"
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm"
                />
                <div className="max-h-72 overflow-auto rounded-lg border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-800">
                  {repoFiles
                    .filter((f) => f.path.toLowerCase().includes(fileQuery.toLowerCase()))
                    .slice(0, 200)
                    .map((f) => (
                      <button
                        key={f.path}
                        onClick={() => handleFilePick(filePickerFor, f.path)}
                        className="w-full text-left px-2 py-1.5 text-xs font-mono text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 truncate"
                      >
                        {f.path}
                      </button>
                    ))}
                  {repoFiles.length === 0 && (
                    <div className="px-2 py-3 text-xs text-gray-400">No changed files</div>
                  )}
                </div>
              </div>
            )}
            {!filePickerFor && activeTool === "reflog" && (
              <ReflogView
                path={path}
                onRefresh={handleToolRefresh}
                onSuccess={onSuccess}
                onError={onError}
              />
            )}
            {!filePickerFor && activeTool === "worktrees" && (
              <WorktreeManager path={path} onSuccess={onSuccess} onError={onError} onInfo={onSuccess} />
            )}
            {!filePickerFor && activeTool === "submodules" && (
              <SubmoduleManager path={path} onSuccess={onSuccess} onError={onError} onInfo={onSuccess} />
            )}
            {!filePickerFor && activeTool === "bisect" && (
              <BisectPanel path={path} onSuccess={onSuccess} onError={onError} />
            )}
            {!filePickerFor && activeTool === "hooks" && (
              <HooksManager path={path} onSuccess={onSuccess} onError={onError} />
            )}
            {!filePickerFor && activeTool === "stats" && <ProjectStatsPanel path={path} />}
            {!filePickerFor && !activeTool && (
              <div className="text-xs text-gray-400 p-2">
                Pick a tool on the left. History tools cover reflog, per-file history,
                blame and interactive rebase; Worktree tools manage working directories
                and submodules.
              </div>
            )}
          </Suspense>
        </div>
      </div>
    </Modal>

    {/* Dialog-style tools run standalone (they host their own overlay) */}
    {rebaseOpen && (
      <Suspense fallback={null}>
        <InteractiveRebase
          open
          path={path}
          onClose={() => setRebaseOpen(false)}
          onSuccess={onSuccess}
          onError={onError}
          onRefresh={handleToolRefresh}
        />
      </Suspense>
    )}
    {gitignoreOpen && (
      <Suspense fallback={null}>
        <GitignoreEditor
          open
          path={path}
          onClose={() => setGitignoreOpen(false)}
          onSuccess={onSuccess}
          onError={onError}
        />
      </Suspense>
    )}
    {pickedFile?.tool === "filehistory" && (
      <Suspense fallback={null}>
        <FileHistoryView
          path={path}
          filePath={pickedFile.file}
          onClose={() => setPickedFile(null)}
        />
      </Suspense>
    )}
    {pickedFile?.tool === "blame" && (
      <Suspense fallback={null}>
        <BlameView path={path} filePath={pickedFile.file} onClose={() => setPickedFile(null)} />
      </Suspense>
    )}
    </>
  );
});

import { useCallback, memo, useState, lazy, Suspense, Fragment } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../lib/tauri";
import { parseError, type GitFileEntry } from "../lib/types";
import { DropdownMenu, MenuItem, IconButton, Modal } from "./ui/primitives";
import { ContextMenu, MenuSeparator } from "./ui/ContextMenu";
import { ColorPicker } from "./ColorPicker";
import { ScriptPickerDialog } from "./ScriptPickerDialog";
import { KebabIcon } from "./ui/icons";
import { useProjectMenuGroups, type ProjectMenuParams } from "./projectMenu";

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

type ToolGroupKey = "menu.group.history" | "menu.group.worktree" | "menu.group.tools";
type ToolLabelKey =
  | "menu.tool.reflog"
  | "menu.tool.fileHistory"
  | "menu.tool.blame"
  | "menu.tool.rebase"
  | "menu.tool.worktrees"
  | "menu.tool.submodules"
  | "menu.tool.bisect"
  | "menu.tool.hooks"
  | "menu.tool.gitignore"
  | "menu.tool.stats";

const TOOL_GROUPS: { labelKey: ToolGroupKey; items: { id: ToolId; labelKey: ToolLabelKey }[] }[] = [
  {
    labelKey: "menu.group.history",
    items: [
      { id: "reflog", labelKey: "menu.tool.reflog" },
      { id: "filehistory", labelKey: "menu.tool.fileHistory" },
      { id: "blame", labelKey: "menu.tool.blame" },
      { id: "rebase", labelKey: "menu.tool.rebase" },
    ],
  },
  {
    labelKey: "menu.group.worktree",
    items: [
      { id: "worktrees", labelKey: "menu.tool.worktrees" },
      { id: "submodules", labelKey: "menu.tool.submodules" },
    ],
  },
  {
    labelKey: "menu.group.tools",
    items: [
      { id: "bisect", labelKey: "menu.tool.bisect" },
      { id: "hooks", labelKey: "menu.tool.hooks" },
      { id: "gitignore", labelKey: "menu.tool.gitignore" },
      { id: "stats", labelKey: "menu.tool.stats" },
    ],
  },
];

type ProjectContextMenuProps = Omit<
  ProjectMenuParams,
  "onOpenColorPicker" | "onOpenScriptPicker" | "onOpenTools"
> & {
  /** Anchor for the row right-click menu (null when closed). */
  contextAnchor?: { x: number; y: number } | null;
  /** Closes the row right-click menu. */
  contextOnClose?: () => void;
  /** Requests removal; App owns the confirmation dialog. */
  onRemoveProject?: () => void | Promise<void>;
};

const noop = () => {};

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
  onRunFetch,
  fetching,
  onRunPull,
  pulling,
  onRunPush,
  pushing,
  onOpenStashManager,
  onRefresh,
  onAssignGroup,
  onEditAlias,
  onOpenBuiltInTerminal,
  onRunProjectScript,
  onColorChange,
  onEditDescription,
  notes,
  onEditNotes,
  onGitRefresh,
  onRemoveProject,
  contextAnchor = null,
  contextOnClose,
}: ProjectContextMenuProps) {
  const { t } = useTranslation();
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

  const handleColorSelect = useCallback(
    async (color: string | null) => {
      try {
        await api.setProjectColor(projectId, color);
        onColorChange?.(color);
        onSuccess(color ? t("row.color.set", { color }) : t("row.color.removed"));
      } catch (e) {
        onError(parseError(e));
      }
    },
    [projectId, onSuccess, onError, onColorChange, t]
  );

  const groups = useProjectMenuGroups({
    projectId,
    currentColor,
    path,
    title,
    onSuccess,
    onError,
    onGitRefresh,
    onOpenBranchManager,
    onOpenTagManager,
    onOpenLogViewer,
    onOpenAiReview,
    onRunFetch,
    fetching,
    onRunPull,
    pulling,
    onRunPush,
    pushing,
    onOpenStashManager,
    onRefresh,
    onAssignGroup,
    onEditAlias,
    onOpenBuiltInTerminal,
    onRunProjectScript,
    onColorChange,
    onEditDescription,
    notes,
    onEditNotes,
    onRequestRemove: onRemoveProject,
    onOpenColorPicker: () => setColorPickerOpen(true),
    onOpenScriptPicker: () => setScriptPickerOpen(true),
    onOpenTools: () => setToolsOpen(true),
  });

  // The kebab dropdown and the row right-click menu render the same items.
  // Separators mark group boundaries so both entry points keep an identical
  // block structure regardless of which conditional items are present.
  const visibleGroups = groups.filter((group) => group.items.length > 0);
  const menuItems = (
    <>
      {visibleGroups.map((group, groupIndex) => (
        <Fragment key={group.id}>
          {groupIndex > 0 && <MenuSeparator />}
          {group.items.map((item) => (
            <MenuItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              description={item.description}
              danger={item.danger}
              disabled={item.disabled}
              shortcut={item.shortcut}
              onClick={item.run}
            />
          ))}
        </Fragment>
      ))}
    </>
  );

  return (
    <>
    <DropdownMenu
      trigger={
        <IconButton title={t("menu.more")}>
          <KebabIcon />
        </IconButton>
      }
    >
      {menuItems}
    </DropdownMenu>
    <ContextMenu
      open={contextAnchor !== null}
      anchor={contextAnchor ?? { x: 0, y: 0 }}
      onClose={contextOnClose ?? noop}
    >
      {menuItems}
    </ContextMenu>
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
      title={t("menu.tools")}
      subtitle={title}
      width="xl"
    >
      <div className="flex flex-col sm:flex-row gap-3 p-4">
        <nav className="sm:w-44 shrink-0 space-y-3" aria-label={t("menu.toolsNav")}>
          {TOOL_GROUPS.map((group) => (
            <div key={group.labelKey}>
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {t(group.labelKey)}
              </div>
              <div className="space-y-0.5" role="group" aria-label={t(group.labelKey)}>
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
                      {t(item.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="flex-1 min-w-0 border-t sm:border-t-0 sm:border-l border-gray-100 dark:border-gray-700 sm:pl-3 pt-3 sm:pt-0">
          <Suspense fallback={<div className="text-xs text-gray-400 p-2">{t("menu.loading")}</div>}>
            {filePickerFor && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={fileQuery}
                  onChange={(e) => setFileQuery(e.target.value)}
                  placeholder={t("menu.filterFiles")}
                  aria-label={t("menu.filterFilesAria")}
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
                    <div className="px-2 py-3 text-xs text-gray-400">{t("menu.noChangedFiles")}</div>
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

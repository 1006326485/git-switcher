import { memo, useState, useEffect, useCallback, useRef, lazy, Suspense, type ReactNode } from "react";
import type { ProjectDetail } from "../lib/types";
import { PROJECT_COLORS } from "../lib/types";
import { IconButton } from "./ui/primitives";
import { ClockIcon, CloseIcon } from "./ui/icons";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { ColorPicker } from "./ColorPicker";
import { GroupAssignDropdown } from "./ProjectGroupsPanel";
import { ConfirmDialog } from "./ConfirmDialog";
import { useProjectRow } from "../hooks/useProjectRow";
import { setProjectDescription, setProjectNotes, setProjectColor } from "../lib/tauri";
import { useProjectActions } from "../context/ProjectContext";
import type { ActiveGitOp } from "../hooks/useGitOpTracker";

const GitLogViewer = lazy(() => import("./GitLogViewer"));
const BranchManager = lazy(() => import("./BranchManager"));
const AiReviewDialog = lazy(() => import("./AiReviewDialog"));
const TagManager = lazy(() => import("./TagManager"));

// ── Description Editor ──────────────────────────────────────────────────────

interface DescriptionEditorProps {
  projectId: string;
  description?: string;
  onSaved?: (desc: string | null) => void;
  onError?: (msg: string) => void;
  /** Increment to trigger edit mode externally */
  editTrigger?: number;
}

export const DescriptionEditor = memo(function DescriptionEditor({
  projectId,
  description,
  onSaved,
  onError,
  editTrigger,
}: DescriptionEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(description ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevTriggerRef = useRef(editTrigger);

  useEffect(() => {
    if (editTrigger !== undefined && editTrigger !== prevTriggerRef.current && editTrigger > 0) {
      setEditing(true);
    }
    prevTriggerRef.current = editTrigger;
  }, [editTrigger]);

  useEffect(() => {
    if (!editing) {
      setValue(description ?? "");
    }
  }, [description, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Close on outside click
  useEffect(() => {
    if (!editing) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditing(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editing]);

  const handleSave = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed === (description ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      // using static import
      const newDesc = trimmed.length > 0 ? trimmed.slice(0, 100) : null;
      await setProjectDescription(projectId, newDesc);
      onSaved?.(newDesc);
      setEditing(false);
    } catch (e) {
      onError?.(String(e));
    } finally {
      setSaving(false);
    }
  }, [value, description, projectId, onSaved, onError]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        setEditing(false);
      }
    },
    [handleSave]
  );

  if (editing) {
    return (
      <div ref={containerRef} className="mt-0.5">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 100))}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          maxLength={100}
          disabled={saving}
          placeholder="Enter project description..."
          className="w-full text-xs px-1.5 py-0.5 rounded border border-blue-400 dark:border-blue-500 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
    );
  }

  const hasDesc = description && description.length > 0;

  return (
    <div
      ref={containerRef}
      className="group/desc flex items-start gap-1 mt-0.5"
    >
      {hasDesc ? (
        <span
          className="text-xs text-gray-400 dark:text-gray-500 line-clamp-2 break-all"
          title={description}
        >
          {description}
        </span>
      ) : (
        <span
          className="text-xs text-gray-300 dark:text-gray-600 italic cursor-default"
        >
          Add description...
        </span>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover/desc:opacity-100 shrink-0 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
        title="Edit description"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zM11.72 2.84l-8.61 8.61a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.25.25 0 00.108-.064l8.61-8.61a.25.25 0 000-.354L12.073 2.84a.25.25 0 00-.354 0z" />
        </svg>
      </button>
    </div>
  );
});

// ── Notes Editor ────────────────────────────────────────────────────────────

interface NotesEditorProps {
  projectId: string;
  notes?: string;
  onSaved?: (notes: string | null) => void;
  onError?: (msg: string) => void;
  /** Increment to trigger edit mode externally */
  editTrigger?: number;
}

export const NotesEditor = memo(function NotesEditor({
  projectId,
  notes,
  onSaved,
  onError,
  editTrigger,
}: NotesEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevTriggerRef = useRef(editTrigger);

  useEffect(() => {
    if (editTrigger !== undefined && editTrigger !== prevTriggerRef.current && editTrigger > 0) {
      setEditing(true);
    }
    prevTriggerRef.current = editTrigger;
  }, [editTrigger]);

  useEffect(() => {
    if (!editing) {
      setValue(notes ?? "");
    }
  }, [notes, editing]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditing(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editing]);

  const handleSave = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed === (notes ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      // using static import
      const newNotes = trimmed.length > 0 ? trimmed : null;
      await setProjectNotes(projectId, newNotes);
      onSaved?.(newNotes);
      setEditing(false);
    } catch (e) {
      onError?.(String(e));
    } finally {
      setSaving(false);
    }
  }, [value, notes, projectId, onSaved, onError]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditing(false);
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  if (editing) {
    return (
      <div ref={containerRef} className="mt-1">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={saving}
          placeholder="Enter notes..."
          rows={3}
          className="w-full text-xs px-1.5 py-1 rounded border border-blue-400 dark:border-blue-500 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:ring-1 focus:ring-blue-400 resize-none"
        />
        <div className="flex items-center gap-1.5 mt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-2 py-0.5 text-xs rounded bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={saving}
            className="px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-600 dark:text-gray-300 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
            Cmd+Enter to save
          </span>
        </div>
      </div>
    );
  }

  const hasNotes = notes && notes.length > 0;

  return (
    <div
      ref={containerRef}
      className="group/notes flex items-start gap-1 mt-0.5"
    >
      {hasNotes ? (
        <span
          className="text-xs text-gray-400 dark:text-gray-500 line-clamp-2 break-all cursor-default"
          title={notes}
        >
          {notes}
        </span>
      ) : (
        <span className="text-xs text-gray-300 dark:text-gray-600 italic cursor-default">
          No notes
        </span>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover/notes:opacity-100 shrink-0 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
        title="Edit notes"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zM11.72 2.84l-8.61 8.61a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.25.25 0 00.108-.064l8.61-8.61a.25.25 0 000-.354L12.073 2.84a.25.25 0 00-.354 0z" />
        </svg>
      </button>
    </div>
  );
});

// ── Notes Indicator (small pencil icon shown when notes exist) ──────────────

export function NotesIndicator({ notes }: { notes?: string }) {
  if (!notes || notes.length === 0) return null;
  return (
    <span
      className="inline-flex items-center text-gray-400 dark:text-gray-500"
      title={notes}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="opacity-60">
        <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zM11.72 2.84l-8.61 8.61a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.25.25 0 00.108-.064l8.61-8.61a.25.25 0 000-.354L12.073 2.84a.25.25 0 00-.354 0z" />
      </svg>
    </span>
  );
}

// ── Types ───────────────────────────────────────────────────────────────────

export type RowState = ReturnType<typeof useProjectRow>;

/**
 * Everything a view component needs to render a project row.
 * Passed to the `children` render prop.
 */
export interface RowRenderProps {
  detail: ProjectDetail;
  row: RowState;
  /** Pre-built action buttons: history, refresh, context menu, remove */
  actionButtons: ReactNode;
  /** Conditional error banner */
  errorBanner: ReactNode | null;
  /** Active git operation indicator (null if no op active) */
  activeOpIndicator: ReactNode | null;
  /** Whether a git op is currently active for this project */
  hasActiveOp: boolean;
}

interface ProjectRowShellProps {
  detail: ProjectDetail;
  children: (props: RowRenderProps) => ReactNode;
}

// ── Active Op Indicator ─────────────────────────────────────────────────────

const OP_LABELS: Record<string, string> = {
  switch_branch: "Switching",
  commit: "Committing",
  push: "Pushing",
  pull: "Pulling",
  fetch: "Fetching",
  stash: "Stashing",
  pop: "Popping",
  merge: "Merging",
  cherry_pick: "Cherry-picking",
  rebase: "Rebasing",
  delete_branch: "Deleting branch",
  create_branch: "Creating branch",
};

function ActiveOpBanner({ op, onCancel }: { op: ActiveGitOp; onCancel?: () => void }) {
  const label = OP_LABELS[op.op] ?? op.op;
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - op.startedAt) / 1000));

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - op.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [op.startedAt]);

  return (
    <div className="px-4 pb-1">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
        <span className="animate-spin text-sm">&#x21BB;</span>
        <span className="font-medium">{label}...</span>
        {elapsed > 0 && (
          <span className="text-blue-500 dark:text-blue-400 tabular-nums">
            {elapsed}s
          </span>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            className="ml-auto px-1.5 py-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-400 transition-colors"
            title="Cancel operation"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ── Action Buttons Group ────────────────────────────────────────────────────

const ActionButtons = memo(function ActionButtons({
  detail,
  row,
}: {
  detail: ProjectDetail;
  row: RowState;
}) {
  const { onSuccess, onError, onColorChange: syncProjectColor, onFetch, onPull, onPush } = useProjectActions();
  const { project, group } = detail;
  const [fetching, setFetching] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [localColor, setLocalColor] = useState(project.color);

  useEffect(() => {
    setLocalColor(project.color);
  }, [project.color]);

  const handleColorChange = useCallback(
    (color: string | null) => {
      setLocalColor(color ?? undefined);
      syncProjectColor?.(project.id, color);
    },
    [project.id, syncProjectColor]
  );

  const colorBg = localColor
    ? PROJECT_COLORS.find((c) => c.id === localColor)?.bg ?? "bg-gray-400"
    : "bg-gray-400";

  const handleFetch = useCallback(async () => {
    if (!onFetch || fetching) return;
    setFetching(true);
    try {
      await onFetch(project.path);
    } finally {
      setFetching(false);
    }
  }, [onFetch, fetching, project.path]);

  const handlePull = useCallback(async () => {
    if (!onPull || pulling) return;
    setPulling(true);
    try {
      await onPull(project.path);
    } finally {
      setPulling(false);
    }
  }, [onPull, pulling, project.path]);

  const handlePush = useCallback(async () => {
    if (!onPush || pushing) return;
    setPushing(true);
    try {
      await onPush(project.path);
    } finally {
      setPushing(false);
    }
  }, [onPush, pushing, project.path]);

  return (
    <>
      {onFetch && (
        <button
          onClick={handleFetch}
          disabled={fetching}
          aria-label="Fetch"
          title="Fetch remote updates"
          className="p-1.5 rounded-lg text-gray-400 opacity-50 hover:opacity-100 transition-all duration-150 disabled:opacity-30 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-[0.95]"
        >
          {fetching ? (
            <span className="animate-spin inline-block text-xs">&#x21BB;</span>
          ) : (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177l1.38 1.38A7.001 7.001 0 0115 8a.75.75 0 01-1.5 0A5.5 5.5 0 008 2.5zM2.25 9.25a.25.25 0 00-.25.25v3.646a.25.25 0 00.427.177l1.38-1.38A7.001 7.001 0 0015 8a.75.75 0 011.5 0 8.501 8.501 0 01-14.131 4.869l1.204 1.204A.25.25 0 012.104 14H5.75a.25.25 0 000-1.5H2.25z" />
            </svg>
          )}
        </button>
      )}
      {onPull && (
        <button
          onClick={handlePull}
          disabled={pulling}
          aria-label="Pull"
          title="Pull latest changes"
          className="p-1.5 rounded-lg text-gray-400 opacity-50 hover:opacity-100 transition-all duration-150 disabled:opacity-30 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 active:scale-[0.95]"
        >
          {pulling ? (
            <span className="animate-spin inline-block text-xs">&#x21BB;</span>
          ) : (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14H2.75z" />
              <path d="M7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.749.749 0 111.06 1.06l-3.25 3.25a.749.749 0 01-1.06 0L4.22 6.78a.749.749 0 111.06-1.06l1.97 1.969z" />
            </svg>
          )}
        </button>
      )}
      {onPush && (
        <button
          onClick={handlePush}
          disabled={pushing}
          aria-label="Push"
          title="Push local commits"
          className="p-1.5 rounded-lg text-gray-400 opacity-50 hover:opacity-100 transition-all duration-150 disabled:opacity-30 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-[0.95]"
        >
          {pushing ? (
            <span className="animate-spin inline-block text-xs">&#x21BB;</span>
          ) : (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.25 14A1.75 1.75 0 0015 12.25v-2.5a.75.75 0 00-1.5 0v2.5a.25.25 0 01-.25.25H2.75a.25.25 0 01-.25-.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .966.784 1.75 1.75 1.75h10.5z" />
              <path d="M8.75 1.311V8a.75.75 0 01-1.5 0V1.311L5.28 3.28A.75.75 0 014.22 2.22l3.25-3.25a.75.75 0 011.06 0l3.25 3.25a.749.749 0 11-1.06 1.06L8.75 1.311z" />
            </svg>
          )}
        </button>
      )}
      <ColorPicker
        currentColor={localColor}
        onSelect={async (color) => {
          try {
            // using static import
            await setProjectColor(project.id, color);
            handleColorChange(color);
            onSuccess(color ? `Color set to ${color}` : "Color removed");
          } catch (e) {
            onError(String(e));
          }
        }}
        trigger={
          <button
            type="button"
            title="Set project color"
            className="p-1.5 rounded-lg opacity-50 hover:opacity-100 transition-all duration-150 hover:bg-gray-50 dark:hover:bg-gray-700/50 active:scale-[0.95]"
          >
            <span className={`block w-3.5 h-3.5 rounded-full ${colorBg} transition-colors`} />
          </button>
        }
        align="right"
      />
      <GroupAssignDropdown
        projectId={project.id}
        currentGroup={group}
        onRefresh={row.handleGitRefresh}
        onError={onError}
      />
      <IconButton onClick={row.handleOpenLog} title="Commit history" hoverColor="purple">
        <ClockIcon />
      </IconButton>
      <IconButton onClick={row.handleRefresh} title="Refresh" hoverColor="gray">
        <span className={row.refreshing ? "animate-spin inline-block text-sm" : "text-sm"}>
          &#x21BB;
        </span>
      </IconButton>
      <ProjectContextMenu
        projectId={project.id}
        currentColor={localColor}
        path={project.path}
        onSuccess={onSuccess}
        onError={onError}
        onOpenBranchManager={row.handleOpenBranchMgr}
        onOpenTagManager={row.handleOpenTagMgr}
        onOpenLogViewer={row.handleOpenLog}
        onOpenAiReview={row.handleOpenAiReview}
        onColorChange={handleColorChange}
        onEditDescription={row.handleEditDescription}
        notes={project.notes}
        onEditNotes={row.handleEditNotes}
      />
      <IconButton onClick={row.handleRemove} title="Remove project" hoverColor="red">
        <CloseIcon />
      </IconButton>
    </>
  );
});

// ── Modals ──────────────────────────────────────────────────────────────────

function RowModals({ detail, row }: { detail: ProjectDetail; row: RowState }) {
  const { onSuccess, onError } = useProjectActions();
  const { project, current_branch, branches } = detail;

  return (
    <>
      {row.logOpen && (
        <Suspense fallback={null}>
          <GitLogViewer
            path={project.path}
            projectName={project.name}
            open
            onClose={row.handleCloseLog}
            unpushedCount={detail.status.ahead}
            onRefresh={row.handleGitRefresh}
          />
        </Suspense>
      )}
      {row.branchMgrOpen && (
        <Suspense fallback={null}>
          <BranchManager
            path={project.path}
            branches={branches}
            currentBranch={current_branch}
            open
            onClose={row.handleCloseBranchMgr}
            onRefresh={row.handleGitRefresh}
            onSuccess={onSuccess}
            onError={onError}
          />
        </Suspense>
      )}
      {row.aiReviewOpen && (
        <Suspense fallback={null}>
          <AiReviewDialog
            open
            onClose={row.handleCloseAiReview}
            projectPath={project.path}
            projectName={project.name}
            branches={branches}
            currentBranch={current_branch}
            onSuccess={onSuccess}
            onError={onError}
          />
        </Suspense>
      )}
      {row.tagMgrOpen && (
        <Suspense fallback={null}>
          <TagManager
            path={project.path}
            open
            onClose={row.handleCloseTagMgr}
            onSuccess={onSuccess}
            onError={onError}
          />
        </Suspense>
      )}
    </>
  );
}

// ── Error Banner ────────────────────────────────────────────────────────────

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="px-4 pb-2">
      <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
        {error}
      </div>
    </div>
  );
}

// ── Shell Component ─────────────────────────────────────────────────────────

/**
 * Provides shared logic (useProjectRow), modals, and action buttons for a
 * single project row. View components supply only layout via the `children`
 * render prop.
 */
export const ProjectRowShell = memo(function ProjectRowShell({
  detail,
  children,
}: ProjectRowShellProps) {
  const { onSwitchBranch, onRefresh, onRemove, getAnyActiveOp, cancelOp } = useProjectActions();

  // Confirm dialog state for dirty branch switch
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState<ReactNode>(null);
  const confirmResolveRef = useRef<((v: boolean) => void) | null>(null);

  // Cleanup: resolve pending promise on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      confirmResolveRef.current?.(false);
      confirmResolveRef.current = null;
    };
  }, []);

  const handleConfirmDirtySwitch = useCallback((branch: string, modified: number, untracked: number): Promise<boolean> => {
    // Resolve any prior pending promise to prevent leak
    confirmResolveRef.current?.(false);
    confirmResolveRef.current = null;

    const total = modified + untracked;
    setConfirmMsg(
      <>
        This project has <strong>{total}</strong> uncommitted change(s).
        <br />
        Switching to "<strong>{branch}</strong>" may discard them.
        <br /><br />
        Do you want to continue?
      </>
    );
    setConfirmOpen(true);
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
    });
  }, []);

  const handleConfirmProceed = useCallback(() => {
    confirmResolveRef.current?.(true);
    confirmResolveRef.current = null;
    setConfirmOpen(false);
  }, []);

  const handleConfirmCancel = useCallback(() => {
    confirmResolveRef.current?.(false);
    confirmResolveRef.current = null;
    setConfirmOpen(false);
  }, []);

  const row = useProjectRow({
    detail,
    onSwitchBranch,
    onRefresh,
    onRemove,
    onConfirmDirtySwitch: handleConfirmDirtySwitch,
  });

  // Check for any active git operation on this project
  const activeOp = getAnyActiveOp
    ? getAnyActiveOp(detail.project.path)
    : undefined;

  const hasActiveOp = !!activeOp;
  const activeOpIndicator = activeOp
    ? <ActiveOpBanner op={activeOp} onCancel={cancelOp ? () => cancelOp(activeOp.id) : undefined} />
    : null;

  const actionButtons = <ActionButtons detail={detail} row={row} />;
  const errorBanner = <ErrorBanner error={row.error} />;

  return (
    <>
      {children({ detail, row, actionButtons, errorBanner, activeOpIndicator, hasActiveOp })}
      <RowModals detail={detail} row={row} />
      <ConfirmDialog
        open={confirmOpen}
        title="Uncommitted Changes"
        message={confirmMsg}
        confirmLabel="Switch Branch"
        confirmColor="blue"
        onConfirm={handleConfirmProceed}
        onCancel={handleConfirmCancel}
      />
    </>
  );
});

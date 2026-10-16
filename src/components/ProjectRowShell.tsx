import { memo, useState, useEffect, useCallback, useRef, lazy, Suspense, type ReactNode } from "react";
import type { ProjectDetail, Group } from "../lib/types";
import { PROJECT_COLORS, parseError } from "../lib/types";
import { IconButton, Modal } from "./ui/primitives";
import { ClockIcon, CloseIcon } from "./ui/icons";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { ColorPicker } from "./ColorPicker";
import { GroupAssignDropdown } from "./ProjectGroupsPanel";
import { ConfirmDialog } from "./ConfirmDialog";
import { useProjectRow } from "../hooks/useProjectRow";
import { useContextMenu } from "../hooks/useContextMenu";
import { setProjectDescription, setProjectNotes, setProjectColor, setProjectAlias, listGroups, assignToGroup } from "../lib/tauri";
import { useTranslation, Trans } from "react-i18next";
import { useProjectActions } from "../context/ProjectContext";
import { isDirtyChord } from "../lib/heldKeys";
import type { ActiveGitOp } from "../hooks/useGitOpTracker";

const GitLogViewer = lazy(() => import("./GitLogViewer"));
const BranchManager = lazy(() => import("./BranchManager"));
const AiReviewDialog = lazy(() => import("./AiReviewDialog"));
const TagManager = lazy(() => import("./TagManager"));
const StashManager = lazy(() =>
  import("./StashManager").then((m) => ({ default: m.StashManager }))
);

// Matches spec §2.6 rule 2: interactive controls keep the native menu.
const ROW_MENU_SKIP = 'button, input, textarea, a, [role="button"]';

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
  const { t } = useTranslation();
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
          placeholder={t("row.description.placeholder")}
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
        title={t("row.description.edit")}
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
  const { t } = useTranslation();
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
        if (isDirtyChord(e)) return;
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
          placeholder={t("row.notes.placeholder")}
          rows={3}
          className="w-full text-xs px-1.5 py-1 rounded border border-blue-400 dark:border-blue-500 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:ring-1 focus:ring-blue-400 resize-none"
        />
        <div className="flex items-center gap-1.5 mt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-2 py-0.5 text-xs rounded bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors"
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={saving}
            className="px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-600 dark:text-gray-300 disabled:opacity-50 transition-colors"
          >
            {t("common.cancel")}
          </button>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
            {t("row.notes.saveHint")}
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
          {t("row.notes.empty")}
        </span>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover/notes:opacity-100 shrink-0 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
        title={t("row.notes.edit")}
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
  /** Bind to the row root element to open its right-click menu. */
  onRowContextMenu: (e: React.MouseEvent) => void;
  /** Bind to the row root element so Shift+F10 / the ContextMenu key opens the same menu. */
  onRowKeyDown: (e: React.KeyboardEvent) => void;
}

interface ProjectRowShellProps {
  detail: ProjectDetail;
  children: (props: RowRenderProps) => ReactNode;
}

// ── Active Op Indicator ─────────────────────────────────────────────────────

const OP_LABEL_KEYS: Record<string, "row.op.switch_branch" | "row.op.commit" | "row.op.push" | "row.op.pull" | "row.op.fetch" | "row.op.stash" | "row.op.pop" | "row.op.merge" | "row.op.cherry_pick" | "row.op.rebase" | "row.op.delete_branch" | "row.op.create_branch"> = {
  switch_branch: "row.op.switch_branch",
  commit: "row.op.commit",
  push: "row.op.push",
  pull: "row.op.pull",
  fetch: "row.op.fetch",
  stash: "row.op.stash",
  pop: "row.op.pop",
  merge: "row.op.merge",
  cherry_pick: "row.op.cherry_pick",
  rebase: "row.op.rebase",
  delete_branch: "row.op.delete_branch",
  create_branch: "row.op.create_branch",
};

function ActiveOpBanner({ op, onCancel }: { op: ActiveGitOp; onCancel?: () => void }) {
  const { t } = useTranslation();
  const label = OP_LABEL_KEYS[op.op] ? t(OP_LABEL_KEYS[op.op]) : op.op;
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
            {t("row.op.elapsed", { time: elapsed })}
          </span>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            className="ml-auto px-1.5 py-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-400 transition-colors"
            title={t("row.op.cancel")}
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
  contextAnchor,
  contextOnClose,
  onAssignGroup,
  onEditAlias,
}: {
  detail: ProjectDetail;
  row: RowState;
  contextAnchor: { x: number; y: number } | null;
  contextOnClose: () => void;
  onAssignGroup: () => void;
  onEditAlias: () => void;
}) {
  const { t } = useTranslation();
  const { onSuccess, onError, onColorChange: syncProjectColor, onFetch, onPull, onPush, isOpActive } = useProjectActions();
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

  const fetchBusy = fetching || !!isOpActive?.("fetch", project.path);
  const pullBusy = pulling || !!isOpActive?.("pull", project.path);
  const pushBusy = pushing || !!isOpActive?.("push", project.path);

  return (
    <>
      {row.recent && (
        <button
          onClick={row.handleRunRecentCommand}
          aria-label={t("row.buttons.run", { command: row.recent.command })}
          title={t("row.buttons.run", { command: row.recent.command })}
          className="p-1.5 rounded-lg text-gray-400 opacity-50 hover:opacity-100 transition-all duration-150 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 active:scale-[0.95]"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.25 2.43a.75.75 0 011.12-.65l7.75 5.57a.75.75 0 010 1.3l-7.75 5.57a.75.75 0 01-1.12-.65V2.43z" />
          </svg>
        </button>
      )}
      {onFetch && (
        <button
          onClick={handleFetch}
          disabled={fetching}
          aria-label={t("row.buttons.fetch")}
          title={t("row.buttons.fetchTitle")}
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
          aria-label={t("row.buttons.pull")}
          title={t("row.buttons.pullTitle")}
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
          aria-label={t("row.buttons.push")}
          title={t("row.buttons.pushTitle")}
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
            onSuccess(color ? t("row.color.set", { color }) : t("row.color.removed"));
          } catch (e) {
            onError(String(e));
          }
        }}
        trigger={
          <button
            type="button"
            title={t("row.color.title")}
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
      <IconButton onClick={row.handleOpenLog} title={t("row.buttons.log")} hoverColor="purple">
        <ClockIcon />
      </IconButton>
      <IconButton onClick={row.handleRefresh} title={t("row.buttons.refresh")} hoverColor="gray">
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
        onRunFetch={handleFetch}
        fetching={fetchBusy}
        onRunPull={handlePull}
        pulling={pullBusy}
        onRunPush={handlePush}
        pushing={pushBusy}
        onOpenStashManager={row.handleOpenStashMgr}
        onOpenBuiltInTerminal={row.handleOpenBuiltInTerminal}
        onRunProjectScript={row.handleRunProjectScript}
        title={project.name}
        onColorChange={handleColorChange}
        onEditDescription={row.handleEditDescription}
        notes={project.notes}
        onEditNotes={row.handleEditNotes}
        onRefresh={row.handleRefresh}
        onAssignGroup={onAssignGroup}
        onEditAlias={onEditAlias}
        onRemoveProject={row.handleRemove}
        contextAnchor={contextAnchor}
        contextOnClose={contextOnClose}
      />
      <IconButton onClick={row.handleRemove} title={t("row.buttons.remove")} hoverColor="red">
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
            onSuccess={onSuccess}
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
      {row.stashMgrOpen && (
        <Suspense fallback={null}>
          <StashManager
            path={project.path}
            open
            onClose={row.handleCloseStashMgr}
            onRefresh={row.handleGitRefresh}
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
      <div className="select-text px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
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
  const { onSwitchBranch, onRefresh, onRemove, getAnyActiveOp, cancelOp, onSuccess, onError, onAliasChange } = useProjectActions();
  const { t } = useTranslation();

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

    // `modified` already includes staged changes (see useProjectRow).
    const total = modified + untracked;
    setConfirmMsg(
      <>
        <Trans i18nKey="row.switchMessage.hasChanges" values={{ total }} components={{ strong: <strong /> }} />
        <br />
        <Trans i18nKey="row.switchMessage.mayDiscard" values={{ branch }} components={{ strong: <strong /> }} />
        <br /><br />
        {t("row.switchMessage.continue")}
      </>
    );
    setConfirmOpen(true);
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
    });
  }, [t]);

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

  const contextMenu = useContextMenu();

  // Menu + metadata dialogs opened from the row context menu.
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [assignableGroups, setAssignableGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [aliasEditorOpen, setAliasEditorOpen] = useState(false);
  const [aliasValue, setAliasValue] = useState("");
  const [savingAlias, setSavingAlias] = useState(false);

  const loadGroups = useCallback(async () => {
    setGroupsError(null);
    setLoadingGroups(true);
    try {
      setAssignableGroups(await listGroups());
    } catch (e) {
      setGroupsError(parseError(e));
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  const openGroupPicker = useCallback(() => {
    setGroupPickerOpen(true);
    void loadGroups();
  }, [loadGroups]);

  const handleAssignGroup = useCallback(
    async (groupId: string) => {
      try {
        await assignToGroup(detail.project.id, groupId);
        await row.handleGitRefresh();
        setGroupPickerOpen(false);
        onSuccess(t("row.group.updated"));
      } catch (e) {
        onError(parseError(e));
      }
    },
    [detail.project.id, row.handleGitRefresh, onSuccess, onError, t]
  );

  const openAliasEditor = useCallback(() => {
    setAliasValue(detail.project.alias ?? "");
    setAliasEditorOpen(true);
  }, [detail.project.alias]);

  const handleSaveAlias = useCallback(async () => {
    const next = aliasValue.trim();
    setSavingAlias(true);
    try {
      if (onAliasChange) await onAliasChange(detail.project.id, next);
      else await setProjectAlias(detail.project.id, next);
      setAliasEditorOpen(false);
      onSuccess(next ? t("row.alias.set", { name: next }) : t("row.alias.cleared"));
    } catch (e) {
      onError(parseError(e));
    } finally {
      setSavingAlias(false);
    }
  }, [aliasValue, onAliasChange, detail.project.id, onSuccess, onError, t]);

  // Right-clicking interactive controls (or a text selection) keeps the native
  // menu; useContextMenu also bails out when text is selected.
  const onRowContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(ROW_MENU_SKIP)) {
        return;
      }
      contextMenu.onContextMenu(e);
    },
    [contextMenu.onContextMenu]
  );

  // Shift+F10 / the ContextMenu key mirrors the mouse path: same skip rule,
  // menu anchored just inside the row's top-left corner, row takes focus.
  const onRowKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest(ROW_MENU_SKIP)) return;
      const rowEl = e.currentTarget as HTMLElement;
      const rect = rowEl.getBoundingClientRect();
      e.preventDefault();
      rowEl.focus();
      rowEl.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 8,
          clientY: rect.top + 8,
        })
      );
    },
    []
  );

  // Check for any active git operation on this project
  const activeOp = getAnyActiveOp
    ? getAnyActiveOp(detail.project.path)
    : undefined;

  const hasActiveOp = !!activeOp;
  const activeOpIndicator = activeOp
    ? <ActiveOpBanner op={activeOp} onCancel={cancelOp ? () => cancelOp(activeOp.id) : undefined} />
    : null;

  const actionButtons = (
    <ActionButtons
      detail={detail}
      row={row}
      contextAnchor={contextMenu.anchor}
      contextOnClose={contextMenu.close}
      onAssignGroup={openGroupPicker}
      onEditAlias={openAliasEditor}
    />
  );
  const errorBanner = <ErrorBanner error={row.error} />;

  return (
    <>
      {children({ detail, row, actionButtons, errorBanner, activeOpIndicator, hasActiveOp, onRowContextMenu, onRowKeyDown })}
      <RowModals detail={detail} row={row} />
      <Modal
        open={groupPickerOpen}
        onClose={() => setGroupPickerOpen(false)}
        title={t("row.group.title")}
        subtitle={detail.project.name}
        width="sm"
        compact
      >
        <div className="p-2 space-y-0.5">
          {loadingGroups ? (
            <p className="px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400">{t("groups.loading")}</p>
          ) : groupsError ? (
            <div className="px-2 py-1.5 space-y-1.5">
              <p className="text-sm text-red-600 dark:text-red-400">{t("groups.loadFailed")}</p>
              <button
                type="button"
                onClick={() => void loadGroups()}
                className="text-xs px-2 py-1 rounded-lg border border-(--border-color) text-gray-600 dark:text-gray-300 hover:bg-[var(--surface-2)] transition-colors"
              >
                {t("groups.retry")}
              </button>
            </div>
          ) : assignableGroups.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400">{t("row.group.empty")}</p>
          ) : (
            assignableGroups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => handleAssignGroup(g.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  g.id === detail.project.group_id
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                    : "text-gray-700 dark:text-gray-200 hover:bg-[var(--surface-2)]"
                }`}
              >
                {g.name}
              </button>
            ))
          )}
        </div>
      </Modal>
      <Modal
        open={aliasEditorOpen}
        onClose={() => setAliasEditorOpen(false)}
        title={t("row.alias.title")}
        subtitle={detail.project.name}
        width="sm"
        compact
      >
        <div className="p-4 space-y-3">
          <input
            type="text"
            value={aliasValue}
            onChange={(e) => setAliasValue(e.target.value.slice(0, 100))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSaveAlias();
              }
            }}
            maxLength={100}
            disabled={savingAlias}
            placeholder={t("row.alias.placeholder")}
            className="w-full text-sm px-2 py-1.5 rounded-lg border border-(--border-color) bg-[var(--surface-2)] text-gray-900 dark:text-gray-100 outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAliasEditorOpen(false)}
              className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-[var(--surface-2)] transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleSaveAlias()}
              disabled={savingAlias}
              className="px-3 py-1.5 rounded-lg text-sm bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors"
            >
              {savingAlias ? t("row.savingEllipsis") : t("common.save")}
            </button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmOpen}
        title={t("row.switch.title")}
        message={confirmMsg}
        confirmLabel={t("row.switch.confirm")}
        confirmColor="blue"
        onConfirm={handleConfirmProceed}
        onCancel={handleConfirmCancel}
      />
    </>
  );
});

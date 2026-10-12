import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import * as api from "../lib/tauri";
import type { Group } from "../lib/types";
import { parseError } from "../lib/types";
import { useDropdownPortal } from "../hooks/useDropdownPortal";
import { useContextMenu } from "../hooks/useContextMenu";
import { FolderIcon } from "./ui/icons";
import { popoverAnimation, MenuItem } from "./ui/primitives";
import { ContextMenu, MenuSeparator } from "./ui/ContextMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { useTranslation } from "react-i18next";

// Module-level groups cache shared across all GroupAssignDropdown instances
let _groupsCache: Group[] | null = null;
let _groupsCacheTime = 0;
const GROUPS_CACHE_TTL = 30_000; // 30 seconds

export function invalidateGroupsCache() {
  _groupsCache = null;
  _groupsCacheTime = 0;
}

interface ProjectGroupsPanelProps {
  activeGroup: string | null;
  onGroupChange: (groupId: string | null) => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const ProjectGroupsPanel = memo(function ProjectGroupsPanel({
  activeGroup,
  onGroupChange,
  onSuccess,
  onError,
}: ProjectGroupsPanelProps) {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<Group[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3B82F6");
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingSaving, setRenamingSaving] = useState(false);
  const [recoloringId, setRecoloringId] = useState<string | null>(null);
  const [contextGroup, setContextGroup] = useState<Group | null>(null);
  const { onContextMenu, menuProps } = useContextMenu();

  const loadGroups = useCallback(async () => {
    try {
      const g = await api.listGroups();
      setGroups(g);
    } catch (e) {
      onError(t("groups.loadError", { error: String(e) }));
    }
  }, [onError, t]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const [creating, setCreating] = useState(false);
  const handleCreate = useCallback(async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const g = await api.createGroup(newName.trim(), newColor);
      invalidateGroupsCache();
      setGroups((prev) => [...prev, g]);
      setNewName("");
      setShowCreate(false);
      onSuccess(t("groups.created", { name: g.name }));
    } catch (e) {
      onError(parseError(e));
    } finally {
      setCreating(false);
    }
  }, [newName, newColor, creating, onSuccess, onError, t]);

  const doDelete = useCallback(
    async (id: string, name: string) => {
      try {
        await api.deleteGroup(id);
        invalidateGroupsCache();
        setGroups((prev) => prev.filter((g) => g.id !== id));
        if (activeGroup === id) onGroupChange(null);
        onSuccess(t("groups.deleted", { name }));
      } catch (e) {
        onError(parseError(e));
      }
    },
    [activeGroup, onGroupChange, onSuccess, onError, t]
  );

  const handleDelete = useCallback(
    (id: string, name: string) => {
      setDeleteConfirm({ id, name });
    },
    []
  );

  const toggleShowCreate = useCallback(() => setShowCreate((v) => !v), []);
  const handleShowAll = useCallback(() => onGroupChange(null), [onGroupChange]);

  const startRename = useCallback((g: Group) => {
    setRenamingId(g.id);
    setRenameValue(g.name);
  }, []);

  const submitRename = useCallback(
    async (g: Group) => {
      if (renamingSaving) return;
      const name = renameValue.trim();
      if (!name || name === g.name) {
        setRenamingId(null);
        return;
      }
      setRenamingSaving(true);
      try {
        const updated = await api.updateGroup({ ...g, name });
        invalidateGroupsCache();
        setGroups((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        setRenamingId(null);
        onSuccess(t("groups.renamedTo", { name: updated.name }));
      } catch (e) {
        onError(parseError(e));
      } finally {
        setRenamingSaving(false);
      }
    },
    [renameValue, renamingSaving, onSuccess, onError, t]
  );

  const handleCopyName = useCallback(
    (g: Group) => {
      navigator.clipboard.writeText(g.name).then(
        () => onSuccess(t("groups.copiedName", { name: g.name })),
        (e) => onError(parseError(e))
      );
    },
    [onSuccess, onError, t]
  );

  const startRecolor = useCallback((g: Group) => {
    setRenamingId(null);
    setRecoloringId(g.id);
  }, []);

  const submitColor = useCallback(
    async (g: Group, color: string) => {
      if (color === g.color) {
        setRecoloringId(null);
        return;
      }
      try {
        const updated = await api.updateGroup({ ...g, color });
        invalidateGroupsCache();
        setGroups((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        setRecoloringId(null);
        onSuccess(t("groups.colorChanged", { color: updated.color }));
      } catch (e) {
        onError(parseError(e));
      }
    },
    [onSuccess, onError, t]
  );

  // The inline color state (like rename) leaves on Escape or a click outside
  // the swatch row; either way nothing is written until a color is chosen.
  useEffect(() => {
    if (!recoloringId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRecoloringId(null);
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element) || !target.closest("[data-recolor-row]")) {
        setRecoloringId(null);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [recoloringId]);

  const handleRowContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, g: Group) => {
      const target = e.target;
      if (target instanceof Element) {
        // The row's own select button is the entry itself, so only the ✕
        // delete button (which carries an aria-label) and other form
        // controls keep the native browser menu.
        if (target.closest('input, textarea, a, [role="button"], button[aria-label]')) return;
      }
      e.preventDefault();
      setContextGroup(g);
      onContextMenu(e);
    },
    [onContextMenu]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {t("groups.title")}
        </h3>
        <button
          onClick={toggleShowCreate}
          aria-expanded={showCreate}
          aria-label={showCreate ? t("groups.cancelAria") : t("groups.createAria")}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          {showCreate ? t("common.cancel") : t("groups.new")}
        </button>
      </div>

      {/* All projects button */}
      <button
        onClick={handleShowAll}
        aria-current={activeGroup === null ? "true" : undefined}
        className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
          activeGroup === null
            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
      >
        {t("groups.allProjects")}
      </button>

      {/* Group list */}
      {groups.map((g) => (
        <div
          key={g.id}
          className="flex items-center gap-1 group"
          onContextMenu={(e) => handleRowContextMenu(e, g)}
        >
          {g.id === recoloringId ? (
            <div
              data-recolor-row
              className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30"
            >
              <input
                type="color"
                value={g.color || "#6B7280"}
                onChange={(e) => submitColor(g, e.target.value)}
                aria-label={t("groups.colorAria")}
                className="w-8 h-8 rounded cursor-pointer"
              />
              <span className="flex-1 text-sm text-blue-700 dark:text-blue-300 font-medium">{g.name}</span>
            </div>
          ) : g.id === renamingId ? (
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename(g);
                else if (e.key === "Escape") setRenamingId(null);
              }}
              onBlur={() => submitRename(g)}
              disabled={renamingSaving}
              aria-label={t("groups.nameAria")}
              className="flex-1 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <button
              onClick={() => onGroupChange(g.id)}
              aria-current={activeGroup === g.id ? "true" : undefined}
              className={`flex-1 text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2 ${
                activeGroup === g.id
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: g.color || "#6B7280" }}
              />
              {g.name}
            </button>
          )}
          <button
            onClick={() => handleDelete(g.id, g.name)}
            className="p-1 rounded text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            aria-label={t("groups.deleteAria", { name: g.name })}
            title={t("groups.deleteTitle")}
          >
            &#x2715;
          </button>
        </div>
      ))}

      {/* Create form */}
      {showCreate && (
        <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder={t("groups.namePlaceholder")}
            aria-label={t("groups.nameAria")}
            className="w-full px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              aria-label={t("groups.colorAria")}
              className="w-8 h-8 rounded cursor-pointer"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="flex-1 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-xs font-medium transition-colors"
            >
              {creating ? t("groups.creating") : t("groups.create")}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title={t("groups.deleteConfirmTitle")}
        message={deleteConfirm ? t("groups.deleteConfirmMessage", { name: deleteConfirm.name }) : null}
        confirmLabel={t("groups.delete")}
        confirmColor="red"
        onConfirm={async () => { if (deleteConfirm) { try { await doDelete(deleteConfirm.id, deleteConfirm.name); } finally { setDeleteConfirm(null); } } }}
        onCancel={() => setDeleteConfirm(null)}
      />

      <ContextMenu {...menuProps}>
        <MenuItem
          label={t("groups.rename")}
          disabled={renamingSaving}
          onClick={() => {
            if (contextGroup) startRename(contextGroup);
          }}
        />
        <MenuItem
          label={t("groups.changeColor")}
          onClick={() => {
            if (contextGroup) startRecolor(contextGroup);
          }}
        />
        <MenuItem label={t("groups.newGroup")} onClick={toggleShowCreate} />
        <MenuItem
          label={t("groups.copyName")}
          onClick={() => {
            if (contextGroup) handleCopyName(contextGroup);
          }}
        />
        <MenuSeparator />
        <MenuItem
          label={t("groups.deleteGroup")}
          danger
          onClick={() => {
            if (contextGroup) handleDelete(contextGroup.id, contextGroup.name);
          }}
        />
      </ContextMenu>
    </div>
  );
});

// ── Group assignment dropdown for project cards ──────────────────────────

interface GroupAssignDropdownProps {
  projectId: string;
  currentGroup: Group;
  onRefresh: () => void;
  onError: (msg: string) => void;
}

export const GroupAssignDropdown = memo(function GroupAssignDropdown({
  projectId,
  currentGroup,
  onRefresh,
  onError,
}: GroupAssignDropdownProps) {
  const { t } = useTranslation();
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
  const {
    open, search, setSearch, activeIndex, setActiveIndex,
    pos, triggerRef, inputRef, listRef, portalRef,
    toggle, handleKeyDown,
  } = useDropdownPortal({ minWidth: 200, align: "right" });

  // Clear pending state once parent has been refreshed
  useEffect(() => {
    if (pendingGroupId !== null) setPendingGroupId(null);
  }, [currentGroup, pendingGroupId]);

  // Fetch groups when dropdown opens (with shared cache)
  useEffect(() => {
    if (!open) return;
    const now = Date.now();
    if (_groupsCache && now - _groupsCacheTime < GROUPS_CACHE_TTL) {
      setAllGroups(_groupsCache);
      return;
    }
    let cancelled = false;
    api.listGroups().then((groups) => {
      _groupsCache = groups;
      _groupsCacheTime = Date.now();
      if (!cancelled) setAllGroups(groups);
    }).catch((e) => {
      if (!cancelled) onError(t("groups.loadError", { error: String(e) }));
    });
    return () => { cancelled = true; };
  }, [open, onError, t]);

  // Clear pending state when dropdown closes
  useEffect(() => {
    if (!open) setPendingGroupId(null);
  }, [open]);

  const filtered = useMemo(
    () => allGroups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase())),
    [allGroups, search]
  );

  const handleSelect = useCallback(
    async (group: Group) => {
      if (group.id === currentGroup.id) return;
      setPendingGroupId(group.id);
      try {
        await api.assignToGroup(projectId, group.id);
        await onRefresh();
      } catch (e) {
        setPendingGroupId(null);
        onError(parseError(e));
      }
    },
    [projectId, currentGroup, onRefresh, onError]
  );

  const handleSelectByIndex = useCallback(
    (index: number) => {
      if (filtered[index]) handleSelect(filtered[index]);
    },
    [filtered, handleSelect]
  );

  return (
    <div ref={triggerRef} className="relative">
      <button
        onClick={toggle}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        aria-label={t("groups.manageGroups")}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t("groups.manageGroups")}
      >
        <FolderIcon />
      </button>

      {open && createPortal(
        <div
          ref={portalRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className={`origin-top-left max-h-80 bg-(--surface-1) border border-(--border-color) rounded-xl shadow-lg overflow-hidden ${popoverAnimation}`}
        >
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, handleSelectByIndex, filtered.length)}
              placeholder={t("groups.searchPlaceholder")}
              aria-label={t("groups.searchAria")}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div ref={listRef} role="listbox" aria-label={t("groups.listAria")} className="overflow-y-auto max-h-65">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                {allGroups.length === 0 ? t("groups.empty") : t("groups.notFound")}
              </div>
            ) : (
              filtered.map((g, i) => {
                const selectedId = pendingGroupId ?? currentGroup.id;
                const isSelected = g.id === selectedId;
                const isActive = i === activeIndex;
                return (
                  <button
                    key={g.id}
                    data-index={i}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(g)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                      isActive ? "bg-blue-100 dark:bg-blue-900/30" : "hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: g.color || "#6B7280" }}
                    />
                    <span className="flex-1">{g.name}</span>
                    {isSelected && <span className="text-blue-500 text-xs">&#x25CF;</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});

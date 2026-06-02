import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import * as api from "../lib/tauri";
import type { Group } from "../lib/types";
import { useDropdownPortal } from "../hooks/useDropdownPortal";

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
  const [groups, setGroups] = useState<Group[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3B82F6");

  const loadGroups = useCallback(async () => {
    try {
      const g = await api.listGroups();
      setGroups(g);
    } catch (e) {
      onError(`Failed to load groups: ${e}`);
    }
  }, [onError]);

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
      onSuccess(`Created group "${g.name}"`);
    } catch (e) {
      onError(String(e));
    } finally {
      setCreating(false);
    }
  }, [newName, newColor, creating, onSuccess, onError]);

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      try {
        await api.deleteGroup(id);
        invalidateGroupsCache();
        setGroups((prev) => prev.filter((g) => g.id !== id));
        if (activeGroup === id) onGroupChange(null);
        onSuccess(`Deleted group "${name}"`);
      } catch (e) {
        onError(String(e));
      }
    },
    [activeGroup, onGroupChange, onSuccess, onError]
  );

  const toggleShowCreate = useCallback(() => setShowCreate((v) => !v), []);
  const handleShowAll = useCallback(() => onGroupChange(null), [onGroupChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Groups
        </h3>
        <button
          onClick={toggleShowCreate}
          aria-expanded={showCreate}
          aria-label={showCreate ? "Cancel new group" : "Create new group"}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          {showCreate ? "Cancel" : "+ New"}
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
        All Projects
      </button>

      {/* Group list */}
      {groups.map((g) => (
        <div key={g.id} className="flex items-center gap-1 group">
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
          <button
            onClick={() => handleDelete(g.id, g.name)}
            className="p-1 rounded text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            aria-label={`Delete group ${g.name}`}
            title="Delete group"
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
            placeholder="Group name"
            aria-label="Group name"
            className="w-full px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              aria-label="Group color"
              className="w-8 h-8 rounded cursor-pointer"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="flex-1 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-xs font-medium transition-colors"
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}
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
  }, [currentGroup]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (!cancelled) onError(`Failed to load groups: ${e}`);
    });
    return () => { cancelled = true; };
  }, [open, onError]);

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
        onError(String(e));
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
        aria-label="Manage groups"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Manage groups"
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1h-6a1 1 0 00-1 1v6.708A2.486 2.486 0 014.5 9h6V1.5z" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={portalRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="max-h-80 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden"
        >
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, handleSelectByIndex, filtered.length)}
              placeholder="Search groups..."
              aria-label="Search groups"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div ref={listRef} role="listbox" aria-label="Groups" className="overflow-y-auto max-h-65">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                {allGroups.length === 0 ? "No groups yet" : "No groups found"}
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

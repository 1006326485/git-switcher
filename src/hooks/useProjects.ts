import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectDetail } from "../lib/types";
import { parseError } from "../lib/types";
import * as api from "../lib/tauri";

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

export function useProjects(toast?: ToastApi, activeGroup?: string | null) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectsVersion, setProjectsVersion] = useState(0);

  // ── Refresh bookkeeping ─────────────────────────────────────────────────
  // `loading` above is the ONE-SHOT first paint (skeleton). Everything that
  // re-reads existing projects goes through the state below instead, so a
  // background or manual refresh never flashes the skeleton back over data
  // the user is already reading — it just raises a weak "updating" cue.
  //
  // A generation counter guards the two writers that can race: a refreshAll
  // started before an optimistic branch switch (or before any other refresh)
  // must not overwrite what landed in the meantime with its older snapshot.
  const [refreshAllCount, setRefreshAllCount] = useState(0);
  const [refreshingPaths, setRefreshingPaths] = useState<Set<string>>(() => new Set());
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const dataGenerationRef = useRef(0);
  const refreshAllInFlightRef = useRef<Promise<void> | null>(null);
  const projectRefreshesRef = useRef(new Map<string, Promise<ProjectDetail>>());
  const tRef = useRef(t);
  tRef.current = t;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const groupRef = useRef(activeGroup);
  groupRef.current = activeGroup;

  const rebuildTray = useCallback(() => {
    api.rebuildTrayMenu().catch(() => {});
  }, []);
  const defaultGroupIdRef = useRef<string | null>(null);

  /** Marks local data as newer than any read that is already in flight. */
  const markDataChanged = useCallback(() => {
    dataGenerationRef.current++;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await api.listProjects();
        if (!cancelled) {
          setProjects(data);
          setLastRefreshedAt(Date.now());
        }
      } catch (e) {
        if (!cancelled) toastRef.current?.error(tRef.current("projects.loadFailed", { error: parseError(e) }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const resolveGroupId = useCallback(async (): Promise<string> => {
    const gid = groupRef.current;
    if (gid) return gid;
    if (defaultGroupIdRef.current) return defaultGroupIdRef.current;
    const groups = await api.listGroups();
    if (groups.length === 0) throw new Error(tRef.current("projects.noGroups"));
    defaultGroupIdRef.current = groups[0].id;
    return groups[0].id;
  }, []);

  const addProject = useCallback(
    async (path: string) => {
      try {
        const groupId = await resolveGroupId();
        const detail = await api.addProject(path, groupId);
        markDataChanged();
        setProjects((prev) => [...prev, detail]);
        setProjectsVersion((v) => v + 1);
        toastRef.current?.success(tRef.current("projects.added", { name: detail.project.name }));
        rebuildTray();
        return detail;
      } catch (e) {
        toastRef.current?.error(tRef.current("projects.addFailed", { error: parseError(e) }));
        throw e;
      }
    },
    [resolveGroupId, rebuildTray]
  );

  const removeProject = useCallback(
    async (id: string) => {
      try {
        await api.removeProject(id);
        markDataChanged();
        setProjects((prev) => prev.filter((p) => p.project.id !== id));
        setProjectsVersion((v) => v + 1);
        rebuildTray();
      } catch (e) {
        toastRef.current?.error(tRef.current("projects.removeFailed", { error: parseError(e) }));
        throw e;
      }
    },
    [rebuildTray]
  );

  const importWorkspace = useCallback(
    async (filePath: string) => {
      try {
        const groupId = await resolveGroupId();
        const newProjects = await api.importWorkspace(filePath, groupId);
        markDataChanged();
        setProjects((prev) => [
          ...prev.filter((p) => !newProjects.some((n) => n.project.path === p.project.path)),
          ...newProjects,
        ]);
        setProjectsVersion((v) => v + 1);
        toastRef.current?.success(tRef.current("projects.imported", { count: newProjects.length }));
        rebuildTray();
        return newProjects;
      } catch (e) {
        const msg = String(e);
        if (msg.includes("already exist")) {
          toastRef.current?.info(msg);
        } else {
          toastRef.current?.error(tRef.current("projects.importFailed", { error: msg }));
        }
        throw e;
      }
    },
    [resolveGroupId, rebuildTray]
  );

  const initProject = useCallback(
    async (path: string, name: string) => {
      try {
        const groupId = await resolveGroupId();
        const detail = await api.initGitProject(path, name, groupId);
        markDataChanged();
        setProjects((prev) => [...prev, detail]);
        setProjectsVersion((v) => v + 1);
        toastRef.current?.success(tRef.current("projects.initialized", { name }));
        rebuildTray();
        return detail;
      } catch (e) {
        toastRef.current?.error(tRef.current("projects.initFailed", { error: parseError(e) }));
        throw e;
      }
    },
    [resolveGroupId, rebuildTray]
  );

  const switchBranch = useCallback(
    async (path: string, branch: string) => {
      const prev = projectsRef.current.find((p) => p.project.path === path);
      if (!prev) {
        try {
          const detail = await api.switchBranch(path, branch);
          setProjects((prevList) =>
            prevList.map((p) => (p.project.path === path ? detail : p))
          );
          setProjectsVersion((v) => v + 1);
          toastRef.current?.success(tRef.current("projects.switchedTo", { branch }));
          return detail;
        } catch (e) {
          toastRef.current?.error(tRef.current("projects.switchFailed", { error: parseError(e) }));
          throw e;
        }
      }

      // Optimistic: immediately show new branch. Bumping the generation keeps
      // an older in-flight refreshAll from repainting the pre-switch branch.
      markDataChanged();
      const optimisticDetail: ProjectDetail = {
        ...prev,
        current_branch: branch,
      };
      setProjects((prevList) =>
        prevList.map((p) => (p.project.path === path ? optimisticDetail : p))
      );

      try {
        const detail = await api.switchBranch(path, branch);
        // Replace optimistic with real data
        setProjects((prevList) =>
          prevList.map((p) => (p.project.path === path ? detail : p))
        );
        setProjectsVersion((v) => v + 1);
        toastRef.current?.success(tRef.current("projects.switchedNameTo", { name: detail.project.name, branch }));
        return detail;
      } catch (e) {
        // Rollback optimistic update
        markDataChanged();
        setProjects((prevList) =>
          prevList.map((p) => (p.project.path === path ? prev : p))
        );
        toastRef.current?.error(tRef.current("projects.switchFailed", { error: parseError(e) }));
        throw e;
      }
    },
    []
  );

  /**
   * Commits a list_projects snapshot, preserving object identity for every
   * project whose observable fields did not change so memo'd rows skip the
   * re-render (and the row-level CSS) entirely.
   */
  const applyList = useCallback((data: ProjectDetail[]) => {
    setProjects((prev) => {
      if (prev.length !== data.length) return data;
      const prevMap = new Map(prev.map((p) => [p.project.path, p]));
      let changed = false;
      const next = data.map((d) => {
        const old = prevMap.get(d.project.path);
        // Branch identity must be compared by content, not just count: an
        // external tool may add/remove/rename branches or flip merge state
        // while current_branch and length stay the same.
        const branchesEqual =
          old !== undefined &&
          old.branches.length === d.branches.length &&
          old.branches.every(
            (b, i) =>
              b.name === d.branches[i]?.name &&
              b.is_current === d.branches[i]?.is_current &&
              b.is_remote === d.branches[i]?.is_remote &&
              b.is_merged === d.branches[i]?.is_merged &&
              b.is_tag === d.branches[i]?.is_tag
          );
        if (old && old.current_branch === d.current_branch
          && old.status.modified === d.status.modified
          && old.status.staged === d.status.staged
          && old.status.untracked === d.status.untracked
          && old.status.ahead === d.status.ahead
          && old.status.behind === d.status.behind
          && (old.status.is_merging ?? false) === (d.status.is_merging ?? false)
          && old.stash_count === d.stash_count
          && branchesEqual
          && old.project.last_commit_hash === d.project.last_commit_hash
          && old.project.group_id === d.project.group_id) {
          return old;
        }
        changed = true;
        return d;
      });
      return changed ? next : prev;
    });
  }, []);

  /** Marks a path busy while its refresh runs; tolerant of concurrent callers. */
  const markPathRefreshing = useCallback((path: string, active: boolean) => {
    setRefreshingPaths((prev) => {
      if (active === prev.has(path)) return prev;
      const next = new Set(prev);
      if (active) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);

  const refreshProject = useCallback(
    (path: string) => {
      // Coalesce: a key-repeat on Space or a double-click issued while the
      // same project is already refreshing joins the in-flight read instead
      // of queueing a second git walk against the same repository.
      const inFlight = projectRefreshesRef.current.get(path);
      if (inFlight) return inFlight;

      markPathRefreshing(path, true);
      let run!: Promise<ProjectDetail>;
      run = (async () => {
        // Read *after* the coalescing map is claimed: a switchBranch that
        // bumps the generation while this read is in flight must win.
        const startedAt = dataGenerationRef.current;
        try {
          const detail = await api.refreshProject(path);
          // A newer writer (switch, remove, refreshAll) landed while this read
          // was in flight: its data is fresher than ours, so drop the result.
          if (startedAt !== dataGenerationRef.current) return detail;
          const oldGroup = projectsRef.current.find((p) => p.project.path === path)?.project.group_id;
          setProjects((prev) =>
            prev.map((p) => (p.project.path === path ? detail : p))
          );
          if (oldGroup && oldGroup !== detail.project.group_id) {
            setProjectsVersion((v) => v + 1);
          }
          return detail;
        } catch (e) {
          toastRef.current?.error(tRef.current("projects.refreshFailed", { error: parseError(e) }));
          throw e;
        } finally {
          // A caller that started after this run ended owns the slot now;
          // only the owner may release it (otherwise a second refresh would
          // lose its busy state).
          if (projectRefreshesRef.current.get(path) === run) {
            projectRefreshesRef.current.delete(path);
            markPathRefreshing(path, false);
          }
          setLastRefreshedAt(Date.now());
        }
      })();
      projectRefreshesRef.current.set(path, run);
      return run;
    },
    [markPathRefreshing]
  );

  const refreshAll = useCallback(() => {
    // Every entry point (timer, focus, tray, Cmd+R, undo, import) shares one
    // in-flight read: hammering Cmd+R used to queue concurrent list_projects
    // calls whose results could land out of order.
    if (refreshAllInFlightRef.current) return refreshAllInFlightRef.current;

    let startedAt = dataGenerationRef.current;
    // A read that finishes after local data changed (a switch, an import) is
    // stale — but the caller still expects a repaint of the new truth, so it
    // re-reads once instead of dropping the request. A read that coalesced
    // into the previous one also replays the *latest* generation here.
    const run = (async () => {
      setRefreshAllCount((n) => n + 1);
      try {
        // Bounded: each retry costs a real list_projects, and the list only
        // advances when local data actually changed underneath us.
        for (let attempt = 0; attempt < 3; attempt++) {
          const data = await api.listProjects();
          if (startedAt === dataGenerationRef.current) {
            applyList(data);
            return;
          }
          startedAt = dataGenerationRef.current;
        }
      } catch (e) {
        toastRef.current?.error(tRef.current("projects.refreshAllFailed", { error: parseError(e) }));
      } finally {
        refreshAllInFlightRef.current = null;
        setRefreshAllCount((n) => Math.max(0, n - 1));
        setLastRefreshedAt(Date.now());
      }
    })();
    refreshAllInFlightRef.current = run;
    return run;
  }, [applyList]);

  const updateAlias = useCallback(
    async (id: string, alias: string) => {
      try {
        await api.setProjectAlias(id, alias);
        setProjects((prev) =>
          prev.map((p) =>
            p.project.id === id
              ? { ...p, project: { ...p.project, alias } }
              : p
          )
        );
        rebuildTray();
      } catch (e) {
        toastRef.current?.error(tRef.current("projects.aliasFailed", { error: parseError(e) }));
        throw e;
      }
    },
    [rebuildTray]
  );

  const setProjectColorLocally = useCallback((id: string, color: string | null) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.project.id === id
          ? { ...p, project: { ...p.project, color: color ?? undefined } }
          : p
      )
    );
  }, []);

  const reorderProjects = useCallback(
    async (orderedIds: string[]) => {
      // Optimistic update: reorder locally first
      const prev = projectsRef.current;
      const idIndex = new Map(orderedIds.map((id, i) => [id, i]));
      const reordered = [...prev].sort((a, b) => {
        const ai = idIndex.get(a.project.id) ?? Infinity;
        const bi = idIndex.get(b.project.id) ?? Infinity;
        return ai - bi;
      });
      setProjects(reordered);

      try {
        await api.reorderProjects(orderedIds);
      } catch (e) {
        // Rollback on failure
        setProjects(prev);
        toastRef.current?.error(tRef.current("projects.reorderFailed", { error: parseError(e) }));
        throw e;
      }
    },
    []
  );

  // Aggregated "is something being re-read" signal for the header status area.
  // Deliberately separate from `loading` (first paint) so refreshes keep the
  // list on screen.
  const isRefreshing = refreshAllCount > 0 || refreshingPaths.size > 0;
  const refreshingProjectCount = refreshingPaths.size;

  return {
    projects,
    loading,
    projectsVersion,
    /** True while any refreshAll or per-project refresh is in flight. */
    isRefreshing,
    /** Number of projects being refreshed individually right now. */
    refreshingProjectCount,
    /** Paths currently refreshing — lets a row paint its own busy state. */
    refreshingPaths,
    /** Wall-clock time of the last completed refresh (first paint included). */
    lastRefreshedAt,
    /** True while the whole list is being re-read (vs. a single project). */
    isRefreshingAll: refreshAllCount > 0,
    addProject,
    removeProject,
    importWorkspace,
    initProject,
    switchBranch,
    refreshProject,
    refreshAll,
    updateAlias,
    setProjectColorLocally,
    reorderProjects,
  };
}

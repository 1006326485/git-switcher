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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await api.listProjects();
        if (!cancelled) setProjects(data);
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
        setProjects((prev) => [...prev, ...newProjects]);
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

      // Optimistic: immediately show new branch
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
        setProjects((prevList) =>
          prevList.map((p) => (p.project.path === path ? prev : p))
        );
        toastRef.current?.error(tRef.current("projects.switchFailed", { error: parseError(e) }));
        throw e;
      }
    },
    []
  );

  const refreshProject = useCallback(async (path: string) => {
    try {
      const detail = await api.refreshProject(path);
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
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const data = await api.listProjects();
      setProjects((prev) => {
        // Preserve object references for unchanged projects so memo'd children skip re-render
        if (prev.length !== data.length) return data;
        const prevMap = new Map(prev.map((p) => [p.project.path, p]));
        let changed = false;
        const next = data.map((d) => {
          const old = prevMap.get(d.project.path);
          if (old && old.current_branch === d.current_branch
            && old.status.modified === d.status.modified
            && old.status.staged === d.status.staged
            && old.status.untracked === d.status.untracked
            && old.status.ahead === d.status.ahead
            && old.status.behind === d.status.behind
            && old.project.last_commit_hash === d.project.last_commit_hash
            && old.project.group_id === d.project.group_id) {
            return old;
          }
          changed = true;
          return d;
        });
        return changed ? next : prev;
      });
    } catch (e) {
      toastRef.current?.error(tRef.current("projects.refreshAllFailed", { error: parseError(e) }));
    }
  }, []);

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

  return {
    projects,
    loading,
    projectsVersion,
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

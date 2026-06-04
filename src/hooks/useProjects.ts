import { useState, useEffect, useCallback, useRef } from "react";
import type { ProjectDetail } from "../lib/types";
import * as api from "../lib/tauri";

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

export function useProjects(toast?: ToastApi, activeGroup?: string | null) {
  const [projects, setProjects] = useState<ProjectDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectsVersion, setProjectsVersion] = useState(0);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const groupRef = useRef(activeGroup);
  groupRef.current = activeGroup;
  const defaultGroupIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await api.listProjects();
        if (!cancelled) setProjects(data);
      } catch (e) {
        if (!cancelled) toastRef.current?.error(`Failed to load projects: ${e}`);
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
    if (groups.length === 0) throw new Error("No groups exist");
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
        toastRef.current?.success(`Added "${detail.project.name}"`);
        return detail;
      } catch (e) {
        toastRef.current?.error(`Failed to add project: ${e}`);
        throw e;
      }
    },
    [resolveGroupId]
  );

  const removeProject = useCallback(
    async (id: string) => {
      try {
        await api.removeProject(id);
        setProjects((prev) => prev.filter((p) => p.project.id !== id));
        setProjectsVersion((v) => v + 1);
      } catch (e) {
        toastRef.current?.error(`Failed to remove project: ${e}`);
        throw e;
      }
    },
    []
  );

  const importWorkspace = useCallback(
    async (filePath: string) => {
      try {
        const groupId = await resolveGroupId();
        const newProjects = await api.importWorkspace(filePath, groupId);
        setProjects((prev) => [...prev, ...newProjects]);
        setProjectsVersion((v) => v + 1);
        toastRef.current?.success(`Imported ${newProjects.length} project(s)`);
        return newProjects;
      } catch (e) {
        const msg = String(e);
        if (msg.includes("already exist")) {
          toastRef.current?.info(msg);
        } else {
          toastRef.current?.error(`Failed to import workspace: ${msg}`);
        }
        throw e;
      }
    },
    [resolveGroupId]
  );

  const initProject = useCallback(
    async (path: string, name: string) => {
      try {
        const groupId = await resolveGroupId();
        const detail = await api.initGitProject(path, name, groupId);
        setProjects((prev) => [...prev, detail]);
        setProjectsVersion((v) => v + 1);
        toastRef.current?.success(`Initialized "${name}"`);
        return detail;
      } catch (e) {
        toastRef.current?.error(`Failed to init project: ${e}`);
        throw e;
      }
    },
    [resolveGroupId]
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
          toastRef.current?.success(`Switched to ${branch}`);
          return detail;
        } catch (e) {
          toastRef.current?.error(`Failed to switch branch: ${e}`);
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
        toastRef.current?.success(`Switched "${detail.project.name}" to ${branch}`);
        return detail;
      } catch (e) {
        // Rollback optimistic update
        setProjects((prevList) =>
          prevList.map((p) => (p.project.path === path ? prev : p))
        );
        toastRef.current?.error(`Failed to switch branch: ${e}`);
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
      toastRef.current?.error(`Failed to refresh project: ${e}`);
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
      toastRef.current?.error(`Failed to refresh projects: ${e}`);
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
      } catch (e) {
        toastRef.current?.error(`Failed to update alias: ${e}`);
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
  };
}

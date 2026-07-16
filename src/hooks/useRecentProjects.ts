import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "git-switcher:recent-projects";
const MAX_RECENT = 5;

export interface RecentProject {
  id: string;
  name: string;
  lastBranch: string;
}

export function useRecentProjects() {
  const [recent, setRecent] = useState<RecentProject[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    } catch {
      // ignore quota errors
    }
  }, [recent]);

  const addRecent = useCallback((id: string, name: string, lastBranch: string) => {
    setRecent((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      return [{ id, name, lastBranch }, ...filtered].slice(0, MAX_RECENT);
    });
  }, []);

  return { recent, addRecent };
}

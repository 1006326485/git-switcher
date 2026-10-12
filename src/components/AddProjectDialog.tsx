import { useState, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../lib/tauri";
import type { ProjectDetail } from "../lib/types";
import { Modal, Tabs } from "./ui/primitives";

interface AddProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onAddProject: (path: string) => Promise<ProjectDetail>;
  onImportWorkspace: (filePath: string) => Promise<ProjectDetail[]>;
  onInitProject: (path: string, name: string) => Promise<ProjectDetail>;
}

type Tab = "add" | "init";

export const AddProjectDialog = memo(function AddProjectDialog({
  open,
  onClose,
  onAddProject,
  onImportWorkspace,
  onInitProject,
}: AddProjectDialogProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("add");
  const [initPath, setInitPath] = useState("");
  const [initName, setInitName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddExisting = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const path = await api.pickDirectory();
      if (path) {
        await onAddProject(path);
        onClose();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [onAddProject, onClose]);

  const handleImportWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filePath = await api.pickWorkspaceFile();
      if (filePath) {
        await onImportWorkspace(filePath);
        onClose();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [onImportWorkspace, onClose]);

  const handleInit = useCallback(async () => {
    if (!initPath || !initName) return;
    setLoading(true);
    setError(null);
    try {
      await onInitProject(initPath, initName);
      setInitPath("");
      setInitName("");
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [initPath, initName, onInitProject, onClose]);

  const handlePickInitPath = useCallback(async () => {
    const path = await api.pickDirectory();
    if (path) {
      setInitPath(path);
      if (!initName) {
        const parts = path.split(/[/\\]/);
        setInitName(parts[parts.length - 1] || "");
      }
    }
  }, [initName]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={t("addProject.title")} width="lg">
      <Tabs
        tabs={[
          { value: "add", label: t("addProject.tabAdd") },
          { value: "init", label: t("addProject.tabInit") },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="px-6 py-5">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {tab === "add" ? (
          <div className="space-y-3">
            <button
              onClick={handleAddExisting}
              disabled={loading}
              className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors text-left"
            >
              <div className="font-medium text-gray-900 dark:text-gray-100">{t("addProject.openFolder")}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {t("addProject.openFolderDesc")}
              </div>
            </button>

            <button
              onClick={handleImportWorkspace}
              disabled={loading}
              className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-colors text-left"
            >
              <div className="font-medium text-gray-900 dark:text-gray-100">
                {t("addProject.importWorkspace")}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {t("addProject.importWorkspaceDesc")}
              </div>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("addProject.pathLabel")}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={initPath}
                  onChange={(e) => setInitPath(e.target.value)}
                  placeholder="/path/to/new/repo"
                  aria-label={t("addProject.pathAria")}
                  className="flex-1 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <button
                  onClick={handlePickInitPath}
                  className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] hover:bg-gray-200 dark:hover:bg-gray-600 text-sm transition-colors duration-150 active:scale-[0.98]"
                >
                  {t("addProject.browse")}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("addProject.nameLabel")}
              </label>
              <input
                type="text"
                value={initName}
                onChange={(e) => setInitName(e.target.value)}
                placeholder={t("addProject.namePlaceholder")}
                aria-label={t("addProject.nameAria")}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <button
              onClick={handleInit}
              disabled={loading || !initPath || !initName}
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-gray-400 text-white font-medium text-sm transition-colors duration-150 active:scale-[0.98]"
            >
              {loading ? t("addProject.creating") : t("addProject.initRepo")}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
});
export default AddProjectDialog;

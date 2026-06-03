import { useState, useCallback, memo } from "react";
import * as api from "../lib/tauri";
import { Modal, Tabs } from "./ui/primitives";
import { save, open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";

interface ExportImportDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onImportDone: () => void;
  activeGroup?: string | null;
}

export const ExportImportDialog = memo(function ExportImportDialog({
  open,
  onClose,
  onSuccess,
  onError,
  onImportDone,
  activeGroup,
}: ExportImportDialogProps) {
  const [tab, setTab] = useState<"export" | "import">("export");
  const [loading, setLoading] = useState(false);
  const [importJson, setImportJson] = useState("");

  const handleExport = useCallback(async () => {
    setLoading(true);
    try {
      const json = await api.exportProjects();
      try {
        await navigator.clipboard.writeText(json);
      } catch {
        throw new Error("Clipboard access denied — check browser permissions");
      }
      onSuccess("Project list copied to clipboard");
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  }, [onSuccess, onError]);

  const handleExportToFile = useCallback(async () => {
    setLoading(true);
    try {
      const json = await api.exportProjects();
      const filePath = await save({
        filters: [{ name: "JSON", extensions: ["json"] }],
        defaultPath: "git-switcher-projects.json",
      });
      if (filePath) {
        await writeTextFile(filePath, json);
        onSuccess(`Exported to ${filePath}`);
      }
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  }, [onSuccess, onError]);

  const handleImportJson = useCallback(async () => {
    if (!importJson.trim()) return;
    setLoading(true);
    try {
      const groupId = activeGroup || (await api.listGroups())[0]?.id;
      if (!groupId) {
        onError("No groups exist — please create a group first");
        return;
      }
      const results = await api.importProjects(importJson, groupId);
      onSuccess(`Imported ${results.length} project(s)`);
      setImportJson("");
      onImportDone();
      onClose();
    } catch (e) {
      const msg = String(e);
      if (msg.includes("already exist")) {
        onSuccess(msg);
        setImportJson("");
        onImportDone();
        onClose();
      } else {
        onError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [importJson, activeGroup, onSuccess, onError, onImportDone, onClose]);

  const handleImportFromFile = useCallback(async () => {
    setLoading(true);
    try {
      const filePath = await openFileDialog({
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (filePath) {
        const json = await readTextFile(filePath as string);
        setImportJson(json);
        onSuccess("File loaded — click Import to proceed");
      }
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  }, [onSuccess, onError]);

  return (
    <Modal open={open} onClose={onClose} title="Export / Import Projects" maxWidth="max-w-lg">
      <Tabs
        tabs={[
          { value: "export", label: "Export" },
          { value: "import", label: "Import" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="px-6 py-5">
        {tab === "export" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Export your project list as JSON. This will copy the data to your clipboard.
            </p>
            <button
              onClick={handleExport}
              disabled={loading}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium text-sm transition-colors"
            >
              {loading ? "Exporting..." : "Export to Clipboard"}
            </button>
            <button
              onClick={handleExportToFile}
              disabled={loading}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-medium text-sm transition-colors"
            >
              {loading ? "Exporting..." : "Save to File"}
            </button>
          </div>
        )}

        {tab === "import" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Paste exported JSON below to import projects. Existing projects are skipped.
            </p>
            <button
              onClick={handleImportFromFile}
              disabled={loading}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-medium text-sm transition-colors"
            >
              {loading ? "Loading..." : "Load from File"}
            </button>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='[{"id":"...","name":"...","path":"/path/to/repo",...}]'
              aria-label="Import JSON"
              rows={8}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 resize-none"
            />
            <button
              onClick={handleImportJson}
              disabled={!importJson.trim() || loading}
              className="w-full px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium text-sm transition-colors"
            >
              {loading ? "Importing..." : "Import Projects"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
});

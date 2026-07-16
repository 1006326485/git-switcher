import { memo, useState, useCallback } from "react";
import { Modal, Tabs } from "./ui/primitives";
import { GeneralSettings } from "./GeneralSettings";
import { LlmSettings } from "./LlmSettings";
import { BackgroundSettings } from "./BackgroundSettings";
import * as api from "../lib/tauri";
import { parseError } from "../lib/types";
import { APP_VERSION } from "../lib/appVersion";
import { save, open as openFileDialog } from "@tauri-apps/plugin-dialog";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  accentColor?: string;
  onAccentChange?: (color: string) => void;
}

export const SettingsDialog = memo(function SettingsDialog({ open, onClose, onSuccess, onError, accentColor, onAccentChange }: SettingsDialogProps) {
  const [tab, setTab] = useState<"general" | "llm" | "background" | "data" | "about">("general");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const filePath = await save({
        filters: [{ name: "JSON", extensions: ["json"] }],
        defaultPath: "git-switcher-backup.json",
      });
      if (filePath) {
        await api.exportAllSettings(filePath);
        onSuccess(`Settings exported to ${filePath}`);
      }
    } catch (e) {
      onError(parseError(e));
    } finally {
      setExporting(false);
    }
  }, [onSuccess, onError]);

  const handleImport = useCallback(async () => {
    setImporting(true);
    try {
      const filePath = await openFileDialog({
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (filePath) {
        const result = await api.importAllSettings(filePath as string);
        onSuccess(
          `Imported: settings applied, ${result.groups_imported} group(s), ${result.projects_imported} project(s), ${result.projects_skipped} skipped`
        );
        onClose();
      }
    } catch (e) {
      onError(parseError(e));
    } finally {
      setImporting(false);
    }
  }, [onSuccess, onError, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Settings" maxWidth="max-w-lg">
      <Tabs
        tabs={[
          { value: "general", label: "General" },
          { value: "llm", label: "AI Review" },
          { value: "background", label: "Background" },
          { value: "data", label: "Data" },
          { value: "about", label: "About" },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="px-6 py-5">
        {tab === "general" && <GeneralSettings onError={onError} accentColor={accentColor} onAccentChange={onAccentChange} />}
        {tab === "llm" && <LlmSettings onError={onError} />}
        {tab === "background" && <BackgroundSettings onError={onError} />}
        {tab === "data" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Export all settings, projects, and groups to a JSON file, or import from a previous export.
            </p>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium text-sm transition-colors"
            >
              {exporting ? "Exporting..." : "Export Settings"}
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="w-full px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium text-sm transition-colors"
            >
              {importing ? "Importing..." : "Import Settings"}
            </button>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Existing groups are matched by name; existing projects (by path) are skipped.
            </p>
          </div>
        )}
        {tab === "about" && (
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Git Switcher v{APP_VERSION}</p>
            <p>Multi-repo Git management tool with AI-powered code review.</p>
            <div className="text-xs text-gray-400">
              <p>Built with Tauri v2 + React + TypeScript + Rust</p>
              <p>AI Review uses OpenAI-compatible API (GPT, Claude, Ollama, etc.)</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
});
export default SettingsDialog;

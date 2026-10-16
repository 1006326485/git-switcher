import { memo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Tabs } from "./ui/primitives";
import { GeneralSettings } from "./GeneralSettings";
import { LlmSettings } from "./LlmSettings";
import { BackgroundSettings } from "./BackgroundSettings";
import { CustomCommandsManager } from "./CustomCommandsManager";
import { CredentialsSettings } from "./CredentialsSettings";
import { TraySettings } from "./TraySettings";
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
  const { t } = useTranslation();
  const [tab, setTab] = useState<"general" | "llm" | "background" | "credentials" | "tray" | "commands" | "data" | "about">("general");
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
        onSuccess(t("settings.data.exportedTo", { path: filePath }));
      }
    } catch (e) {
      onError(parseError(e));
    } finally {
      setExporting(false);
    }
  }, [onSuccess, onError, t]);

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
          t("settings.data.imported", {
            groups: result.groups_imported,
            projects: result.projects_imported,
            skipped: result.projects_skipped,
          })
        );
        onClose();
      }
    } catch (e) {
      onError(parseError(e));
    } finally {
      setImporting(false);
    }
  }, [onSuccess, onError, onClose, t]);

  return (
    <Modal open={open} onClose={onClose} title={t("settings.title")} width="lg">
      <Tabs
        tabs={[
          { value: "general", label: t("settings.tabs.general") },
          { value: "llm", label: t("settings.tabs.aiReview") },
          { value: "background", label: t("settings.tabs.background") },
          { value: "credentials", label: t("settings.tabs.credentials") },
          { value: "tray", label: t("settings.tabs.statusBar") },
          { value: "data", label: t("settings.tabs.data") },
          { value: "about", label: t("settings.tabs.about") },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="px-6 py-5 h-[min(60vh,520px)] overflow-y-auto">
        {tab === "general" && <GeneralSettings onError={onError} accentColor={accentColor} onAccentChange={onAccentChange} />}
        {tab === "llm" && <LlmSettings onError={onError} />}
        {tab === "background" && <BackgroundSettings onError={onError} />}
        {tab === "credentials" && <CredentialsSettings onError={onError} />}
        {tab === "tray" && <TraySettings onError={onError} />}
        {tab === "commands" && <CustomCommandsManager onError={onError} />}
        {tab === "data" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("settings.data.description")}
            </p>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium text-sm transition-colors"
            >
              {exporting ? t("settings.data.exporting") : t("settings.data.export")}
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="w-full px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium text-sm transition-colors"
            >
              {importing ? t("settings.data.importing") : t("settings.data.import")}
            </button>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t("settings.data.note")}
            </p>
          </div>
        )}
        {tab === "about" && (
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p className="font-semibold text-gray-900 dark:text-gray-100">{t("settings.about.title", { version: APP_VERSION })}</p>
            <p>{t("settings.about.tagline")}</p>
            <div className="text-xs text-gray-400">
              <p>{t("settings.about.stack")}</p>
              <p>{t("settings.about.aiNote")}</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
});
export default SettingsDialog;

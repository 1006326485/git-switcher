import { useState, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { createArchive } from "../lib/tauri";
import { SelectDropdown } from "./ui/SelectDropdown";
import { Modal, PrimaryButton } from "./ui/primitives";

const FORMAT_OPTIONS = [
  { value: "zip", label: "ZIP (.zip)" },
  { value: "tar.gz", label: "TAR.GZ (.tar.gz)" },
];

const FORMAT_EXTENSIONS: Record<string, string> = {
  zip: "zip",
  "tar.gz": "tar.gz",
};

interface Props {
  open: boolean;
  onClose: () => void;
  repoPath: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export default memo(function ExportArchiveDialog({
  open,
  onClose,
  repoPath,
  onSuccess,
  onError,
}: Props) {
  const { t } = useTranslation();
  const [format, setFormat] = useState("zip");
  const [loading, setLoading] = useState(false);

  const handleExport = useCallback(async () => {
    const ext = FORMAT_EXTENSIONS[format];
    const filePath = await save({
      filters: [{ name: format.toUpperCase(), extensions: [ext] }],
      defaultPath: `archive.${ext}`,
    });
    if (!filePath) return;

    setLoading(true);
    try {
      const result = await createArchive(repoPath, format, filePath);
      onSuccess(t("exportArchive.exportedTo", { path: result }));
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "object" && e !== null && "message" in e ? String((e as { message: unknown }).message) : String(e);
      onError(t("exportArchive.failed", { msg }));
    } finally {
      setLoading(false);
    }
  }, [repoPath, format, onSuccess, onError, onClose, t]);

  return (
    <Modal open={open} onClose={onClose} title={t("exportArchive.title")}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t("exportArchive.formatLabel")}</label>
          <SelectDropdown
            options={FORMAT_OPTIONS.map((o) => ({
              ...o,
              label: o.value === "tar.gz" ? t("exportArchive.tarGz") : t("exportArchive.zip"),
            }))}
            value={format}
            onChange={setFormat}
            ariaLabel={t("exportArchive.formatAria")}
          />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t("exportArchive.desc")}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {t("common.cancel")}
          </button>
          <PrimaryButton onClick={handleExport} disabled={loading}>
            {loading ? t("exportArchive.exporting") : t("exportArchive.exportBtn")}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
});

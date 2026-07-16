import { useState, useCallback, memo } from "react";
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
      onSuccess(`Archive exported to ${result}`);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "object" && e !== null && "message" in e ? String((e as { message: unknown }).message) : String(e);
      onError(`Archive failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [repoPath, format, onSuccess, onError, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Export Archive">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Format</label>
          <SelectDropdown
            options={FORMAT_OPTIONS}
            value={format}
            onChange={setFormat}
            ariaLabel="Archive format"
          />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Exports the current HEAD of the repository as an archive, without .git history.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <PrimaryButton onClick={handleExport} disabled={loading}>
            {loading ? "Exporting..." : "Export"}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
});

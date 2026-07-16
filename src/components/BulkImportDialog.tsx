import { useState, useCallback, memo, useEffect } from "react";
import * as api from "../lib/tauri";
import { parseError } from "../lib/types";
import type { Group } from "../lib/types";
import { Modal } from "./ui/primitives";

type Step = "select" | "review" | "importing" | "done";

interface BulkImportDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onImportDone: () => void;
  activeGroup?: string | null;
}

export const BulkImportDialog = memo(function BulkImportDialog({
  open,
  onClose,
  onSuccess,
  onError,
  onImportDone,
  activeGroup,
}: BulkImportDialogProps) {
  const [step, setStep] = useState<Step>("select");
  const [scanPath, setScanPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [repos, setRepos] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Load groups when dialog opens
  useEffect(() => {
    if (!open) return;
    api.listGroups().then((g) => {
      setGroups(g);
      if (activeGroup && g.some((gr) => gr.id === activeGroup)) {
        setSelectedGroup(activeGroup);
      } else if (g.length > 0) {
        setSelectedGroup(g[0].id);
      }
    }).catch(() => {});
    // Reset state
    setStep("select");
    setScanPath("");
    setRepos([]);
    setSelected(new Set());
    setImportResult(null);
    setError(null);
  }, [open, activeGroup]);

  const handlePickDirectory = useCallback(async () => {
    const path = await api.pickDirectory();
    if (path) setScanPath(path);
  }, []);

  const handleScan = useCallback(async () => {
    if (!scanPath) return;
    setScanning(true);
    setError(null);
    try {
      const found = await api.scanDirectoryForRepos(scanPath);
      setRepos(found);
      setSelected(new Set(found));
      setStep("review");
    } catch (e) {
      setError(parseError(e));
    } finally {
      setScanning(false);
    }
  }, [scanPath]);

  const toggleRepo = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(repos)), [repos]);
  const deselectAll = useCallback(() => setSelected(new Set()), []);

  const handleImport = useCallback(async () => {
    if (selected.size === 0 || !selectedGroup) return;
    setImporting(true);
    setError(null);
    try {
      const result = await api.bulkImportProjects(
        Array.from(selected),
        selectedGroup,
      );
      setImportResult({
        imported: result.imported.length,
        skipped: result.skipped,
        errors: result.errors,
      });
      setStep("done");
      if (result.imported.length > 0) {
        onSuccess(`Imported ${result.imported.length} project(s)`);
        onImportDone();
      }
      if (result.skipped > 0) {
        onSuccess(`${result.skipped} already added (skipped)`);
      }
      for (const err of result.errors) {
        onError(err);
      }
    } catch (e) {
      setError(parseError(e));
    } finally {
      setImporting(false);
    }
  }, [selected, selectedGroup, onSuccess, onError, onImportDone]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Bulk Import" maxWidth="max-w-lg">
      <div className="px-6 py-5 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {step === "select" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Directory
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={scanPath}
                  onChange={(e) => setScanPath(e.target.value)}
                  placeholder="/path/to/projects"
                  className="flex-1 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <button
                  onClick={handlePickDirectory}
                  className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] hover:bg-gray-200 dark:hover:bg-gray-600 text-sm transition-colors duration-150 active:scale-[0.98]"
                >
                  Browse
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Scans up to 3 levels deep for git repositories
              </p>
            </div>

            {groups.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Import to Group
                </label>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={handleScan}
              disabled={!scanPath || scanning}
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-gray-400 text-white font-medium text-sm transition-colors duration-150 active:scale-[0.98]"
            >
              {scanning ? "Scanning..." : "Scan Directory"}
            </button>
          </>
        )}

        {step === "review" && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Found {repos.length} git repos &middot; {selected.size} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Select All
                </button>
                <button
                  onClick={deselectAll}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border-color)] divide-y divide-[var(--border-color)]">
              {repos.map((path) => (
                <label
                  key={path}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--surface-1)] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(path)}
                    onChange={() => toggleRepo(path)}
                    className="rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)]"
                  />
                  <span className="text-sm text-gray-800 dark:text-gray-200 truncate" title={path}>
                    {path}
                  </span>
                </label>
              ))}
            </div>

            {repos.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                No git repositories found in this directory
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setStep("select"); setRepos([]); }}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-sm font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={selected.size === 0 || importing}
                className="flex-1 px-4 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-gray-400 text-white font-medium text-sm transition-colors duration-150 active:scale-[0.98]"
              >
                {importing ? "Importing..." : `Import ${selected.size} Project(s)`}
              </button>
            </div>
          </>
        )}

        {step === "done" && importResult && (
          <>
            <div className="space-y-2">
              {importResult.imported > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Imported {importResult.imported} project(s)
                </div>
              )}
              {importResult.skipped > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
                  Skipped {importResult.skipped} already added
                </div>
              )}
              {importResult.errors.length > 0 && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 space-y-1">
                  {importResult.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium text-sm transition-colors duration-150 active:scale-[0.98]"
            >
              Done
            </button>
          </>
        )}
      </div>
    </Modal>
  );
});

export default BulkImportDialog;

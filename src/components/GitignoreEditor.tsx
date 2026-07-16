import { useState, useCallback, useEffect, memo, useRef } from "react";
import * as api from "../lib/tauri";
import { parseError } from "../lib/types";
import type { GitignoreTemplate } from "../lib/types";
import { Modal } from "./ui/primitives";

interface GitignoreEditorProps {
  open: boolean;
  path: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const GitignoreEditor = memo(function GitignoreEditor({
  open,
  path,
  onClose,
  onSuccess,
  onError,
}: GitignoreEditorProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<GitignoreTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([api.getGitignore(path), api.getGitignoreTemplates()])
      .then(([existing, tpls]) => {
        setContent(existing ?? "");
        setTemplates(tpls);
        setSelectedTemplate("");
      })
      .catch((e) => onError(parseError(e)))
      .finally(() => setLoading(false));
  }, [open, path, onError]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await api.saveGitignore(path, content);
      onSuccess(".gitignore saved");
      onClose();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setSaving(false);
    }
  }, [path, content, onSuccess, onError, onClose]);

  const handleAddTemplate = useCallback(() => {
    const tpl = templates.find((t) => t.name === selectedTemplate);
    if (!tpl) return;
    setContent((prev) => {
      const trimmed = prev.trimEnd();
      const separator = trimmed.length > 0 ? "\n\n" : "";
      return trimmed + separator + `# ── ${tpl.name} ──────────────────────────\n` + tpl.content;
    });
    setSelectedTemplate("");
  }, [templates, selectedTemplate]);

  const lineCount = content.split("\n").length;

  return (
    <Modal open={open} onClose={onClose} title="Edit .gitignore" maxWidth="max-w-2xl">
      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-gray-500">
          <span className="animate-spin mr-2">&#x21BB;</span>
          Loading...
        </div>
      ) : (
        <div className="space-y-3">
          {/* Template picker */}
          <div className="flex items-center gap-2">
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a template...</option>
              {templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddTemplate}
              disabled={!selectedTemplate}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 hover:bg-blue-200 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors"
            >
              Add Template
            </button>
          </div>

          {/* Editor area with line numbers */}
          <div className="flex rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] overflow-hidden">
            <div className="flex-shrink-0 py-2 pl-2 pr-1 text-right select-none bg-gray-50 dark:bg-gray-800/50 border-r border-[var(--border-color)]">
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} className="text-[11px] leading-[1.5rem] font-mono text-gray-400 dark:text-gray-500 h-6">
                  {i + 1}
                </div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              rows={Math.min(lineCount + 2, 24)}
              className="flex-1 min-w-0 p-2 text-sm font-mono leading-6 bg-transparent resize-y focus:outline-none text-gray-800 dark:text-gray-200 whitespace-pre"
              style={{ tabSize: 4 }}
            />
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {lineCount} line{lineCount !== 1 ? "s" : ""}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg text-sm font-medium bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-gray-400 text-white transition-colors"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
});

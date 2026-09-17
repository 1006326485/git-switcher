import { useState, useEffect, useCallback, memo } from "react";
import * as api from "../lib/tauri";
import type { CustomCommand } from "../lib/types";

interface CustomCommandsManagerProps {
  onError?: (msg: string) => void;
}

export const CustomCommandsManager = memo(function CustomCommandsManager({
  onError,
}: CustomCommandsManagerProps) {
  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listCustomCommands();
      setCommands(data);
    } catch {
      onError?.("Failed to load custom commands");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = useCallback(async () => {
    if (!name.trim() || !command.trim()) return;
    setAdding(true);
    try {
      const cmd = await api.createCustomCommand(
        name.trim(),
        command.trim(),
        shortcut.trim() || undefined,
      );
      setCommands((prev) => [...prev, cmd]);
      setName("");
      setCommand("");
      setShortcut("");
    } catch {
      onError?.("Failed to create custom command");
    } finally {
      setAdding(false);
    }
  }, [name, command, shortcut, onError]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.deleteCustomCommand(id);
      setCommands((prev) => prev.filter((c) => c.id !== id));
    } catch {
      onError?.("Failed to delete custom command");
    }
  }, [onError]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Custom Git Commands
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Define custom Git operations that appear in the command palette.
        </p>
      </div>

      {/* Add form */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Soft Reset Last"
            className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Git Command</label>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="e.g., reset --soft HEAD~1"
            className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="w-24">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Shortcut</label>
          <input
            type="text"
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder="e.g., ⌘⇧R"
            className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={adding || !name.trim() || !command.trim()}
          className="h-8 px-3 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
        >
          {adding ? "..." : "Add"}
        </button>
      </div>

      {/* Commands list */}
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : commands.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
          No custom commands yet. Add one above.
        </p>
      ) : (
        <div className="space-y-1">
          {commands.map((cmd) => (
            <div
              key={cmd.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 group"
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cmd.name}</span>
                <span className="ml-2 text-xs font-mono text-gray-500 dark:text-gray-400">{cmd.command}</span>
              </div>
              {cmd.shortcut && (
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{cmd.shortcut}</span>
              )}
              <button
                onClick={() => handleDelete(cmd.id)}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all shrink-0"
                title="Delete command"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default CustomCommandsManager;

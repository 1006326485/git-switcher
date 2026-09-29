import { memo } from "react";
import type { UndoPrompt } from "../hooks/useOperationHistory";
import { undoPlanLabel } from "../hooks/useOperationHistory";

/**
 * "Undo last operation" card shown at the top of the toast stack. When the
 * operation cannot be safely automated it points the user at ReflogView.
 */
export const OperationUndoCard = memo(function OperationUndoCard({
  prompt,
  onUndo,
  onDismiss,
}: {
  prompt: UndoPrompt;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const label = undoPlanLabel(prompt.record, prompt.plan);
  const undoable = prompt.plan.kind !== "manual";

  return (
    <div
      role="status"
      className="select-text pointer-events-auto relative flex flex-col gap-1.5 px-4 py-3 rounded-xl border shadow-lg dark:ring-1 dark:ring-white/10 text-sm font-medium overflow-hidden bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200"
    >
      <div className="flex items-center gap-2">
        <span className="text-base" aria-hidden="true">
          &#x21A9;
        </span>
        <span className="flex-1">{label}</span>
        {undoable && (
          <button
            onClick={onUndo}
            disabled={prompt.busy}
            aria-label="Undo last operation"
            className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 hover:bg-blue-300 dark:hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {prompt.busy ? "Undoing…" : "Undo"}
          </button>
        )}
        <button
          onClick={onDismiss}
          aria-label="Dismiss undo prompt"
          className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
        >
          ✕
        </button>
      </div>
      {!undoable && (
        <p className="text-xs opacity-80">
          This change is not safely reversible from here. Open ReflogView (project context menu → Tools) to
          recover a previous state.
        </p>
      )}
    </div>
  );
});

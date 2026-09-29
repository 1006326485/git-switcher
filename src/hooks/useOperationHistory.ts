import { useCallback, useEffect, useRef, useState } from "react";
import type { DestructiveOpKind, DestructiveOpRecord, UndoPlan } from "../lib/types";
import { parseError } from "../lib/types";
import * as api from "../lib/tauri";

/**
 * Decide how (or whether) a recorded destructive operation can be undone.
 * History rewrites roll back to the saved HEAD via reset --hard; a branch
 * switch goes back to the saved branch; without a captured snapshot only
 * manual recovery through ReflogView is safe.
 */
export function planUndo(record: DestructiveOpRecord): UndoPlan {
  const { kind, pre } = record;
  if (kind === "checkout") {
    if (pre.branch && !pre.branch.startsWith("(")) {
      return { kind: "checkout_branch", branch: pre.branch };
    }
    return { kind: "manual" };
  }
  if (pre.head) return { kind: "reset_hard", target: pre.head };
  return { kind: "manual" };
}

const OP_LABELS: Record<DestructiveOpKind, string> = {
  checkout: "branch switch",
  reset: "reset",
  merge: "merge",
  rebase: "rebase",
  cherry_pick: "cherry-pick",
  squash: "squash",
  reword: "reword",
  drop: "commit drop",
  revert: "revert",
  amend: "amend",
};

export function opLabel(kind: DestructiveOpKind): string {
  return OP_LABELS[kind];
}

/** Human-readable description of what the undo action will do. */
export function undoPlanLabel(record: DestructiveOpRecord, plan: UndoPlan): string {
  const what = opLabel(record.kind);
  if (plan.kind === "reset_hard") return `Undo ${what}: reset --hard back to ${plan.target.slice(0, 7)}`;
  if (plan.kind === "checkout_branch") return `Undo ${what}: switch back to ${plan.branch}`;
  return `Cannot undo ${what} automatically — recover via ReflogView`;
}

export interface UndoPrompt {
  record: DestructiveOpRecord;
  plan: UndoPlan;
  busy: boolean;
}

const PROMPT_VISIBLE_MS = 20_000;

/**
 * Tracks destructive git operations recorded by the lib/tauri wrappers and
 * drives the "undo last operation" prompt shown in the toast stack.
 */
export function useOperationHistory(opts: {
  onDone: (message: string) => void;
  onError: (message: string, rawError?: unknown) => void;
  onAfterUndo: () => void;
}) {
  const [prompt, setPrompt] = useState<UndoPrompt | null>(null);
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    api.setDestructiveOpRecorder((record) => {
      setPrompt({ record, plan: planUndo(record), busy: false });
    });
    return () => api.setDestructiveOpRecorder(null);
  }, []);

  // The prompt is transient: undo is only meaningful right after the op.
  useEffect(() => {
    if (!prompt) return;
    const timer = setTimeout(() => setPrompt(null), PROMPT_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [prompt]);

  const dismissUndo = useCallback(() => setPrompt(null), []);

  const undoLast = useCallback(async () => {
    const current = promptRef.current;
    if (!current) return;
    const { record, plan } = current;
    setPrompt({ ...current, busy: true });
    try {
      await api.runWithoutUndoRecording(async () => {
        if (plan.kind === "reset_hard") {
          await api.gitReset(record.path, plan.target, "hard");
        } else if (plan.kind === "checkout_branch") {
          await api.switchBranch(record.path, plan.branch);
        } else {
          throw new Error("This operation cannot be undone automatically. Use ReflogView to recover.");
        }
      });
      setPrompt(null);
      optsRef.current.onDone(`Undid ${opLabel(record.kind)}`);
      optsRef.current.onAfterUndo();
    } catch (e) {
      setPrompt(promptRef.current ? { ...promptRef.current, busy: false } : null);
      optsRef.current.onError(`Undo failed: ${parseError(e)}`, e);
    }
  }, []);

  return { undoPrompt: prompt, undoLast, dismissUndo };
}

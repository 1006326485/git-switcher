import { memo, useCallback, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Trans } from "react-i18next";
import type { ProjectDetail } from "../lib/types";
import { BranchDropdown } from "./BranchDropdown";
import { ConfirmDialog } from "./ConfirmDialog";

interface SwitchBranchControlProps {
  /** The project whose branch this control switches; null = not loaded. */
  detail: ProjectDetail | null;
  /** "header": compact pill for the terminal title band. */
  variant?: "header" | "sm";
  /** Switching in flight (disables the trigger). */
  disabled?: boolean;
  /** Performs the checkout; rejects on failure (caller surfaces the error). */
  onSwitch: (path: string, branch: string) => Promise<void>;
}

/**
 * Switch the git branch of the project in view, from inside the terminal
 * workspace. A checkout that would touch uncommitted work asks first (the
 * same confirmation the project rows use), so a terminal session never loses
 * its working tree silently.
 */
export const SwitchBranchControl = memo(function SwitchBranchControl({
  detail,
  variant = "header",
  disabled,
  onSwitch,
}: SwitchBranchControlProps) {
  const { t } = useTranslation();
  const [switching, setSwitching] = useState(false);
  const [pending, setPending] = useState<{ branch: string; modified: number; staged: number; untracked: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const runSwitch = useCallback(
    async (branch: string) => {
      if (!detail) return;
      setSwitching(true);
      try {
        await onSwitch(detail.project.path, branch);
      } catch {
        // The parent shows the error banner; keep the control usable.
      } finally {
        setSwitching(false);
      }
    },
    [detail, onSwitch]
  );

  const handleSwitch = useCallback(
    (branch: string) => {
      if (!detail) return;
      const { modified, staged, untracked } = detail.status;
      // Staged counts too: a pure-staged change would otherwise bypass the
      // confirmation and be carried across the checkout.
      if (modified > 0 || staged > 0 || untracked > 0) {
        setPending({ branch, modified, staged, untracked });
        setConfirmOpen(true);
        return;
      }
      void runSwitch(branch);
    },
    [detail, runSwitch]
  );

  const handleConfirm = useCallback(() => {
    const target = pending;
    setConfirmOpen(false);
    setPending(null);
    if (target) void runSwitch(target.branch);
  }, [pending, runSwitch]);

  const handleCancel = useCallback(() => {
    setConfirmOpen(false);
    setPending(null);
  }, []);

  // Keep the control's own right-click from opening the workspace canvas
  // menu underneath it (the branch list has its own copy affordance).
  const stopContext = useCallback((e: ReactMouseEvent) => e.stopPropagation(), []);

  return (
    <>
      <div
        className={variant === "header" ? "shrink-0 flex items-center" : "flex items-center min-w-0"}
        onContextMenu={stopContext}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <BranchDropdown
          currentBranch={detail?.current_branch ?? t("branch.unknown")}
          branches={detail?.branches ?? []}
          onSwitch={handleSwitch}
          loading={!detail || switching || disabled}
          variant={variant === "header" ? "compact" : "default"}
        />
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title={t("terminal.switchBranchTitle", { branch: pending?.branch ?? "" })}
        message={
          <Trans
            i18nKey="terminal.switchBranchDirty"
            values={{
              total: (pending?.modified ?? 0) + (pending?.staged ?? 0) + (pending?.untracked ?? 0),
              branch: pending?.branch ?? "",
            }}
            components={{ strong: <strong /> }}
          />
        }
        confirmLabel={t("terminal.switchBranchConfirm")}
        size="sm"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
});

export default SwitchBranchControl;

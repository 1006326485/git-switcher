import { memo } from "react";
import { createPortal } from "react-dom";
import { dialogAnimation, scrimAnimation } from "./ui/primitives";
import TerminalWorkspace, {
  type TerminalLaunchTarget,
  type WorkspaceLaunch,
} from "./TerminalWorkspace";

interface TerminalPanelProps {
  open: boolean;
  initial: TerminalLaunchTarget | null;
  workspaceLaunch: WorkspaceLaunch | null;
  onClose: () => void;
}

export const TerminalPanel = memo(function TerminalPanel({
  open,
  initial,
  workspaceLaunch,
  onClose,
}: TerminalPanelProps) {
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${
        open ? `bg-black/40 backdrop-blur-sm ${scrimAnimation}` : "hidden"
      }`}
      onClick={onClose}
    >
      <div
        className={`w-[calc(100vw-2rem)] max-w-6xl h-[min(85dvh,720px)] flex flex-col overflow-hidden rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] shadow-2xl ${open ? dialogAnimation : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <TerminalWorkspace
          open={open}
          initial={initial}
          workspaceLaunch={workspaceLaunch}
          onClose={onClose}
        />
      </div>
    </div>,
    document.body
  );
});

export default TerminalPanel;

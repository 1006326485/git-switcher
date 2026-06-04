import { useCallback, memo } from "react";
import * as api from "../lib/tauri";
import { DropdownMenu, MenuItem, IconButton } from "./ui/primitives";
import {
  KebabIcon,
  BranchIcon,
  ClockIcon,
  AiGenerateIcon,
  TerminalIcon,
  FinderIcon,
  VscodeIcon,
} from "./ui/icons";

interface ProjectContextMenuProps {
  path: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onOpenBranchManager?: () => void;
  onOpenLogViewer?: () => void;
  onOpenAiReview?: () => void;
}

export const ProjectContextMenu = memo(function ProjectContextMenu({
  path,
  onSuccess,
  onError,
  onOpenBranchManager,
  onOpenLogViewer,
  onOpenAiReview,
}: ProjectContextMenuProps) {
  const handleAction = useCallback(
    async (name: string, fn: () => Promise<void>) => {
      try {
        await fn();
        onSuccess(`Opened in ${name}`);
      } catch (e) {
        onError(String(e));
      }
    },
    [onSuccess, onError]
  );

  const handleOpenTerminal = useCallback(() => handleAction("Terminal", () => api.openInTerminal(path)), [handleAction, path]);
  const handleOpenFinder = useCallback(() => handleAction("Finder", () => api.openInFinder(path)), [handleAction, path]);
  const handleOpenVscode = useCallback(() => handleAction("VS Code", () => api.openInVscode(path)), [handleAction, path]);

  return (
    <DropdownMenu
      trigger={
        <IconButton title="More actions">
          <KebabIcon />
        </IconButton>
      }
    >
      {onOpenBranchManager && (
        <MenuItem
          icon={<BranchIcon />}
          label="Branch Manager"
          description="Create, delete, merge branches"
          onClick={onOpenBranchManager}
        />
      )}
      {onOpenLogViewer && (
        <MenuItem
          icon={<ClockIcon />}
          label="Commit History"
          description="View commit log"
          onClick={onOpenLogViewer}
        />
      )}
      {onOpenAiReview && (
        <MenuItem
          icon={<AiGenerateIcon />}
          label="AI Code Review"
          description="Review diff with LLM"
          onClick={onOpenAiReview}
        />
      )}

      <div className="border-t border-gray-100 dark:border-gray-700 my-1" />

      <MenuItem
        icon={<TerminalIcon />}
        label="Open in Terminal"
        onClick={handleOpenTerminal}
      />
      <MenuItem
        icon={<FinderIcon />}
        label="Open in Finder"
        onClick={handleOpenFinder}
      />
      <MenuItem
        icon={<VscodeIcon />}
        label="Open in VS Code"
        onClick={handleOpenVscode}
      />
    </DropdownMenu>
  );
});

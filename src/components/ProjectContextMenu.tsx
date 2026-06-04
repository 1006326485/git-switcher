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
  onOpenTagManager?: () => void;
  onOpenLogViewer?: () => void;
  onOpenAiReview?: () => void;
}

export const ProjectContextMenu = memo(function ProjectContextMenu({
  path,
  onSuccess,
  onError,
  onOpenBranchManager,
  onOpenTagManager,
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
      {onOpenTagManager && (
        <MenuItem
          icon={
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 010 2.474l-5.026 5.026a1.75 1.75 0 01-2.474 0l-6.25-6.25A1.752 1.752 0 011 7.775zM12 7.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
            </svg>
          }
          label="Tags"
          description="Create, delete tags"
          onClick={onOpenTagManager}
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

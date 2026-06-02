import { useCallback, memo } from "react";
import * as api from "../lib/tauri";
import { DropdownMenu, MenuItem, IconButton } from "./ui/primitives";

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
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
          </svg>
        </IconButton>
      }
    >
      {onOpenBranchManager && (
        <MenuItem
          icon={
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
            </svg>
          }
          label="Branch Manager"
          description="Create, delete, merge branches"
          onClick={onOpenBranchManager}
        />
      )}
      {onOpenLogViewer && (
        <MenuItem
          icon={
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.643 3.143L.427 1.927A.25.25 0 000 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 00.177-.427L2.715 4.215a6.5 6.5 0 11-1.18 4.458.75.75 0 10-1.493.154 8.001 8.001 0 101.6-5.684zM7.75 4a.75.75 0 01.75.75v2.992l2.028.812a.75.75 0 01-.557 1.392l-2.5-1A.75.75 0 017 8.25v-3.5A.75.75 0 017.75 4z" />
            </svg>
          }
          label="Commit History"
          description="View commit log"
          onClick={onOpenLogViewer}
        />
      )}
      {onOpenAiReview && (
        <MenuItem
          icon={
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.28 5.78a.75.75 0 00-1.06-1.06L7 7.94 5.78 6.72a.75.75 0 00-1.06 1.06l1.75 1.75a.75.75 0 001.06 0l3.75-3.75z" />
            </svg>
          }
          label="AI Code Review"
          description="Review diff with LLM"
          onClick={onOpenAiReview}
        />
      )}

      <div className="border-t border-gray-100 dark:border-gray-700 my-1" />

      <MenuItem
        icon={
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2.75A.75.75 0 012.75 2h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75H2.75A.75.75 0 012 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h4.5a.75.75 0 010 1.5h-4.5A1.75 1.75 0 011 13.25V2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v4.5a.75.75 0 01-1.5 0V2.75a.25.25 0 00-.25-.25H2.75z" />
          </svg>
        }
        label="Open in Terminal"
        onClick={handleOpenTerminal}
      />
      <MenuItem
        icon={
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
          </svg>
        }
        label="Open in Finder"
        onClick={handleOpenFinder}
      />
      <MenuItem
        icon={
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.092 1.258a.749.749 0 01.458.683v11.118a.75.75 0 01-1.124.643L3.69 10.5H1.75A1.75 1.75 0 010 8.75v-1.5C0 6.284.784 5.5 1.75 5.5h1.94l4.738-3.259a.749.749 0 01.664-.233zM5.75 6.744l-4.06 2.8a.248.248 0 01-.19.056H1.75a.25.25 0 00-.25.25v1.5c0 .138.112.25.25.25h-.25l3.958 2.73V6.744z" />
          </svg>
        }
        label="Open in VS Code"
        onClick={handleOpenVscode}
      />
    </DropdownMenu>
  );
});

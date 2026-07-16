import { useCallback, memo, useState } from "react";
import * as api from "../lib/tauri";
import { parseError, PROJECT_COLORS } from "../lib/types";
import { DropdownMenu, MenuItem, IconButton } from "./ui/primitives";
import { ColorPicker } from "./ColorPicker";
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
  projectId: string;
  currentColor?: string;
  path: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onOpenBranchManager?: () => void;
  onOpenTagManager?: () => void;
  onOpenLogViewer?: () => void;
  onOpenAiReview?: () => void;
  onColorChange?: (color: string | null) => void;
  onEditDescription?: () => void;
  notes?: string;
  onEditNotes?: () => void;
}

export const ProjectContextMenu = memo(function ProjectContextMenu({
  projectId,
  currentColor,
  path,
  onSuccess,
  onError,
  onOpenBranchManager,
  onOpenTagManager,
  onOpenLogViewer,
  onOpenAiReview,
  onColorChange,
  onEditDescription,
  notes,
  onEditNotes,
}: ProjectContextMenuProps) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  const handleAction = useCallback(
    async (name: string, fn: () => Promise<void>) => {
      try {
        await fn();
        onSuccess(`Opened in ${name}`);
      } catch (e) {
        onError(parseError(e));
      }
    },
    [onSuccess, onError]
  );

  const handleOpenTerminal = useCallback(() => handleAction("Terminal", () => api.openInTerminal(path)), [handleAction, path]);
  const handleOpenFinder = useCallback(() => handleAction("Finder", () => api.openInFinder(path)), [handleAction, path]);
  const handleOpenVscode = useCallback(() => handleAction("VS Code", () => api.openInVscode(path)), [handleAction, path]);

  const handleColorSelect = useCallback(
    async (color: string | null) => {
      try {
        await api.setProjectColor(projectId, color);
        onColorChange?.(color);
        onSuccess(color ? `Color set to ${color}` : "Color removed");
      } catch (e) {
        onError(parseError(e));
      }
    },
    [projectId, onSuccess, onError, onColorChange]
  );

  return (
    <>
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

      {onEditDescription && (
        <MenuItem
          icon={
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61z" />
            </svg>
          }
          label="Edit Description"
          description="Set project description"
          onClick={onEditDescription}
        />
      )}

      {onEditNotes && (
        <MenuItem
          icon={
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0113.25 15H2.75A1.75 1.75 0 011 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H2.75zM4 5.75A.75.75 0 014.75 5h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 014 5.75zm0 3A.75.75 0 014.75 8h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 014 8.75zm0 3a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75z" />
            </svg>
          }
          label="Notes"
          description={notes ? "Edit notes" : "Add notes"}
          onClick={onEditNotes}
        />
      )}

      <MenuItem
        icon={
          <span
            className={`w-3.5 h-3.5 rounded-full inline-block ${
              currentColor
                ? (PROJECT_COLORS.find((x) => x.id === currentColor)?.bg ?? "bg-gray-400")
                : "bg-gray-400"
            }`}
          />
        }
        label="Set Color"
        description={currentColor ? `Current: ${currentColor}` : "No color set"}
        onClick={() => setColorPickerOpen(true)}
      />

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
    <ColorPicker
      currentColor={currentColor}
      onSelect={handleColorSelect}
      trigger={<span />}
      align="right"
      open={colorPickerOpen}
      onOpenChange={setColorPickerOpen}
    />
    </>
  );
});

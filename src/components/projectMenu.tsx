import { useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../lib/tauri";
import { parseError, PROJECT_COLORS, type ProjectScript } from "../lib/types";
import {
  AiGenerateIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BranchIcon,
  ClockIcon,
  FileTextIcon,
  FinderIcon,
  FolderIcon,
  PencilIcon,
  PlayIcon,
  RefreshIcon,
  SettingsIcon,
  StashIcon,
  SyncIcon,
  TagIcon,
  TerminalIcon,
  TrashIcon,
  VscodeIcon,
} from "./ui/icons";

export type ProjectMenuItemDef = {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
  run: () => void;
};

export type ProjectMenuGroup = { id: string; items: ProjectMenuItemDef[] };

export interface ProjectMenuParams {
  projectId: string;
  currentColor?: string;
  path: string;
  title: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  /** Refresh hook for git-mutating tools (reflog checkout, rebase, …). */
  onGitRefresh?: () => void | Promise<void>;
  onOpenBranchManager?: () => void;
  onOpenTagManager?: () => void;
  onOpenLogViewer?: () => void;
  onOpenAiReview?: () => void;
  onRunFetch?: () => void;
  fetching?: boolean;
  onRunPull?: () => void;
  pulling?: boolean;
  onRunPush?: () => void;
  pushing?: boolean;
  onOpenStashManager?: () => void;
  onRefresh?: () => void;
  onAssignGroup?: () => void;
  onEditAlias?: () => void;
  onOpenBuiltInTerminal?: (path: string) => void;
  onRunProjectScript?: (script: ProjectScript) => void;
  onColorChange?: (color: string | null) => void;
  onEditDescription?: () => void;
  notes?: string;
  onEditNotes?: () => void;
  onRequestRemove?: () => void;
  onOpenColorPicker: () => void;
  onOpenScriptPicker: () => void;
  onOpenTools: () => void;
}

export function useProjectMenuGroups(params: ProjectMenuParams): ProjectMenuGroup[] {
  const {
    path,
    onSuccess,
    onError,
    onOpenBranchManager,
    onOpenTagManager,
    onOpenLogViewer,
    onOpenAiReview,
    onOpenBuiltInTerminal,
    onRunProjectScript,
    onEditDescription,
    notes,
    onEditNotes,
    onRunFetch,
    fetching,
    onRunPull,
    pulling,
    onRunPush,
    pushing,
    onOpenStashManager,
    onRefresh,
    onAssignGroup,
    onEditAlias,
    onRequestRemove,
    currentColor,
    onOpenColorPicker,
    onOpenScriptPicker,
    onOpenTools,
  } = params;
  const { t } = useTranslation();
  const handleAction = useCallback(
    async (name: string, fn: () => Promise<void>) => {
      try {
        await fn();
        onSuccess(t("menu.openedIn", { name }));
      } catch (e) {
        onError(parseError(e));
      }
    },
    [onSuccess, onError, t]
  );

  const handleOpenTerminal = useCallback(() => handleAction(t("menu.item.systemTerminal"), () => api.openInTerminal(path)), [handleAction, path, t]);
  const handleOpenFinder = useCallback(() => handleAction(t("menu.item.finder"), () => api.openInFinder(path)), [handleAction, path, t]);
  const handleOpenVscode = useCallback(() => handleAction(t("menu.item.vscode"), () => api.openInVscode(path)), [handleAction, path, t]);

  const colorIcon = (
    <span
      className={`w-3.5 h-3.5 rounded-full inline-block ${
        currentColor
          ? (PROJECT_COLORS.find((x) => x.id === currentColor)?.bg ?? "bg-gray-400")
          : "bg-gray-400"
      }`}
    />
  );

  return [
    {
      id: "git",
      items: [
        ...(onRunFetch
          ? [
              {
                id: "fetch",
                label: t("menu.item.fetch"),
                icon: <SyncIcon />,
                disabled: fetching,
                run: onRunFetch,
              },
            ]
          : []),
        ...(onRunPull
          ? [
              {
                id: "pull",
                label: t("menu.item.pull"),
                icon: <ArrowDownIcon />,
                disabled: pulling,
                run: onRunPull,
              },
            ]
          : []),
        ...(onRunPush
          ? [
              {
                id: "push",
                label: t("menu.item.push"),
                icon: <ArrowUpIcon />,
                disabled: pushing,
                run: onRunPush,
              },
            ]
          : []),
        ...(onOpenBranchManager
          ? [
              {
                id: "branch-manager",
                label: t("menu.item.branchManager"),
                description: t("menu.item.branchManagerDesc"),
                icon: <BranchIcon />,
                run: onOpenBranchManager,
              },
            ]
          : []),
        ...(onOpenTagManager
          ? [
              {
                id: "tags",
                label: t("menu.item.tags"),
                description: t("menu.item.tagsDesc"),
                icon: <TagIcon />,
                run: onOpenTagManager,
              },
            ]
          : []),
        ...(onOpenStashManager
          ? [
              {
                id: "stash-manager",
                label: t("menu.item.stashManager"),
                description: t("menu.item.stashManagerDesc"),
                icon: <StashIcon />,
                run: onOpenStashManager,
              },
            ]
          : []),
        ...(onOpenLogViewer
          ? [
              {
                id: "commit-history",
                label: t("menu.item.commitHistory"),
                description: t("menu.item.commitHistoryDesc"),
                icon: <ClockIcon />,
                run: onOpenLogViewer,
              },
            ]
          : []),
        ...(onOpenAiReview
          ? [
              {
                id: "ai-review",
                label: t("menu.item.aiReview"),
                description: t("menu.item.aiReviewDesc"),
                icon: <AiGenerateIcon />,
                run: onOpenAiReview,
              },
            ]
          : []),
        {
          id: "project-tools",
          label: t("menu.tools"),
          description: t("menu.item.toolsDesc"),
          icon: <SettingsIcon />,
          run: onOpenTools,
        },
        ...(onRefresh
          ? [
              {
                id: "refresh",
                label: t("menu.item.refresh"),
                description: t("menu.item.refreshDesc"),
                icon: <RefreshIcon />,
                run: onRefresh,
              },
            ]
          : []),
      ],
    },
    {
      id: "open",
      items: [
        ...(onRunProjectScript
          ? [
              {
                id: "run-script",
                label: t("menu.item.runScript"),
                description: t("menu.item.runScriptDesc"),
                icon: <PlayIcon />,
                run: onOpenScriptPicker,
              },
            ]
          : []),
        ...(onOpenBuiltInTerminal
          ? [
              {
                id: "open-built-in-terminal",
                label: t("menu.item.builtinTerminal"),
                icon: <TerminalIcon />,
                run: () => onOpenBuiltInTerminal(path),
              },
            ]
          : []),
        {
          id: "open-system-terminal",
          label: t("menu.item.systemTerminal"),
          icon: <TerminalIcon />,
          run: handleOpenTerminal,
        },
        {
          id: "open-finder",
          label: t("menu.item.finder"),
          icon: <FinderIcon />,
          run: handleOpenFinder,
        },
        {
          id: "open-vscode",
          label: t("menu.item.vscode"),
          icon: <VscodeIcon />,
          run: handleOpenVscode,
        },
      ],
    },
    {
      id: "appearance",
      items: [
        {
          id: "set-color",
          label: t("menu.item.setColor"),
          description: currentColor ? t("menu.item.currentColor", { color: currentColor }) : t("menu.item.noColor"),
          icon: colorIcon,
          run: onOpenColorPicker,
        },
        ...(onAssignGroup
          ? [
              {
                id: "assign-group",
                label: t("menu.item.group"),
                description: t("menu.item.groupDesc"),
                icon: <FolderIcon />,
                run: onAssignGroup,
              },
            ]
          : []),
        ...(onEditDescription
          ? [
              {
                id: "edit-description",
                label: t("menu.item.editDescription"),
                description: t("menu.item.editDescriptionDesc"),
                icon: <PencilIcon />,
                run: onEditDescription,
              },
            ]
          : []),
        ...(onEditNotes
          ? [
              {
                id: "notes",
                label: t("menu.item.notes"),
                description: notes ? t("menu.item.notesEdit") : t("menu.item.notesAdd"),
                icon: <FileTextIcon />,
                run: onEditNotes,
              },
            ]
          : []),
        ...(onEditAlias
          ? [
              {
                id: "edit-alias",
                label: t("menu.item.editAlias"),
                description: t("menu.item.editAliasDesc"),
                icon: <TagIcon />,
                run: onEditAlias,
              },
            ]
          : []),
      ],
    },
    {
      id: "danger",
      items: [
        ...(onRequestRemove
          ? [
              {
                id: "remove-project",
                label: t("menu.item.remove"),
                icon: <TrashIcon />,
                danger: true,
                run: onRequestRemove,
              },
            ]
          : []),
      ],
    },
  ];
}

import { memo, useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import * as api from "../lib/tauri";
import type { AppSettings, Theme, ViewMode, SortOption } from "../lib/types";
import { formatHotkey } from "../lib/hotkey";
import { DEFAULT_IN_APP_SHORTCUTS } from "../lib/inAppShortcuts";
import { SegmentedControl, DropdownMenu, MenuItem, IconButton } from "./ui/primitives";
import { SearchIcon, PlusIcon, KebabIcon, TerminalIcon } from "./ui/icons";
import { NotificationPanel } from "./NotificationPanel";
import { OperationLogPanel } from "./OperationLogPanel";
import { BatchOpsToolbar } from "./BatchOpsToolbar";
import type { BatchProgress } from "../hooks/useBatchOps";

interface FilterCounts {
  all: number;
  changed: number;
  behind: number;
  ahead: number;
  stale: number;
}

const FILTER_LABEL_KEYS = {
  all: "header.filters.all",
  changed: "header.filters.changed",
  behind: "header.filters.behind",
  ahead: "header.filters.ahead",
  stale: "header.filters.stale",
} as const;

const FILTERS: { id: keyof typeof FILTER_LABEL_KEYS; labelKey: (typeof FILTER_LABEL_KEYS)[keyof typeof FILTER_LABEL_KEYS] }[] = [
  { id: "all", labelKey: FILTER_LABEL_KEYS.all },
  { id: "changed", labelKey: FILTER_LABEL_KEYS.changed },
  { id: "behind", labelKey: FILTER_LABEL_KEYS.behind },
  { id: "ahead", labelKey: FILTER_LABEL_KEYS.ahead },
  { id: "stale", labelKey: FILTER_LABEL_KEYS.stale },
];

interface HeaderProps {
  projectCount: number;
  totalCount: number;
  theme: Theme;
  viewMode: ViewMode;
  searchQuery: string;
  activeFilter: string;
  filterCounts: FilterCounts;
  sortBy: SortOption;
  onSearchChange: (query: string) => void;
  onFilterChange: (filter: string) => void;
  onThemeChange: (theme: Theme) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onSortChange: (sort: SortOption) => void;
  onAddProject: () => void;
  onToggleSidebar: () => void;
  onExportImport: () => void;
  onBulkImport: () => void;
  onSettings: () => void;
  onTaskWorkspaces: () => void;
  onToggleCommandPalette: () => void;
  onToggleTerminal: () => void;
  batchLoading: string | null;
  batchProgress: BatchProgress;
  onFetchAll: () => void;
  onPullAll: () => void;
  onPushAll: () => void;
  onPullBehind: () => void;
  onPushAhead: () => void;
  onSyncAll: () => void;
  onRunCommandAll: () => void;
  behindCount: number;
  aheadCount: number;
  needsAttention: number;
  onAttentionClick: () => void;
  onOpenShortcutsHelp: () => void;
}

const DEFAULT_SHORTCUTS_HELP_HOTKEY = DEFAULT_IN_APP_SHORTCUTS.shortcutsHelp;
const DEFAULT_TERMINAL_HOTKEY = DEFAULT_IN_APP_SHORTCUTS.toggleTerminal;

const viewOptions: { value: ViewMode; icon: string; labelKey: "header.viewMode.card" | "header.viewMode.list" | "header.viewMode.compact" | "header.viewMode.table" | "header.viewMode.dashboard" }[] = [
  { value: "card", icon: "⊞", labelKey: "header.viewMode.card" },
  { value: "list", icon: "☰", labelKey: "header.viewMode.list" },
  { value: "compact", icon: "≡", labelKey: "header.viewMode.compact" },
  { value: "table", icon: "▦", labelKey: "header.viewMode.table" },
  { value: "dashboard", icon: "📊", labelKey: "header.viewMode.dashboard" },
];

const themeOptions: { value: Theme; icon: string; labelKey: "header.theme.light" | "header.theme.dark" | "header.theme.system" }[] = [
  { value: "light", icon: "☀", labelKey: "header.theme.light" },
  { value: "dark", icon: "☾", labelKey: "header.theme.dark" },
  { value: "system", icon: "⚙", labelKey: "header.theme.system" },
];

const SORT_OPTIONS: { value: SortOption; icon: string; labelKey: "header.sort.custom" | "header.sort.nameAsc" | "header.sort.nameDesc" | "header.sort.modified" | "header.sort.changes" | "header.sort.branch" }[] = [
  { value: "custom", icon: "↕", labelKey: "header.sort.custom" },
  { value: "name-asc", icon: "A↓", labelKey: "header.sort.nameAsc" },
  { value: "name-desc", icon: "A↑", labelKey: "header.sort.nameDesc" },
  { value: "modified", icon: "◷", labelKey: "header.sort.modified" },
  { value: "changes", icon: "#", labelKey: "header.sort.changes" },
  { value: "branch", icon: "⎇", labelKey: "header.sort.branch" },
];

export const Header = memo(function Header({
  projectCount,
  totalCount,
  theme,
  viewMode,
  searchQuery,
  activeFilter,
  filterCounts,
  sortBy,
  onSearchChange,
  onFilterChange,
  onThemeChange,
  onViewModeChange,
  onSortChange,
  onAddProject,
  onToggleSidebar,
  onExportImport,
  onBulkImport,
  onSettings,
  onTaskWorkspaces,
  onToggleCommandPalette,
  onToggleTerminal,
  batchLoading,
  batchProgress,
  onFetchAll,
  onPullAll,
  onPushAll,
  onPullBehind,
  onPushAhead,
  onSyncAll,
  onRunCommandAll,
  behindCount,
  aheadCount,
  needsAttention,
  onAttentionClick,
  onOpenShortcutsHelp,
}: HeaderProps) {
  const { t } = useTranslation();
  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.labelKey;
  const [terminalHotkey, setTerminalHotkey] = useState(DEFAULT_TERMINAL_HOTKEY);
  const [shortcutsHelpHotkey, setShortcutsHelpHotkey] = useState(DEFAULT_SHORTCUTS_HELP_HOTKEY);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.getSettings()
        .then((s: AppSettings) => {
          if (cancelled) return;
          setTerminalHotkey(s.in_app_toggle_terminal || DEFAULT_TERMINAL_HOTKEY);
          setShortcutsHelpHotkey(s.in_app_shortcuts_help || DEFAULT_SHORTCUTS_HELP_HOTKEY);
        })
        .catch(() => {});
    };
    load();
    const unlisten = listen("settings-changed", load);
    return () => {
      cancelled = true;
      unlisten.then((f) => f());
    };
  }, []);
  const terminalHint = `${t("header.actions.terminal")} (${formatHotkey(terminalHotkey)})`;
  const shortcutsHint = `${t("header.actions.shortcuts")} (${formatHotkey(shortcutsHelpHotkey)})`;
  return (
    <div className="relative z-10 shrink-0 select-none px-3 sm:px-4">
      <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-2 gap-y-2 py-2 xl:flex-nowrap">
        {/* ── Left: Brand ────────────────────────────────────────────── */}
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <IconButton onClick={onToggleSidebar} title={t("header.sidebar.toggle")}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 2.75A.75.75 0 011.75 2h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 2.75zm0 5A.75.75 0 011.75 7h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 7.75zM1.75 12a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5z" />
            </svg>
          </IconButton>

          <div className="flex min-w-0 items-center gap-2">
            <img src="/app-icon.png" alt="" className="w-5 h-5 rounded-[4px]" />
            <h1 className="hidden text-sm font-semibold tracking-tight text-gray-900 sm:block dark:text-gray-100">
              Git Switcher
            </h1>
            <span className="hidden text-xs tabular-nums text-gray-400 sm:inline dark:text-gray-500">
              {projectCount === totalCount
                ? `${totalCount}`
                : `${projectCount}/${totalCount}`}
            </span>
            {needsAttention > 0 && (
              <button
                onClick={onAttentionClick}
                className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none hover:bg-red-600 transition-colors"
                title={t("header.attention.tooltip", { count: needsAttention })}
                aria-label={t("header.attention.tooltip", { count: needsAttention })}
              >
                {needsAttention}
              </button>
            )}
          </div>
        </div>

        {/* ── Center: Filters + Search ───────────────────────────────── */}
        <div className="order-3 flex min-w-0 basis-full flex-col gap-1.5 xl:order-none xl:mx-4 xl:basis-auto xl:flex-1 xl:flex-row xl:items-center xl:gap-3">
          {/* Filter pills */}
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] xl:min-w-0 xl:flex-1">
            {FILTERS.map((f) => {
              const active = activeFilter === f.id;
              const count = filterCounts[f.id as keyof FilterCounts];
              return (
                <button
                  key={f.id}
                  onClick={() => onFilterChange(f.id)}
                  className={`press px-3 py-1 text-xs rounded-full transition-all active:scale-[0.97] whitespace-nowrap flex items-center ${
                    active
                      ? "bg-[var(--accent)] text-white"
                      : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  {t(f.labelKey)}
                  <span
                    className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-medium rounded-full ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
            <div className="ml-auto shrink-0">
              <DropdownMenu
                trigger={
                  <button
                    aria-label={currentSortLabel ? t("header.sort.ariaLabel", { label: t(currentSortLabel) }) : t("header.sort.ariaLabel", { label: "" })}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M3.5 2.75a.75.75 0 00-1.5 0v10.5a.75.75 0 001.5 0v-10.5zM5.75 2a.75.75 0 00-.75.75v10.5a.75.75 0 001.5 0V2.75A.75.75 0 005.75 2zm3.25.75a.75.75 0 011.5 0v5.5a.75.75 0 01-1.5 0v-5.5zM10.25 14a.75.75 0 001.5 0V8.5a.75.75 0 00-1.5 0V14zm4-11.25a.75.75 0 01.75.75v8.5a.75.75 0 01-1.5 0V3.5a.75.75 0 01.75-.75z" />
                    </svg>
                    <span className="hidden text-[11px] sm:inline">{currentSortLabel ? t(currentSortLabel) : ""}</span>
                  </button>
                }
              >
                {SORT_OPTIONS.map((opt) => (
                  <MenuItem
                    key={opt.value}
                    icon={<span className="text-xs font-mono">{opt.icon}</span>}
                    label={t(opt.labelKey)}
                    selected={sortBy === opt.value}
                    onClick={() => onSortChange(opt.value)}
                  />
                ))}
              </DropdownMenu>
            </div>
          </div>

          {/* Search input */}
          <div className="relative w-full xl:w-auto xl:flex-none xl:basis-56 xl:shrink-0">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              id="global-search-input"
              placeholder={t("header.search.placeholder")}
              aria-label={t("header.search.ariaLabel")}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500 transition-all duration-150"
            />
          </div>
        </div>

        {/* ── Right: Actions ─────────────────────────────────────────── */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* Command palette */}
          <div className="hidden sm:block">
          <IconButton onClick={onToggleCommandPalette} title={t("header.actions.commandPalette")}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1.5a.5.5 0 01.5.5v2.5h2.5a.5.5 0 010 1H8.5v2.5a.5.5 0 01-1 0V5.5H5a.5.5 0 010-1h2.5V2a.5.5 0 01.5-.5z" />
              <path fillRule="evenodd" d="M1.5 3A1.5 1.5 0 013 1.5h10A1.5 1.5 0 0114.5 3v10a1.5 1.5 0 01-1.5 1.5H3A1.5 1.5 0 011.5 13V3zM3 0a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3V3a3 3 0 00-3-3H3z" />
            </svg>
          </IconButton>
          </div>

          {/* Built-in terminal */}
          <div className="hidden sm:block">
          <IconButton onClick={onToggleTerminal} title={terminalHint} aria-label={terminalHint}>
            <TerminalIcon size={16} />
          </IconButton>
          </div>

          {/* Shortcuts help */}
          <div className="hidden sm:block">
          <IconButton onClick={onOpenShortcutsHelp} title={shortcutsHint} aria-label={shortcutsHint}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 110 16A8 8 0 018 0zM5.46 4.77a.75.75 0 00-1.42.58A2.75 2.75 0 005.75 8h.75a.75.75 0 000-1.5h-.75a1.25 1.25 0 00-1.06 1.92c.24.36.6.66 1.01.86.58.28.99.86.99 1.47V11a.75.75 0 001.5 0v-.25c0-.88-.5-1.69-1.28-2.12-.56-.31-.93-.88-.93-1.51V6.75A1.25 1.25 0 006.06 4.77zM8 12.5a1 1 0 100 2 1 1 0 000-2z" />
            </svg>
          </IconButton>
          </div>

          {/* Notifications */}
          <NotificationBell />

          {/* Primary action */}
          <button
            onClick={onAddProject}
            aria-label={t("header.actions.addProject")}
            className="h-8 px-3 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] active:scale-[0.98] text-white text-sm font-medium transition-all duration-150 flex items-center gap-1.5 shadow-sm shadow-blue-600/20"
          >
            <PlusIcon />
            <span className="hidden sm:inline">{t("header.actions.add")}</span>
          </button>

          {/* Divider */}
          <div className="mx-0.5 hidden h-5 w-px bg-gray-200 2xl:block dark:bg-gray-700" />

          {/* View + Theme compact controls */}
          <div className="hidden items-center gap-1.5 2xl:flex">
          <SegmentedControl
            options={viewOptions.map((o) => ({ ...o, label: t(o.labelKey) }))}
            value={viewMode}
            onChange={onViewModeChange}
            ariaLabel={t("header.viewMode.ariaLabel")}
          />
          <SegmentedControl
            options={themeOptions.map((o) => ({ ...o, label: t(o.labelKey) }))}
            value={theme}
            onChange={onThemeChange}
            ariaLabel={t("header.theme.ariaLabel")}
          />
          </div>

          {/* Divider */}
          <div className="mx-0.5 hidden h-5 w-px bg-gray-200 2xl:block dark:bg-gray-700" />

          {/* More menu */}
          <DropdownMenu
            trigger={
              <IconButton title={t("header.actions.more")}>
                <KebabIcon size={16} />
              </IconButton>
            }
          >
            <div className="px-2 py-1">
              <BatchOpsToolbar
                batchLoading={batchLoading}
                batchProgress={batchProgress}
                onFetchAll={onFetchAll}
                onPullAll={onPullAll}
                onPushAll={onPushAll}
                onPullBehind={onPullBehind}
                onPushAhead={onPushAhead}
                onSyncAll={onSyncAll}
                onRunCommand={onRunCommandAll}
                behindCount={behindCount}
                aheadCount={aheadCount}
              />
            </div>
            <div className="2xl:hidden">
              {viewOptions.map((option) => (
                <MenuItem
                  key={option.value}
                  icon={<span>{option.icon}</span>}
                  label={t("header.viewMode.menuLabel", { label: t(option.labelKey) })}
                  selected={viewMode === option.value}
                  onClick={() => onViewModeChange(option.value)}
                />
              ))}
              <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
              {themeOptions.map((option) => (
                <MenuItem
                  key={option.value}
                  icon={<span>{option.icon}</span>}
                  label={t("header.theme.menuLabel", { label: t(option.labelKey) })}
                  selected={theme === option.value}
                  onClick={() => onThemeChange(option.value)}
                />
              ))}
              <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
            </div>
            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
            <MenuItem
              icon="▣"
              label={t("header.menu.taskWorkspaces")}
              description={t("header.menu.taskWorkspacesDesc")}
              onClick={onTaskWorkspaces}
            />
            <MenuItem
              icon={
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2.75 14A1.75 1.75 0 011 12.25v-8.5C1 2.784 1.784 2 2.75 2h3.5a.75.75 0 010 1.5h-3.5a.25.25 0 00-.25.25v8.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-3.5a.75.75 0 011.5 0v3.5A1.75 1.75 0 0113.25 14H2.75z" />
                  <path d="M11 2.75a.75.75 0 001.5 0V.25a.25.25 0 00-.25-.25h-2.5a.75.75 0 000 1.5h.75v2.25z" />
                  <path d="M7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.749.749 0 111.06 1.06l-3.25 3.25a.749.749 0 01-1.06 0L4.22 6.78a.749.749 0 111.06-1.06l1.97 1.969z" />
                </svg>
              }
              label={t("header.menu.exportImport")}
              description={t("header.menu.exportImportDesc")}
              onClick={onExportImport}
            />
            <MenuItem
              icon={
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1.5a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5a.5.5 0 01.5-.5z" />
                  <path fillRule="evenodd" d="M1.5 3A1.5 1.5 0 013 1.5h10A1.5 1.5 0 0114.5 3v10a1.5 1.5 0 01-1.5 1.5H3A1.5 1.5 0 011.5 13V3zM3 0a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3V3a3 3 0 00-3-3H3z" />
                </svg>
              }
              label={t("header.menu.bulkImport")}
              description={t("header.menu.bulkImportDesc")}
              onClick={onBulkImport}
            />
            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
            <MenuItem
              icon={
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0a8.59 8.59 0 011.254.097 12.18 12.18 0 011.7.564 8.47 8.47 0 012.38 1.548 8.47 8.47 0 011.548 2.38c.296.56.487 1.13.564 1.7A8.59 8.59 0 0116 8a8.59 8.59 0 01-.097 1.254 12.18 12.18 0 01-.564 1.7 8.47 8.47 0 01-1.548 2.38 8.47 8.47 0 01-2.38 1.548 12.18 12.18 0 01-1.7.564A8.59 8.59 0 018 16a8.59 8.59 0 01-1.254-.097 12.18 12.18 0 01-1.7-.564 8.47 8.47 0 01-2.38-1.548 8.47 8.47 0 01-1.548-2.38 12.18 12.18 0 01-.564-1.7A8.59 8.59 0 010 8c0-.443.033-.872.097-1.254.077-.57.268-1.14.564-1.7a8.47 8.47 0 011.548-2.38A8.47 8.47 0 014.59.661c.56-.296 1.13-.487 1.7-.564A8.59 8.59 0 018 0zm0 3.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zm0 1.5a3 3 0 110 6 3 3 0 010-6z" />
                </svg>
              }
              label={t("header.menu.settings")}
              description={t("header.menu.settingsDesc")}
              onClick={onSettings}
            />
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
});

function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const count = await api.getUnreadCount();
      setUnread(count);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    // Visibility-gated polling: skip refresh while the window is hidden
    // (same pattern as useAutoRefresh) to avoid background CPU/IPC churn.
    let timer: ReturnType<typeof setInterval> | null = null;
    const startTimer = () => {
      timer = setInterval(() => {
        if (!document.hidden) refresh();
      }, 30000);
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      } else {
        refresh();
        if (!timer) startTimer();
      }
    };
    refresh();
    startTimer();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return (
    <div className="flex items-center gap-0.5">
      {/* Operation History button */}
      <IconButton onClick={() => setLogOpen(!logOpen)} title={t("header.actions.operationHistory")}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </IconButton>

      {/* Notification bell */}
      <div className="relative">
        <IconButton onClick={() => setOpen(!open)} title={t("header.actions.notifications")}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 16a2 2 0 002-2H6a2 2 0 002 2zM8 1.918l-.797.161A4 4 0 004 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4 4 0 00-3.203-3.92L8 1.917zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 111.99 0A5 5 0 0113 6c0 .88.32 4.2 1.22 6z" />
          </svg>
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </IconButton>
        <NotificationPanel open={open} onClose={() => setOpen(false)} />
      </div>

      <OperationLogPanel open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
}

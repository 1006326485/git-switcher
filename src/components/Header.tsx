import { memo } from "react";
import type { Theme, ViewMode } from "../lib/types";
import { SegmentedControl, DropdownMenu, MenuItem, IconButton } from "./ui/primitives";
import { SearchIcon, PlusIcon, KebabIcon } from "./ui/icons";
import { BatchOpsToolbar } from "./BatchOpsToolbar";

interface HeaderProps {
  projectCount: number;
  totalCount: number;
  theme: Theme;
  viewMode: ViewMode;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onThemeChange: (theme: Theme) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onAddProject: () => void;
  onToggleSidebar: () => void;
  onExportImport: () => void;
  onSettings: () => void;
  onToggleCommandPalette: () => void;
  batchLoading: string | null;
  onFetchAll: () => void;
  onPullAll: () => void;
  onPushAll: () => void;
}

const viewOptions: { value: ViewMode; icon: string; label: string }[] = [
  { value: "card", icon: "⊞", label: "Card" },
  { value: "list", icon: "☰", label: "List" },
  { value: "compact", icon: "≡", label: "Compact" },
  { value: "table", icon: "▦", label: "Table" },
  { value: "dashboard", icon: "📊", label: "Dashboard" },
];

const themeOptions: { value: Theme; icon: string; label: string }[] = [
  { value: "light", icon: "☀", label: "Light" },
  { value: "dark", icon: "☾", label: "Dark" },
  { value: "system", icon: "⚙", label: "System" },
];

export const Header = memo(function Header({
  projectCount,
  totalCount,
  theme,
  viewMode,
  searchQuery,
  onSearchChange,
  onThemeChange,
  onViewModeChange,
  onAddProject,
  onToggleSidebar,
  onExportImport,
  onSettings,
  onToggleCommandPalette,
  batchLoading,
  onFetchAll,
  onPullAll,
  onPushAll,
}: HeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 select-none shrink-0">
      <div className="flex items-center justify-between h-11">
        {/* ── Left: Brand ────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <IconButton onClick={onToggleSidebar} title="Toggle sidebar">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 2.75A.75.75 0 011.75 2h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 2.75zm0 5A.75.75 0 011.75 7h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 7.75zM1.75 12a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5z" />
            </svg>
          </IconButton>

          <div className="flex items-center gap-2">
            <img src="/app-icon.png" alt="" className="w-5 h-5 rounded-[4px]" />
            <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
              Git Switcher
            </h1>
            <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
              {projectCount === totalCount
                ? `${totalCount}`
                : `${projectCount}/${totalCount}`}
            </span>
          </div>
        </div>

        {/* ── Center: Search ─────────────────────────────────────────── */}
        <div className="flex-1 max-w-md mx-4">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              id="global-search-input"
              placeholder="Search projects..."
              aria-label="Search projects"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
            />
          </div>
        </div>

        {/* ── Right: Actions ─────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5">
          {/* Command palette */}
          <IconButton onClick={onToggleCommandPalette} title="Command palette (⌘K)">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1.5a.5.5 0 01.5.5v2.5h2.5a.5.5 0 010 1H8.5v2.5a.5.5 0 01-1 0V5.5H5a.5.5 0 010-1h2.5V2a.5.5 0 01.5-.5z" />
              <path fillRule="evenodd" d="M1.5 3A1.5 1.5 0 013 1.5h10A1.5 1.5 0 0114.5 3v10a1.5 1.5 0 01-1.5 1.5H3A1.5 1.5 0 011.5 13V3zM3 0a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3V3a3 3 0 00-3-3H3z" />
            </svg>
          </IconButton>

          {/* Primary action */}
          <button
            onClick={onAddProject}
            aria-label="Add project"
            className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium transition-all flex items-center gap-1.5 shadow-sm shadow-blue-600/20"
          >
            <PlusIcon />
            Add
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />

          {/* View + Theme compact controls */}
          <SegmentedControl
            options={viewOptions}
            value={viewMode}
            onChange={onViewModeChange}
            ariaLabel="View mode"
          />
          <SegmentedControl
            options={themeOptions}
            value={theme}
            onChange={onThemeChange}
            ariaLabel="Theme"
          />

          {/* Divider */}
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />

          {/* More menu */}
          <DropdownMenu
            trigger={
              <IconButton title="More actions">
                <KebabIcon size={16} />
              </IconButton>
            }
          >
            <div className="px-2 py-1">
              <BatchOpsToolbar
                batchLoading={batchLoading}
                onFetchAll={onFetchAll}
                onPullAll={onPullAll}
                onPushAll={onPushAll}
              />
            </div>
            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
            <MenuItem
              icon={
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2.75 14A1.75 1.75 0 011 12.25v-8.5C1 2.784 1.784 2 2.75 2h3.5a.75.75 0 010 1.5h-3.5a.25.25 0 00-.25.25v8.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-3.5a.75.75 0 011.5 0v3.5A1.75 1.75 0 0113.25 14H2.75z" />
                  <path d="M11 2.75a.75.75 0 001.5 0V.25a.25.25 0 00-.25-.25h-2.5a.75.75 0 000 1.5h.75v2.25z" />
                  <path d="M7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.749.749 0 111.06 1.06l-3.25 3.25a.749.749 0 01-1.06 0L4.22 6.78a.749.749 0 111.06-1.06l1.97 1.969z" />
                </svg>
              }
              label="Export / Import"
              description="Backup or restore project list"
              onClick={onExportImport}
            />
            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
            <MenuItem
              icon={
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0a8.59 8.59 0 011.254.097 12.18 12.18 0 011.7.564 8.47 8.47 0 012.38 1.548 8.47 8.47 0 011.548 2.38c.296.56.487 1.13.564 1.7A8.59 8.59 0 0116 8a8.59 8.59 0 01-.097 1.254 12.18 12.18 0 01-.564 1.7 8.47 8.47 0 01-1.548 2.38 8.47 8.47 0 01-2.38 1.548 12.18 12.18 0 01-1.7.564A8.59 8.59 0 018 16a8.59 8.59 0 01-1.254-.097 12.18 12.18 0 01-1.7-.564 8.47 8.47 0 01-2.38-1.548 8.47 8.47 0 01-1.548-2.38 12.18 12.18 0 01-.564-1.7A8.59 8.59 0 010 8c0-.443.033-.872.097-1.254.077-.57.268-1.14.564-1.7a8.47 8.47 0 011.548-2.38A8.47 8.47 0 014.59.661c.56-.296 1.13-.487 1.7-.564A8.59 8.59 0 018 0zm0 3.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zm0 1.5a3 3 0 110 6 3 3 0 010-6z" />
                </svg>
              }
              label="Settings"
              description="Configure AI review, preferences"
              onClick={onSettings}
            />
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
});

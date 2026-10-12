import { useState, useCallback, memo } from "react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../lib/tauri";
import type { SubmoduleInfo } from "../lib/types";
import { parseError } from "../lib/types";
import { useContextMenu } from "../hooks/useContextMenu";
import { ContextMenu } from "./ui/ContextMenu";
import { MenuItem } from "./ui/primitives";

interface SubmoduleManagerProps {
  path: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onInfo?: (msg: string) => void;
}

export const SubmoduleManager = memo(function SubmoduleManager({
  path,
  onSuccess,
  onError,
  onInfo,
}: SubmoduleManagerProps) {
  const { t } = useTranslation();
  const [submodules, setSubmodules] = useState<SubmoduleInfo[]>([]);
  const [showList, setShowList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menuSubmodule, setMenuSubmodule] = useState<SubmoduleInfo | null>(null);
  const { onContextMenu, close, menuProps } = useContextMenu();

  const openRowMenu = useCallback(
    (e: MouseEvent, submodule: SubmoduleInfo) => {
      const target = e.target;
      if (target instanceof Element && target.closest('button, input, textarea, a, [role="button"]')) return;
      setMenuSubmodule(submodule);
      onContextMenu(e);
    },
    [onContextMenu]
  );

  const loadSubmodules = useCallback(async () => {
    try {
      const list = await api.gitListSubmodules(path);
      setSubmodules(list);
    } catch (e) {
      onError(t("submodules.loadFailed", { error: parseError(e) }));
    }
  }, [path, onError]);

  const handleToggleList = useCallback(async () => {
    const next = !showList;
    setShowList(next);
    if (next) {
      setLoading(true);
      await loadSubmodules();
      setLoading(false);
    }
  }, [showList, loadSubmodules]);

  const handleUpdate = useCallback(
    async (name: string) => {
      setLoading(true);
      onInfo?.(t("submodules.updating", { name }));
      try {
        await api.gitUpdateSubmodule(path, name);
        onSuccess(t("submodules.updated", { name }));
        await loadSubmodules();
      } catch (e) {
        onError(parseError(e));
      } finally {
        setLoading(false);
      }
    },
    [path, onSuccess, onError, onInfo, loadSubmodules]
  );

  const handleInitAll = useCallback(async () => {
    setLoading(true);
    onInfo?.(t("submodules.initializingAll"));
    try {
      await api.gitInitSubmodules(path);
      onSuccess(t("submodules.allInitialized"));
      await loadSubmodules();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, onSuccess, onError, onInfo, loadSubmodules, t]);

  const shortUrl = (url: string) => {
    const parts = url.replace(/\.git$/, "").split("/");
    return parts.length > 2 ? parts.slice(-2).join("/") : url;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggleList}
          aria-expanded={showList}
          aria-label={t("submodules.toggleList")}
          className="flex-1 text-left text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1.5 transition-colors"
        >
          <span className={`transition-transform text-[10px] ${showList ? "rotate-90" : ""}`}>
            &#x25B6;
          </span>
          {t("submodules.title")}
          {submodules.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
              {submodules.length}
            </span>
          )}
        </button>
        {showList && (
          <button
            onClick={handleInitAll}
            disabled={loading}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors"
            title={t("submodules.initAllTitle")}
          >
            {t("submodules.initAll")}
          </button>
        )}
      </div>

      {showList && (
        <div className="space-y-2">
          {loading ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic py-1">
              {t("submodules.loading")}
            </p>
          ) : submodules.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic py-1">
              {t("submodules.empty")}
            </p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {submodules.map((sm) => (
                <div
                  key={sm.name}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border-color)] text-xs"
                  onContextMenu={(e) => openRowMenu(e, sm)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
                        {sm.name}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-mono text-[10px]">
                        {shortUrl(sm.url)}
                      </span>
                      {sm.active ? (
                        <span className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-[10px]">
                          {t("submodules.active")}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px]">
                          {t("submodules.inactive")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 dark:text-gray-500 truncate">
                        {sm.path}
                      </span>
                      {sm.head && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                          {sm.head.slice(0, 7)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleUpdate(sm.name)}
                    disabled={loading}
                    className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 hover:bg-blue-200 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors shrink-0"
                    aria-label={t("submodules.updateAria", { name: sm.name })}
                  >
                    {t("submodules.update")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {menuSubmodule && (
        <ContextMenu {...menuProps} onClose={close}>
          <MenuItem label={t("submodules.update")} onClick={() => handleUpdate(menuSubmodule.name)} />
          <MenuItem
            label={t("submodules.copyName")}
            onClick={() => void navigator.clipboard.writeText(menuSubmodule.name)}
          />
          <MenuItem
            label={t("submodules.copyPath")}
            onClick={() => void navigator.clipboard.writeText(menuSubmodule.path)}
          />
        </ContextMenu>
      )}
    </div>
  );
});
export default SubmoduleManager;

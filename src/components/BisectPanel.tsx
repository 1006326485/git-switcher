import { useState, useEffect, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../lib/tauri";
import type { BisectState } from "../lib/types";
import { parseError } from "../lib/types";

interface BisectPanelProps {
  path: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const BisectPanel = memo(function BisectPanel({
  path,
  onSuccess,
  onError,
}: BisectPanelProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<BisectState | null>(null);
  const [loading, setLoading] = useState(false);
  const [goodHash, setGoodHash] = useState("");
  const [badHash, setBadHash] = useState("");

  const checkStatus = useCallback(async () => {
    try {
      const s = await api.gitBisectStatus(path);
      setState(s);
    } catch { /* ignore */ }
  }, [path]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const handleStart = useCallback(async () => {
    if (!goodHash.trim() || !badHash.trim()) return;
    setLoading(true);
    try {
      const s = await api.gitBisectStart(path, goodHash.trim(), badHash.trim());
      setState(s);
      onSuccess(t("bisect.started"));
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, goodHash, badHash, onSuccess, onError, t]);

  const handleGood = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.gitBisectGood(path);
      setState(s);
      if (!s.active) {
        onSuccess(t("bisect.found", { commit: s.current_commit }));
      }
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, onSuccess, onError, t]);

  const handleBad = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.gitBisectBad(path);
      setState(s);
      if (!s.active) {
        onSuccess(t("bisect.found", { commit: s.current_commit }));
      }
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, onSuccess, onError, t]);

  const handleReset = useCallback(async () => {
    setLoading(true);
    try {
      await api.gitBisectReset(path);
      setState(null);
      setGoodHash("");
      setBadHash("");
      onSuccess(t("bisect.reset"));
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, onSuccess, onError, t]);

  return (
    <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
      <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{t("bisect.title")}</h4>

      {state?.active ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-700 dark:text-gray-300">{state.message}</p>
          {state.current_commit && (
            <p className="text-xs">
              <span className="text-gray-500">{t("bisect.testing")}</span>
              <span className="font-mono text-blue-600 dark:text-blue-400">{state.current_commit}</span>
            </p>
          )}
          {state.steps_remaining > 0 && (
            <p className="text-xs text-gray-500">{t("bisect.stepsRemaining", { count: state.steps_remaining })}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleGood}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800/50 hover:bg-green-200 dark:hover:bg-green-900/40 disabled:opacity-50"
            >
              {loading ? "..." : t("bisect.good")}
            </button>
            <button
              onClick={handleBad}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50 hover:bg-red-200 dark:hover:bg-red-900/40 disabled:opacity-50"
            >
              {loading ? "..." : t("bisect.bad")}
            </button>
            <button
              onClick={handleReset}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              {t("bisect.resetButton")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={goodHash}
              onChange={(e) => setGoodHash(e.target.value)}
              placeholder={t("bisect.goodPlaceholder")}
              className="flex-1 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={badHash}
              onChange={(e) => setBadHash(e.target.value)}
              placeholder={t("bisect.badPlaceholder")}
              className="flex-1 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleStart}
            disabled={loading || !goodHash.trim() || !badHash.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 hover:bg-blue-200 dark:hover:bg-blue-900/40 disabled:opacity-50"
          >
            {loading ? t("bisect.starting") : t("bisect.start")}
          </button>
        </div>
      )}
    </div>
  );
});

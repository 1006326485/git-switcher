import { useState, useEffect, useCallback, useRef, memo } from "react";
import type { LlmConfig } from "../lib/types";
import { getSettings, updateSettings } from "../lib/tauri";

interface LlmSettingsProps {
  onError: (msg: string) => void;
}

export const LlmSettings = memo(function LlmSettings({ onError }: LlmSettingsProps) {
  const [config, setConfig] = useState<LlmConfig>({
    enabled: false,
    api_key: "",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    temperature: 0.3,
    max_tokens: 4096,
  });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    getSettings().then((s) => setConfig(s.llm)).catch((e) => {
      setLoadFailed(true);
      onErrorRef.current(`Failed to load LLM settings: ${e}`);
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const settings = await getSettings();
      await updateSettings({ ...settings, llm: config });
    } catch (e) {
      onError(String(e));
    } finally {
      setSaving(false);
    }
  }, [config, onError]);

  const toggleEnabled = useCallback(() => update("enabled", !config.enabled), [config.enabled]);
  const toggleShowKey = useCallback(() => setShowKey((v) => !v), []);

  const update = useCallback(<K extends keyof LlmConfig>(key: K, value: LlmConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value })), []);

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Enable AI Code Review
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Use an LLM to review branch diffs
          </div>
        </div>
        <button
          role="switch"
          aria-checked={config.enabled}
          aria-label="Enable AI Code Review"
          onClick={toggleEnabled}
          className={`relative w-10 h-6 rounded-full transition-colors ${
            config.enabled
              ? "bg-blue-600"
              : "bg-gray-300 dark:bg-gray-600"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              config.enabled ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>

      {config.enabled && (
        <>
          {/* API Endpoint */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              API Endpoint
            </label>
            <input
              type="text"
              value={config.endpoint}
              onChange={(e) => update("endpoint", e.target.value)}
              placeholder="https://api.openai.com/v1/chat/completions"
              aria-label="API Endpoint"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              OpenAI-compatible endpoint. Works with OpenAI, Azure, local models (Ollama), etc.
            </p>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={config.api_key}
                onChange={(e) => update("api_key", e.target.value)}
                placeholder="sk-..."
                aria-label="API Key"
                className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 font-mono"
              />
              <button
                onClick={toggleShowKey}
                aria-label={showKey ? "Hide API key" : "Show API key"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showKey ? (
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 2c-1.82 0-3.42.5-4.78 1.34L1.78 1.9A.75.75 0 00.72 3l14 12.5a.75.75 0 01-1.06 1.06l-2.32-2.07A7.96 7.96 0 018 14C3.58 14 0 8 0 8s1.27-2.06 3.4-3.86L1.78 2.56A.75.75 0 012.84 1.5l1.42 1.27C5.58 2.12 6.74 2 8 2z" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 2C4.36 2 1.16 4.64 0 8c1.16 3.36 4.36 6 8 6s6.84-2.64 8-6c-1.16-3.36-4.36-6-8-6zm0 10a4 4 0 110-8 4 4 0 010 8zm0-6.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Model
            </label>
            <input
              type="text"
              value={config.model}
              onChange={(e) => update("model", e.target.value)}
              placeholder="gpt-4o-mini"
              aria-label="Model"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              e.g. gpt-4o, gpt-4o-mini, claude-3-sonnet, llama3
            </p>
          </div>

          {/* Temperature + Max Tokens */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Temperature
              </label>
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={config.temperature}
                onChange={(e) => update("temperature", parseFloat(e.target.value) || 0.3)}
                aria-label="Temperature"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Tokens
              </label>
              <input
                type="number"
                min="256"
                max="32768"
                step="256"
                value={config.max_tokens}
                onChange={(e) => update("max_tokens", parseInt(e.target.value) || 4096)}
                aria-label="Max Tokens"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
              />
            </div>
          </div>
        </>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || loadFailed}
        className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium text-sm transition-colors"
      >
        {saving ? "Saving..." : loadFailed ? "Settings unavailable" : "Save LLM Settings"}
      </button>
    </div>
  );
});

import { useState, useEffect, useCallback, useRef, memo } from "react";
import { useTranslation } from "react-i18next";
import type { LlmConfig } from "../lib/types";
import { parseError } from "../lib/types";
import { getSettings, updateSettings, listLlmModels } from "../lib/tauri";
import { SelectDropdown, type SelectOption } from "./ui/SelectDropdown";
import { Modal, PrimaryButton, popoverAnimation } from "./ui/primitives";
import {
  LLM_DEFAULT_REVIEW_PROMPT,
  LLM_PROMPT_DIFF_PLACEHOLDER,
  isDefaultPrompt,
  modelsUrlFor,
  promptEditorValue,
  promptToStore,
} from "../lib/llm";

const FALLBACK_CONFIG: LlmConfig = {
  enabled: false,
  api_key: "",
  endpoint: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4o-mini",
  review_prompt: "",
  temperature: 0.3,
  max_tokens: 4096,
  key_in_keychain: false,
};

interface LlmSettingsProps {
  onError: (msg: string) => void;
}

export const LlmSettings = memo(function LlmSettings({ onError }: LlmSettingsProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<LlmConfig>(FALLBACK_CONFIG);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    getSettings().then((s) => {
      // Files written before the prompt was editable have no field at all.
      const llm = { ...FALLBACK_CONFIG, ...s.llm, review_prompt: s.llm.review_prompt ?? "" };
      // The editor edits the text itself, not the stored marker: an
      // untouched built-in prompt is saved back as "" (see promptToStore),
      // so it keeps tracking improvements to the default.
      setConfig({ ...llm, review_prompt: promptEditorValue(llm.review_prompt) });
    }).catch((e) => {
      setLoadFailed(true);
      onErrorRef.current(t("settings.llm.failLoad", { error: String(e) }));
    });
  }, []);

  /**
   * Fetches the model list from the endpoint currently in the form (not the
   * saved one), so a just-typed base URL can be tried before saving. The
   * request is keyed so a slow answer for an older URL never overwrites the
   * result of a newer one.
   */
  const modelsRequest = useRef(0);
  const fetchModels = useCallback(async () => {
    const request = ++modelsRequest.current;
    setModelsLoading(true);
    setModelsError(null);
    try {
      const list = await listLlmModels(config.endpoint, config.api_key);
      if (modelsRequest.current !== request) return;
      setModels(list);
    } catch (e) {
      if (modelsRequest.current !== request) return;
      setModels([]);
      setModelsError(parseError(e));
    } finally {
      if (modelsRequest.current === request) setModelsLoading(false);
    }
  }, [config.endpoint, config.api_key]);

  // Drop a list that belongs to a URL the user has since edited: offering
  // models of another provider would make the picker lie.
  const modelsEndpoint = useRef(config.endpoint);
  useEffect(() => {
    if (modelsEndpoint.current === config.endpoint) return;
    modelsEndpoint.current = config.endpoint;
    modelsRequest.current += 1;
    setModels([]);
    setModelsError(null);
    setModelsLoading(false);
  }, [config.endpoint]);

  // Only a fetched list makes the selector useful: a single "the model you
  // already typed" row would be a menu that can only pick itself. Any model
  // can still be typed in the field beside it.
  const modelOptions: SelectOption[] = models.map((id) => ({ value: id, label: id }));

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const settings = await getSettings();
      const llm = { ...config, review_prompt: promptToStore(config.review_prompt) };
      await updateSettings({ ...settings, llm });
    } catch (e) {
      onError(parseError(e));
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
            {t("settings.llm.enable")}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t("settings.llm.enableDesc")}
          </div>
        </div>
        <button
          role="switch"
          aria-checked={config.enabled}
          aria-label={t("settings.llm.enableAria")}
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
              {t("settings.llm.endpoint")}
            </label>
            <input
              type="text"
              value={config.endpoint}
              onChange={(e) => update("endpoint", e.target.value)}
              placeholder="https://api.openai.com/v1/chat/completions"
              aria-label={t("settings.llm.endpointAria")}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              {t("settings.llm.endpointHint")}
            </p>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("settings.llm.apiKey")}
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={config.api_key}
                onChange={(e) => update("api_key", e.target.value)}
                placeholder="sk-..."
                aria-label={t("settings.llm.apiKeyAria")}
                className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 font-mono"
              />
              <button
                onClick={toggleShowKey}
                aria-label={showKey ? t("settings.llm.hideKey") : t("settings.llm.showKey")}
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

          {/* Model — a selector when the endpoint lists its models, with the
              text field beside it so any id (custom or fine-tuned) can be
              entered by hand. */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("settings.llm.model")}
              </label>
              <button
                type="button"
                onClick={fetchModels}
                disabled={modelsLoading || !config.endpoint.trim()}
                aria-label={t("settings.llm.fetchModels")}
                className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
              >
                <svg
                  aria-hidden="true"
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className={modelsLoading ? "animate-spin" : ""}
                >
                  <path d="M8 1.5a6.5 6.5 0 105.9 3.78.75.75 0 011.37-.61A8 8 0 118 0v1.5z" />
                </svg>
                {modelsLoading ? t("settings.llm.fetchingModels") : t("settings.llm.fetchModels")}
              </button>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <SelectDropdown
                  options={modelOptions}
                  value={config.model}
                  onChange={(model) => update("model", model)}
                  placeholder={t("settings.llm.modelPlaceholder")}
                  disabled={modelOptions.length === 0}
                  ariaLabel={t("settings.llm.modelSelectAria")}
                />
              </div>
              <input
                type="text"
                value={config.model}
                onChange={(e) => update("model", e.target.value)}
                placeholder="gpt-4o-mini"
                aria-label={t("settings.llm.modelAria")}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
              />
            </div>
            {modelsError ? (
              <p role="alert" className="text-xs text-red-500 mt-1">
                {t("settings.llm.modelsError", { error: modelsError })}
              </p>
            ) : models.length > 0 ? (
              <p className="text-xs text-gray-400 mt-1">
                {t("settings.llm.modelsLoaded", { count: models.length })}
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">{t("settings.llm.modelHint")}</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5 font-mono break-all">
              {t("settings.llm.modelsFrom", { url: modelsUrlFor(config.endpoint) })}
            </p>
          </div>

          {/* Review prompt */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("settings.llm.prompt")}
              </label>
              <span className="text-xs text-gray-400">
                {isDefaultPrompt(config.review_prompt) ? t("settings.llm.promptDefault") : t("settings.llm.promptCustom")}
              </span>
            </div>
            <textarea
              value={config.review_prompt}
              onChange={(e) => update("review_prompt", e.target.value)}
              spellCheck={false}
              rows={6}
              aria-label={t("settings.llm.promptAria")}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
            />
            <div className="flex items-center justify-between gap-2 mt-1">
              <p className="text-xs text-gray-400">
                {t("settings.llm.promptHint", { placeholder: LLM_PROMPT_DIFF_PLACEHOLDER })}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPromptOpen(true)}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  {t("settings.llm.promptExpand")}
                </button>
                <button
                  type="button"
                  onClick={() => update("review_prompt", LLM_DEFAULT_REVIEW_PROMPT)}
                  disabled={isDefaultPrompt(config.review_prompt)}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:underline disabled:text-gray-300 dark:disabled:text-gray-600 disabled:no-underline disabled:cursor-not-allowed"
                >
                  {t("settings.llm.promptReset")}
                </button>
              </div>
            </div>
          </div>

          {/* Temperature + Max Tokens */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("settings.llm.temperature")}
              </label>
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={config.temperature}
                onChange={(e) => update("temperature", parseFloat(e.target.value) || 0.3)}
                aria-label={t("settings.llm.temperatureAria")}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("settings.llm.maxTokens")}
              </label>
              <input
                type="number"
                min="256"
                max="32768"
                step="256"
                value={config.max_tokens}
                onChange={(e) => update("max_tokens", parseInt(e.target.value) || 4096)}
                aria-label={t("settings.llm.maxTokensAria")}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
              />
            </div>
          </div>
        </>
      )}

      {/* Large editor for long, multi-section prompts. Edits go straight to the
          inline value, so Cancel simply leaves whatever was typed. */}
      <Modal
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        title={t("settings.llm.prompt")}
        subtitle={t("settings.llm.promptModalSubtitle", { placeholder: LLM_PROMPT_DIFF_PLACEHOLDER })}
        width="xl"
        bodyClassName={popoverAnimation}
      >
        <div className="px-4 pb-4 pt-3 sm:px-6">
          <textarea
            value={config.review_prompt}
            onChange={(e) => update("review_prompt", e.target.value)}
            spellCheck={false}
            aria-label={t("settings.llm.promptModalAria")}
            className="w-full h-[55vh] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
          />
          <div className="flex items-center justify-between gap-3 mt-3">
            <button
              type="button"
              onClick={() => update("review_prompt", LLM_DEFAULT_REVIEW_PROMPT)}
              disabled={isDefaultPrompt(config.review_prompt)}
              className="text-xs text-gray-500 dark:text-gray-400 hover:underline disabled:text-gray-300 dark:disabled:text-gray-600 disabled:no-underline disabled:cursor-not-allowed"
            >
              {t("settings.llm.promptReset")}
            </button>
            <PrimaryButton onClick={() => setPromptOpen(false)}>{t("common.close")}</PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || loadFailed}
        className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium text-sm transition-colors"
      >
        {saving ? t("common.saving") : loadFailed ? t("settings.llm.unavailable") : t("settings.llm.save")}
      </button>
    </div>
  );
});

import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { StashInfo, TagInfo } from "../lib/types";
import { ChipButton } from "./ui/ChipButton";
import { Disclosure } from "./ui/primitives";

interface GitOpsToolbarProps {
  // Loading state
  isLoading: (name: string) => boolean;
  // Fetch/Pull/Push
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
  // Stash
  onStash: () => void;
  stashMsg: string;
  onStashMsgChange: (msg: string) => void;
  stashIncludeUntracked: boolean;
  onStashIncludeUntrackedChange: (v: boolean) => void;
  onPop: () => void;
  onToggleStashList: () => void;
  showStashList: boolean;
  stashList: StashInfo[];
  onShowStash: (index: number) => void;
  onStashApply: (index: number) => void;
  onStashPopAt: (index: number) => void;
  onStashDrop: (index: number) => void;
  // Tags
  tagName: string;
  onTagNameChange: (name: string) => void;
  tagMsg: string;
  onTagMsgChange: (msg: string) => void;
  onCreateTag: () => void;
  onToggleTagList: () => void;
  showTagList: boolean;
  tagList: TagInfo[];
  onPushTag: (name: string) => void;
  onDeleteTag: (name: string) => void;
  // Reset
  resetTarget: string;
  onResetTargetChange: (target: string) => void;
  resetMode: "soft" | "mixed" | "hard";
  onResetModeChange: (mode: "soft" | "mixed" | "hard") => void;
  onReset: () => void;
  // Patch
  patchCommitHash: string;
  onPatchCommitHashChange: (hash: string) => void;
  onCreatePatch: () => void;
  onLoadPatchFile: () => void;
  showPatchPanel: boolean;
  onTogglePatchPanel: () => void;
  patchContent: string;
  onCopyPatch: () => void;
  onApplyPatch: () => void;
  // Clean
  onCleanPreview: () => void;
  cleanIncludeIgnored: boolean;
  onCleanIncludeIgnoredChange: (v: boolean) => void;
  showCleanPreview: boolean;
  cleanFiles: string[];
  onCleanExecute: () => void;
  onCancelClean: () => void;
  // Stash diff preview
  stashDiff: string | null;
  stashDiffIndex: number | null;
  onClearStashDiff: () => void;
}

export const GitOpsToolbar = memo(function GitOpsToolbar(props: GitOpsToolbarProps) {
  const {
    isLoading,
    onFetch, onPull, onPush,
    onStash, stashMsg, onStashMsgChange, stashIncludeUntracked, onStashIncludeUntrackedChange,
    onPop, onToggleStashList, showStashList, stashList,
    onShowStash, onStashApply, onStashPopAt, onStashDrop,
    tagName, onTagNameChange, tagMsg, onTagMsgChange, onCreateTag,
    onToggleTagList, showTagList, tagList, onPushTag, onDeleteTag,
    resetTarget, onResetTargetChange, resetMode, onResetModeChange, onReset,
    patchCommitHash, onPatchCommitHashChange, onCreatePatch, onLoadPatchFile,
    showPatchPanel, onTogglePatchPanel, patchContent, onCopyPatch, onApplyPatch,
    onCleanPreview, cleanIncludeIgnored, onCleanIncludeIgnoredChange,
    showCleanPreview, cleanFiles, onCleanExecute, onCancelClean,
    stashDiff, stashDiffIndex, onClearStashDiff,
  } = props;
  const { t } = useTranslation();

  return (
    <>
      {/* Action buttons */}
      <div className="flex flex-wrap gap-1.5 min-w-0">
        <ChipButton
          onClick={onFetch}
          disabled={isLoading("fetch")}
          aria-label={t("gitops.fetchAria")}
          tone="surface"
          size="md"
        >
          {isLoading("fetch") ? t("gitops.fetchLoading") : t("gitops.fetch")}
        </ChipButton>
        <ChipButton
          onClick={onPull}
          disabled={isLoading("pull")}
          aria-label={t("gitops.pullAria")}
          tone="blue"
          size="md"
        >
          {isLoading("pull") ? t("gitops.pullLoading") : t("gitops.pull")}
        </ChipButton>
        <ChipButton
          onClick={onPush}
          disabled={isLoading("push")}
          aria-label={t("gitops.pushAria")}
          tone="green"
          size="md"
        >
          {isLoading("push") ? t("gitops.pushLoading") : t("gitops.push")}
        </ChipButton>
        <ChipButton
          onClick={onStash}
          disabled={isLoading("stash")}
          aria-label={t("gitops.stashAria")}
          tone="amber"
          size="md"
        >
          {isLoading("stash") ? t("gitops.stashLoading") : t("gitops.stash")}
        </ChipButton>
        <input
          type="text"
          value={stashMsg}
          onChange={(e) => onStashMsgChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onStash()}
          placeholder={t("gitops.stashMsgPlaceholder")}
          aria-label={t("gitops.stashMsgAria")}
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs min-w-0 flex-1 basis-24 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
        <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          <input
            type="checkbox"
            checked={stashIncludeUntracked}
            onChange={(e) => onStashIncludeUntrackedChange(e.target.checked)}
            className="rounded"
          />
          {t("gitops.includeUntracked")}
        </label>
        <ChipButton
          onClick={onPop}
          disabled={isLoading("pop")}
          aria-label={t("gitops.popAria")}
          tone="purple"
          size="md"
        >
          {isLoading("pop") ? t("gitops.popLoading") : t("gitops.pop")}
        </ChipButton>
        <ChipButton
          onClick={onToggleStashList}
          aria-label={t("gitops.toggleStashList")}
          aria-expanded={showStashList}
          tone="surface"
          size="md"
        >
          {t("gitops.stashList", { count: stashList.length })}
        </ChipButton>
      </div>

      {/* Stash list — Disclosure folds the grid row so the list grows out of
          the trigger line instead of popping in mounted. */}
      <Disclosure open={showStashList}>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {stashList.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">{t("gitops.noStash")}</p>
          ) : (
            stashList.map((s) => (
              <div key={s.index} className="flex items-center gap-2 text-xs">
                <span className="w-8 text-center px-1.5 py-0.5 rounded font-mono bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">
                  {s.index}
                </span>
                <span className="flex-1 truncate text-gray-700 dark:text-gray-300 font-mono">
                  {s.message}
                </span>
                <ChipButton
                  onClick={() => onShowStash(s.index)}
                  tone="gray"
                  size="sm"
                  aria-label={`${t("gitops.showStashPrefix")}{${s.index}}`}
                  title={t("gitops.showDiff")}
                >
                  {t("gitops.showDiff")}
                </ChipButton>
                <ChipButton
                  onClick={() => onStashApply(s.index)}
                  disabled={isLoading("stash_apply")}
                  tone="blue"
                  size="sm"
                  aria-label={`${t("gitops.applyStashPrefix")}{${s.index}}`}
                  title={t("gitops.apply")}
                >
                  {t("gitops.apply")}
                </ChipButton>
                <ChipButton
                  onClick={() => onStashPopAt(s.index)}
                  disabled={isLoading("pop")}
                  tone="purple"
                  size="sm"
                  aria-label={`${t("gitops.popStashPrefix")}{${s.index}}`}
                  title={t("gitops.pop")}
                >
                  {t("gitops.pop")}
                </ChipButton>
                <ChipButton
                  onClick={() => onStashDrop(s.index)}
                  disabled={isLoading("stash_drop")}
                  tone="red"
                  size="sm"
                  aria-label={`${t("gitops.dropStashPrefix")}{${s.index}}`}
                  title={t("gitops.dropStash")}
                >
                  {t("gitops.dropStash")}
                </ChipButton>
              </div>
            ))
          )}
        </div>
      </Disclosure>

      {/* Tags section */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={tagName}
          onChange={(e) => onTagNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreateTag()}
          placeholder={t("gitops.tagNamePlaceholder")}
          aria-label={t("gitops.tagNameAria")}
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs min-w-0 flex-1 basis-24 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
        <input
          type="text"
          value={tagMsg}
          onChange={(e) => onTagMsgChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreateTag()}
          placeholder={t("gitops.tagMsgPlaceholder")}
          aria-label={t("gitops.tagMsgAria")}
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs min-w-0 flex-1 basis-24 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
        <ChipButton
          onClick={onCreateTag}
          disabled={!tagName.trim() || isLoading("tag_create")}
          aria-label={t("gitops.createTagAria")}
          tone="cyan"
          size="md"
        >
          {isLoading("tag_create") ? t("gitops.createTagLoading") : t("gitops.createTag")}
        </ChipButton>
        <ChipButton
          onClick={onToggleTagList}
          aria-label={t("gitops.toggleTagList")}
          aria-expanded={showTagList}
          tone="surface"
          size="md"
        >
          {t("gitops.tagList", { count: tagList.length })}
        </ChipButton>
      </div>

      {/* Reset section */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={resetTarget}
          onChange={(e) => onResetTargetChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onReset()}
          placeholder={t("gitops.resetTargetPlaceholder")}
          aria-label={t("gitops.resetTargetAria")}
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs min-w-0 flex-1 basis-24 font-mono focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
        <select
          value={resetMode}
          onChange={(e) => onResetModeChange(e.target.value as "soft" | "mixed" | "hard")}
          aria-label={t("gitops.resetModeAria")}
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs focus:outline-none focus:ring-2 focus:ring-yellow-500"
        >
          <option value="soft">{t("gitops.resetSoft")}</option>
          <option value="mixed">{t("gitops.resetMixed")}</option>
          <option value="hard">{t("gitops.resetHard")}</option>
        </select>
        <ChipButton
          onClick={onReset}
          disabled={!resetTarget.trim() || isLoading("reset")}
          aria-label={t("gitops.resetAria")}
          tone="orange"
          size="md"
        >
          {isLoading("reset") ? t("gitops.resetLoading") : t("gitops.reset")}
        </ChipButton>
      </div>

      {/* Patch section */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={patchCommitHash}
          onChange={(e) => onPatchCommitHashChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreatePatch()}
          placeholder={t("gitops.patchHashPlaceholder")}
          aria-label={t("gitops.patchHashAria")}
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs min-w-0 flex-1 basis-24 font-mono focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
        <ChipButton
          onClick={onCreatePatch}
          disabled={!patchCommitHash.trim() || isLoading("patch_create")}
          aria-label={t("gitops.createPatchAria")}
          tone="indigo"
          size="md"
        >
          {isLoading("patch_create") ? t("gitops.createPatchLoading") : t("gitops.createPatch")}
        </ChipButton>
        <ChipButton
          onClick={onLoadPatchFile}
          aria-label={t("gitops.loadPatchAria")}
          tone="violet"
          size="md"
        >
          {t("gitops.loadPatch")}
        </ChipButton>
        <ChipButton
          onClick={onTogglePatchPanel}
          disabled={!patchContent}
          aria-label={t("gitops.togglePatchAria")}
          aria-expanded={showPatchPanel}
          tone="surface"
          size="md"
        >
          {showPatchPanel ? t("gitops.hidePatch") : t("gitops.previewPatch")}
        </ChipButton>
      </div>

      {/* Patch preview panel */}
      <Disclosure open={showPatchPanel && !!patchContent}>
        <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{t("gitops.patchContent")}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={onCopyPatch}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                aria-label={t("gitops.copyPatchAria")}
              >
                {t("gitops.copyPatch")}
              </button>
              <button
                onClick={onApplyPatch}
                disabled={isLoading("patch_apply")}
                className="px-2 py-0.5 rounded text-xs font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {isLoading("patch_apply") ? t("gitops.applyPatchLoading") : t("gitops.applyPatch")}
              </button>
            </div>
          </div>
          <pre className="select-text p-3 text-xs font-mono max-h-48 overflow-y-auto whitespace-pre-wrap break-all text-gray-800 dark:text-gray-200">
            {patchContent}
          </pre>
        </div>
      </Disclosure>

      {/* Clean section */}
      <div className="flex items-center gap-2 flex-wrap">
        <ChipButton
          onClick={onCleanPreview}
          tone="gray"
          size="md"
        >
          {t("gitops.previewClean")}
        </ChipButton>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={cleanIncludeIgnored}
            onChange={(e) => onCleanIncludeIgnoredChange(e.target.checked)}
            className="rounded"
          />
          {t("gitops.includeIgnored")}
        </label>
      </div>
      <Disclosure open={showCleanPreview && cleanFiles.length > 0}>
        <div className="space-y-2 p-2 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800/30">
          <p className="text-xs font-medium text-red-700 dark:text-red-300">
            {t("gitops.cleanFiles", { count: cleanFiles.length })}
          </p>
          <div className="max-h-24 overflow-y-auto space-y-0.5">
            {cleanFiles.map((f) => (
              <p key={f} className="text-xs font-mono text-red-600 dark:text-red-400">{f}</p>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCleanExecute}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              {t("gitops.deleteCleanFiles", { count: cleanFiles.length })}
            </button>
            <button
              onClick={onCancelClean}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </Disclosure>
      {showCleanPreview && cleanFiles.length === 0 && (
        <p className="text-xs text-gray-500 italic">{t("gitops.noCleanFiles")}</p>
      )}

      {/* Tag list */}
      <Disclosure open={showTagList}>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {tagList.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">{t("gitops.noTags")}</p>
          ) : (
            tagList.map((tag) => (
              <div key={tag.name} className="flex items-center gap-2 text-xs">
                <span className="px-1.5 py-0.5 rounded font-mono bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300">
                  {tag.name}
                </span>
                <span className="flex-1 truncate text-gray-500 dark:text-gray-400 font-mono">
                  {tag.target_oid.slice(0, 7)}{tag.message ? ` — ${tag.message}` : ""}
                </span>
                <ChipButton
                  onClick={() => onPushTag(tag.name)}
                  disabled={isLoading("tag_push")}
                  tone="green"
                  size="sm"
                  aria-label={t("gitops.pushTagAria", { name: tag.name })}
                  title={t("gitops.pushTag")}
                >
                  {t("gitops.pushTag")}
                </ChipButton>
                <ChipButton
                  onClick={() => onDeleteTag(tag.name)}
                  disabled={isLoading("tag_delete")}
                  tone="red"
                  size="sm"
                  aria-label={t("gitops.deleteTagAria", { name: tag.name })}
                  title={t("gitops.deleteTag")}
                >
                  {t("gitops.deleteTag")}
                </ChipButton>
              </div>
            ))
          )}
        </div>
      </Disclosure>

      {/* Stash diff preview */}
      <Disclosure open={stashDiff !== null && stashDiffIndex !== null}>
        <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-[var(--border-color)]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{`${t("gitops.stashDiffPrefix")}{${stashDiffIndex}}${t("gitops.stashDiffSuffix")}`}</span>
            <button onClick={onClearStashDiff} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <pre className="select-text text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto whitespace-pre">{stashDiff}</pre>
        </div>
      </Disclosure>
    </>
  );
});

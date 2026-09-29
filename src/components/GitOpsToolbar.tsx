import { memo } from "react";
import type { StashInfo, TagInfo } from "../lib/types";
import { ChipButton } from "./ui/ChipButton";

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

  return (
    <>
      {/* Action buttons */}
      <div className="flex flex-wrap gap-1.5 min-w-0">
        <ChipButton
          onClick={onFetch}
          disabled={isLoading("fetch")}
          aria-label="Fetch from remote"
          tone="surface"
          size="md"
        >
          {isLoading("fetch") ? "Fetching..." : "Fetch"}
        </ChipButton>
        <ChipButton
          onClick={onPull}
          disabled={isLoading("pull")}
          aria-label="Pull from remote"
          tone="blue"
          size="md"
        >
          {isLoading("pull") ? "Pulling..." : "Pull"}
        </ChipButton>
        <ChipButton
          onClick={onPush}
          disabled={isLoading("push")}
          aria-label="Push to remote"
          tone="green"
          size="md"
        >
          {isLoading("push") ? "Pushing..." : "Push"}
        </ChipButton>
        <ChipButton
          onClick={onStash}
          disabled={isLoading("stash")}
          aria-label="Stash changes"
          tone="amber"
          size="md"
        >
          {isLoading("stash") ? "Stashing..." : "Stash"}
        </ChipButton>
        <input
          type="text"
          value={stashMsg}
          onChange={(e) => onStashMsgChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onStash()}
          placeholder="Stash message (optional)"
          aria-label="Stash message"
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs min-w-0 flex-1 basis-24 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
        <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          <input
            type="checkbox"
            checked={stashIncludeUntracked}
            onChange={(e) => onStashIncludeUntrackedChange(e.target.checked)}
            className="rounded"
          />
          Include untracked
        </label>
        <ChipButton
          onClick={onPop}
          disabled={isLoading("pop")}
          aria-label="Pop stash"
          tone="purple"
          size="md"
        >
          {isLoading("pop") ? "Popping..." : "Pop"}
        </ChipButton>
        <ChipButton
          onClick={onToggleStashList}
          aria-label="Toggle stash list"
          aria-expanded={showStashList}
          tone="surface"
          size="md"
        >
          Stash List {stashList.length > 0 ? `(${stashList.length})` : ""}
        </ChipButton>
      </div>

      {/* Stash list */}
      {showStashList && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {stashList.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">No stash entries</p>
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
                  aria-label={`Show stash@{${s.index}}`}
                  title="Show diff"
                >
                  Show
                </ChipButton>
                <ChipButton
                  onClick={() => onStashApply(s.index)}
                  disabled={isLoading("stash_apply")}
                  tone="blue"
                  size="sm"
                  aria-label={`Apply stash@{${s.index}}`}
                  title="Apply"
                >
                  Apply
                </ChipButton>
                <ChipButton
                  onClick={() => onStashPopAt(s.index)}
                  disabled={isLoading("pop")}
                  tone="purple"
                  size="sm"
                  aria-label={`Pop stash@{${s.index}}`}
                  title="Pop"
                >
                  Pop
                </ChipButton>
                <ChipButton
                  onClick={() => onStashDrop(s.index)}
                  disabled={isLoading("stash_drop")}
                  tone="red"
                  size="sm"
                  aria-label={`Drop stash@{${s.index}}`}
                  title="Drop"
                >
                  Drop
                </ChipButton>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tags section */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={tagName}
          onChange={(e) => onTagNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreateTag()}
          placeholder="Tag name"
          aria-label="Tag name"
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs min-w-0 flex-1 basis-24 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
        <input
          type="text"
          value={tagMsg}
          onChange={(e) => onTagMsgChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreateTag()}
          placeholder="Tag message (optional)"
          aria-label="Tag message"
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs min-w-0 flex-1 basis-24 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
        <ChipButton
          onClick={onCreateTag}
          disabled={!tagName.trim() || isLoading("tag_create")}
          aria-label="Create tag"
          tone="cyan"
          size="md"
        >
          {isLoading("tag_create") ? "Creating..." : "Create Tag"}
        </ChipButton>
        <ChipButton
          onClick={onToggleTagList}
          aria-label="Toggle tag list"
          aria-expanded={showTagList}
          tone="surface"
          size="md"
        >
          Tag List {tagList.length > 0 ? `(${tagList.length})` : ""}
        </ChipButton>
      </div>

      {/* Reset section */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={resetTarget}
          onChange={(e) => onResetTargetChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onReset()}
          placeholder="HEAD~1, commit hash..."
          aria-label="Reset target"
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs min-w-0 flex-1 basis-24 font-mono focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
        <select
          value={resetMode}
          onChange={(e) => onResetModeChange(e.target.value as "soft" | "mixed" | "hard")}
          aria-label="Reset mode"
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs focus:outline-none focus:ring-2 focus:ring-yellow-500"
        >
          <option value="soft">Soft (keep staged)</option>
          <option value="mixed">Mixed (unstage)</option>
          <option value="hard">Hard (discard)</option>
        </select>
        <ChipButton
          onClick={onReset}
          disabled={!resetTarget.trim() || isLoading("reset")}
          aria-label="Reset"
          tone="orange"
          size="md"
        >
          {isLoading("reset") ? "Resetting..." : "Reset"}
        </ChipButton>
      </div>

      {/* Patch section */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={patchCommitHash}
          onChange={(e) => onPatchCommitHashChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreatePatch()}
          placeholder="Commit hash for patch..."
          aria-label="Commit hash for patch"
          className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs min-w-0 flex-1 basis-24 font-mono focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
        <ChipButton
          onClick={onCreatePatch}
          disabled={!patchCommitHash.trim() || isLoading("patch_create")}
          aria-label="Create patch from commit"
          tone="indigo"
          size="md"
        >
          {isLoading("patch_create") ? "Creating..." : "Create Patch"}
        </ChipButton>
        <ChipButton
          onClick={onLoadPatchFile}
          aria-label="Load patch from file"
          tone="violet"
          size="md"
        >
          Load .patch
        </ChipButton>
        <ChipButton
          onClick={onTogglePatchPanel}
          disabled={!patchContent}
          aria-label="Toggle patch preview"
          aria-expanded={showPatchPanel}
          tone="surface"
          size="md"
        >
          {showPatchPanel ? "Hide Patch" : "Preview Patch"}
        </ChipButton>
      </div>

      {/* Patch preview panel */}
      {showPatchPanel && patchContent && (
        <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Patch Content</span>
            <div className="flex items-center gap-2">
              <button
                onClick={onCopyPatch}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                aria-label="Copy patch to clipboard"
              >
                Copy
              </button>
              <button
                onClick={onApplyPatch}
                disabled={isLoading("patch_apply")}
                className="px-2 py-0.5 rounded text-xs font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {isLoading("patch_apply") ? "Applying..." : "Apply Patch"}
              </button>
            </div>
          </div>
          <pre className="select-text p-3 text-xs font-mono max-h-48 overflow-y-auto whitespace-pre-wrap break-all text-gray-800 dark:text-gray-200">
            {patchContent}
          </pre>
        </div>
      )}

      {/* Clean section */}
      <div className="flex items-center gap-2 flex-wrap">
        <ChipButton
          onClick={onCleanPreview}
          tone="gray"
          size="md"
        >
          Preview Clean
        </ChipButton>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={cleanIncludeIgnored}
            onChange={(e) => onCleanIncludeIgnoredChange(e.target.checked)}
            className="rounded"
          />
          Include ignored
        </label>
      </div>
      {showCleanPreview && cleanFiles.length > 0 && (
        <div className="space-y-2 p-2 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800/30">
          <p className="text-xs font-medium text-red-700 dark:text-red-300">
            {cleanFiles.length} file{cleanFiles.length !== 1 ? "s" : ""} will be deleted:
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
              Delete {cleanFiles.length} file{cleanFiles.length !== 1 ? "s" : ""}
            </button>
            <button
              onClick={onCancelClean}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {showCleanPreview && cleanFiles.length === 0 && (
        <p className="text-xs text-gray-500 italic">No untracked files to clean</p>
      )}

      {/* Tag list */}
      {showTagList && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {tagList.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">No tags</p>
          ) : (
            tagList.map((t) => (
              <div key={t.name} className="flex items-center gap-2 text-xs">
                <span className="px-1.5 py-0.5 rounded font-mono bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300">
                  {t.name}
                </span>
                <span className="flex-1 truncate text-gray-500 dark:text-gray-400 font-mono">
                  {t.target_oid.slice(0, 7)}{t.message ? ` — ${t.message}` : ""}
                </span>
                <ChipButton
                  onClick={() => onPushTag(t.name)}
                  disabled={isLoading("tag_push")}
                  tone="green"
                  size="sm"
                  aria-label={`Push tag ${t.name}`}
                  title="Push"
                >
                  Push
                </ChipButton>
                <ChipButton
                  onClick={() => onDeleteTag(t.name)}
                  disabled={isLoading("tag_delete")}
                  tone="red"
                  size="sm"
                  aria-label={`Delete tag ${t.name}`}
                  title="Delete"
                >
                  Del
                </ChipButton>
              </div>
            ))
          )}
        </div>
      )}

      {/* Stash diff preview */}
      {stashDiff !== null && stashDiffIndex !== null && (
        <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-[var(--border-color)]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Stash@{'{' + stashDiffIndex + '}'} Diff</span>
            <button onClick={onClearStashDiff} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <pre className="select-text text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto whitespace-pre">{stashDiff}</pre>
        </div>
      )}
    </>
  );
});

import { memo } from "react";
import type { StashInfo, TagInfo } from "../lib/types";

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
        <button
          onClick={onFetch}
          disabled={isLoading("fetch")}
          aria-label="Fetch from remote"
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[var(--surface-2)] text-gray-700 dark:text-gray-300 border border-[var(--border-color)] hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
        >
          {isLoading("fetch") ? "Fetching..." : "Fetch"}
        </button>
        <button
          onClick={onPull}
          disabled={isLoading("pull")}
          aria-label="Pull from remote"
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 hover:bg-blue-200 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
        >
          {isLoading("pull") ? "Pulling..." : "Pull"}
        </button>
        <button
          onClick={onPush}
          disabled={isLoading("push")}
          aria-label="Push to remote"
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800/50 hover:bg-green-200 dark:hover:bg-green-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
        >
          {isLoading("push") ? "Pushing..." : "Push"}
        </button>
        <button
          onClick={onStash}
          disabled={isLoading("stash")}
          aria-label="Stash changes"
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 hover:bg-amber-200 dark:hover:bg-amber-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
        >
          {isLoading("stash") ? "Stashing..." : "Stash"}
        </button>
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
        <button
          onClick={onPop}
          disabled={isLoading("pop")}
          aria-label="Pop stash"
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 hover:bg-purple-200 dark:hover:bg-purple-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
        >
          {isLoading("pop") ? "Popping..." : "Pop"}
        </button>
        <button
          onClick={onToggleStashList}
          aria-label="Toggle stash list"
          aria-expanded={showStashList}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[var(--surface-2)] text-gray-700 dark:text-gray-300 border border-[var(--border-color)] hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-150 active:scale-[0.98]"
        >
          Stash List {stashList.length > 0 ? `(${stashList.length})` : ""}
        </button>
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
                <button
                  onClick={() => onShowStash(s.index)}
                  className="px-1.5 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-150 active:scale-[0.98]"
                  aria-label={`Show stash@{${s.index}}`}
                  title="Show diff"
                >
                  Show
                </button>
                <button
                  onClick={() => onStashApply(s.index)}
                  disabled={isLoading("stash_apply")}
                  className="px-1.5 py-0.5 rounded-lg bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 hover:bg-blue-200 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
                  aria-label={`Apply stash@{${s.index}}`}
                  title="Apply"
                >
                  Apply
                </button>
                <button
                  onClick={() => onStashPopAt(s.index)}
                  disabled={isLoading("pop")}
                  className="px-1.5 py-0.5 rounded-lg bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 hover:bg-purple-200 dark:hover:bg-purple-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
                  aria-label={`Pop stash@{${s.index}}`}
                  title="Pop"
                >
                  Pop
                </button>
                <button
                  onClick={() => onStashDrop(s.index)}
                  disabled={isLoading("stash_drop")}
                  className="px-1.5 py-0.5 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50 hover:bg-red-200 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
                  aria-label={`Drop stash@{${s.index}}`}
                  title="Drop"
                >
                  Drop
                </button>
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
        <button
          onClick={onCreateTag}
          disabled={!tagName.trim() || isLoading("tag_create")}
          aria-label="Create tag"
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-cyan-100 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/50 hover:bg-cyan-200 dark:hover:bg-cyan-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
        >
          {isLoading("tag_create") ? "Creating..." : "Create Tag"}
        </button>
        <button
          onClick={onToggleTagList}
          aria-label="Toggle tag list"
          aria-expanded={showTagList}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[var(--surface-2)] text-gray-700 dark:text-gray-300 border border-[var(--border-color)] hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-150 active:scale-[0.98]"
        >
          Tag List {tagList.length > 0 ? `(${tagList.length})` : ""}
        </button>
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
        <button
          onClick={onReset}
          disabled={!resetTarget.trim() || isLoading("reset")}
          aria-label="Reset"
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/50 hover:bg-orange-200 dark:hover:bg-orange-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
        >
          {isLoading("reset") ? "Resetting..." : "Reset"}
        </button>
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
        <button
          onClick={onCreatePatch}
          disabled={!patchCommitHash.trim() || isLoading("patch_create")}
          aria-label="Create patch from commit"
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-200 dark:hover:bg-indigo-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
        >
          {isLoading("patch_create") ? "Creating..." : "Create Patch"}
        </button>
        <button
          onClick={onLoadPatchFile}
          aria-label="Load patch from file"
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/50 hover:bg-violet-200 dark:hover:bg-violet-900/40 transition-colors duration-150 active:scale-[0.98]"
        >
          Load .patch
        </button>
        <button
          onClick={onTogglePatchPanel}
          disabled={!patchContent}
          aria-label="Toggle patch preview"
          aria-expanded={showPatchPanel}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[var(--surface-2)] text-gray-700 dark:text-gray-300 border border-[var(--border-color)] hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
        >
          {showPatchPanel ? "Hide Patch" : "Preview Patch"}
        </button>
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
          <pre className="p-3 text-xs font-mono max-h-48 overflow-y-auto whitespace-pre-wrap break-all text-gray-800 dark:text-gray-200">
            {patchContent}
          </pre>
        </div>
      )}

      {/* Clean section */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onCleanPreview}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-150 active:scale-[0.98]"
        >
          Preview Clean
        </button>
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
                <button
                  onClick={() => onPushTag(t.name)}
                  disabled={isLoading("tag_push")}
                  className="px-1.5 py-0.5 rounded-lg bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800/50 hover:bg-green-200 dark:hover:bg-green-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
                  aria-label={`Push tag ${t.name}`}
                  title="Push"
                >
                  Push
                </button>
                <button
                  onClick={() => onDeleteTag(t.name)}
                  disabled={isLoading("tag_delete")}
                  className="px-1.5 py-0.5 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50 hover:bg-red-200 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
                  aria-label={`Delete tag ${t.name}`}
                  title="Delete"
                >
                  Del
                </button>
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
          <pre className="text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto whitespace-pre">{stashDiff}</pre>
        </div>
      )}
    </>
  );
});

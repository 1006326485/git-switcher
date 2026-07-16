# Git Log Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual commit log with branch topology visualization to GitOpsPanel

**Architecture:** Extend existing CommitInfo type with refs field, implement frontend lane assignment algorithm, create CommitLog component, integrate into GitOpsPanel

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Tauri 2 (Rust), git2

## Global Constraints

- Follow existing patterns: memo() + useCallback for perf
- Error handling: use parseError() from types.ts
- UI components: use existing UI primitives from ui/primitives.ts
- State management: React hooks + Context (no Redux/Zustand)
- All git operations via spawn_blocking (libgit2 is sync, Tauri commands are async)

---

## Task 1: Add refs field to backend CommitInfo

**Files:**
- Modify: `src-tauri/src/models/project.rs:97-106`

**Interfaces:**
- Produces: `CommitInfo` struct with new `refs: Vec<String>` field

- [ ] **Step 1: Add refs field to CommitInfo struct**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub parents: Vec<String>,
    pub refs: Vec<String>,  // NEW: branch/tag names pointing to this commit
}
```

- [ ] **Step 2: Verify Rust type check**

Run: `cargo check`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/models/project.rs
git commit -m "feat: add refs field to CommitInfo struct"
```

---

## Task 2: Modify get_log to collect refs information

**Files:**
- Modify: `src-tauri/src/services/git_service.rs:1086-1178`

**Interfaces:**
- Consumes: `CommitInfo` struct from Task 1
- Produces: `get_log` method returns `Vec<CommitInfo>` with refs populated

- [ ] **Step 1: Add refs collection in get_log method**

Find the `commits.push(CommitInfo { ... })` block in `get_log` method and add refs collection:

```rust
// After line 1162 (let parents: Vec<String> = ...)
// Add refs collection:
let refs: Vec<String> = repo.references()
    .map_err(|e| AppError::Git(format!("Failed to get references: {}", e)))?
    .filter_map(|r| r.ok())
    .filter(|r| r.target() == Some(oid))
    .filter_map(|r| {
        r.name().map(|n| {
            // Strip refs/heads/ and refs/tags/ prefixes for display
            let name = n.to_string();
            if name.starts_with("refs/heads/") {
                name[11..].to_string()
            } else if name.starts_with("refs/tags/") {
                name[10..].to_string()
            } else if name.starts_with("refs/remotes/") {
                name[13..].to_string()
            } else {
                name
            }
        }).ok()
    })
    .collect();
```

- [ ] **Step 2: Update CommitInfo initialization**

Update the `commits.push(CommitInfo { ... })` block to include refs:

```rust
commits.push(CommitInfo {
    short_hash: oid_s[..short_len].to_string(),
    hash: oid_s,
    message: commit_msg,
    author: author_name,
    email: commit_author.email().unwrap_or("").to_string(),
    timestamp: commit_ts,
    parents,
    refs,  // NEW
});
```

- [ ] **Step 3: Verify Rust type check**

Run: `cargo check`
Expected: PASS (no errors)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/git_service.rs
git commit -m "feat: collect refs information in get_log method"
```

---

## Task 3: Add refs field to frontend CommitInfo type

**Files:**
- Modify: `src/lib/types.ts:73-81`

**Interfaces:**
- Produces: `CommitInfo` interface with new `refs: string[]` field

- [ ] **Step 1: Add refs field to CommitInfo interface**

```typescript
export interface CommitInfo {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  email: string;
  timestamp: number;
  parents: string[];
  refs: string[];  // NEW: branch/tag names pointing to this commit
}
```

- [ ] **Step 2: Verify TypeScript type check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add refs field to CommitInfo interface"
```

---

## Task 4: Create CommitLog component

**Files:**
- Create: `src/components/CommitLog.tsx`

**Interfaces:**
- Consumes: `CommitInfo` type from Task 3, `gitGetLog` from tauri.ts
- Produces: `CommitLog` component with props `{ path: string; maxCount?: number }`

- [ ] **Step 1: Create CommitLog component with lane assignment algorithm**

```typescript
import { useState, useEffect, useCallback, memo } from "react";
import * as api from "../lib/tauri";
import type { CommitInfo } from "../lib/types";
import { parseError } from "../lib/types";

interface CommitLogProps {
  path: string;
  maxCount?: number;
}

const LANE_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-red-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-cyan-500",
];

function assignLanes(commits: CommitInfo[]): Map<string, number> {
  const laneMap = new Map<string, number>();
  const activeLanes = new Map<string, number>();
  let nextLane = 0;

  for (const commit of commits) {
    // Get current lane for this commit
    let currentLane: number;

    if (laneMap.has(commit.hash)) {
      currentLane = laneMap.get(commit.hash)!;
    } else {
      currentLane = nextLane++;
      laneMap.set(commit.hash, currentLane);
    }

    // Assign lanes to parents
    for (let i = 0; i < commit.parents.length; i++) {
      const parentHash = commit.parents[i];

      if (i === 0) {
        // First parent keeps current lane
        if (!laneMap.has(parentHash)) {
          laneMap.set(parentHash, currentLane);
          activeLanes.set(parentHash, currentLane);
        }
      } else {
        // Other parents get new lanes
        if (!laneMap.has(parentHash)) {
          const newLane = nextLane++;
          laneMap.set(parentHash, newLane);
          activeLanes.set(parentHash, newLane);
        }
      }
    }

    // Remove current commit from active lanes
    activeLanes.delete(commit.hash);
  }

  return laneMap;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

export const CommitLog = memo(function CommitLog({ path, maxCount = 100 }: CommitLogProps) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCommits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.gitGetLog(path, maxCount);
      setCommits(data);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, maxCount]);

  useEffect(() => {
    loadCommits();
  }, [loadCommits]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
        <span className="animate-spin mr-2">&#x21BB;</span>
        Loading commit log...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-red-500 dark:text-red-400">
        <p className="mb-2">{error}</p>
        <button
          onClick={loadCommits}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50 hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400 dark:text-gray-500 italic">
        No commits
      </div>
    );
  }

  const laneMap = assignLanes(commits);
  const maxLane = Math.max(...Array.from(laneMap.values()));

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
          Commit Log ({commits.length})
        </span>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {commits.map((commit) => {
          const lane = laneMap.get(commit.hash) ?? 0;

          return (
            <div
              key={commit.hash}
              className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
            >
              {/* Lane indicators */}
              <div className="flex shrink-0" style={{ width: `${(maxLane + 1) * 20}px` }}>
                {Array.from({ length: maxLane + 1 }, (_, i) => (
                  <div
                    key={i}
                    className={`w-5 h-full flex items-center justify-center ${
                      i === lane ? "" : "opacity-30"
                    }`}
                  >
                    {i === lane ? (
                      <div className={`w-2.5 h-2.5 rounded-full ${LANE_COLORS[i % LANE_COLORS.length]}`} />
                    ) : (
                      <div className={`w-0.5 h-full ${LANE_COLORS[i % LANE_COLORS.length]}`} />
                    )}
                  </div>
                ))}
              </div>

              {/* Commit info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Refs badges */}
                  {commit.refs.length > 0 && (
                    <div className="flex gap-1">
                      {commit.refs.map((ref) => (
                        <span
                          key={ref}
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                        >
                          {ref}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Short hash */}
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                    {commit.short_hash}
                  </span>

                  {/* Message */}
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                    {commit.message}
                  </span>
                </div>

                {/* Author and time */}
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">
                    {commit.author}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {formatRelativeTime(commit.timestamp)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Verify TypeScript type check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/components/CommitLog.tsx
git commit -m "feat: create CommitLog component with lane visualization"
```

---

## Task 5: Integrate CommitLog into GitOpsPanel

**Files:**
- Modify: `src/components/GitOpsPanel.tsx:1-10, 30-60, 476-534`

**Interfaces:**
- Consumes: `CommitLog` component from Task 4
- Produces: "Log" button in GitOpsPanel action buttons area

- [ ] **Step 1: Import CommitLog component**

Add import at the top of GitOpsPanel.tsx:

```typescript
import { CommitLog } from "./CommitLog";
```

- [ ] **Step 2: Add state management for Log visibility**

Add state variables in GitOpsPanel component (after line 51):

```typescript
const [showLog, setShowLog] = useState(false);
```

- [ ] **Step 3: Add Log button in action buttons area**

Add Log button after the Stash List button (around line 533):

```typescript
<button
  onClick={() => setShowLog(!showLog)}
  aria-label="Toggle commit log"
  aria-expanded={showLog}
  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 active:scale-[0.98] ${
    showLog
      ? "bg-indigo-200 dark:bg-indigo-800/50 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700/50"
      : "bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-200 dark:hover:bg-indigo-900/40"
  }`}
>
  Log
</button>
```

- [ ] **Step 4: Add CommitLog component below action buttons**

Add CommitLog component after the action buttons div (around line 534), before the stash list:

```typescript
{/* Commit log */}
{showLog && (
  <CommitLog path={path} maxCount={100} />
)}
```

- [ ] **Step 5: Verify TypeScript type check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: PASS (no errors)

- [ ] **Step 7: Commit**

```bash
git add src/components/GitOpsPanel.tsx
git commit -m "feat: integrate CommitLog into GitOpsPanel"
```

---

## Final Verification

- [ ] **Step 1: Run all type checks**

```bash
cargo check
npx tsc --noEmit
```

Expected: Both PASS

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: PASS

- [ ] **Step 3: Manual testing**

1. Open GitOpsPanel for a repository
2. Click "Log" button
3. Verify commits display with correct lane visualization
4. Verify refs badges show for branches/tags
5. Test with repositories having merges and branches
6. Test loading/error/empty states

- [ ] **Step 4: Final commit (if needed)**

```bash
git add -A
git commit -m "feat: complete Git Log Visualization implementation"
```

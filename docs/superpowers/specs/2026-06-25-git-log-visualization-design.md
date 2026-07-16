# Git Log Visualization Design Spec

## Overview
Add a visual commit log view that shows the commit history with branch topology (branch lines/lanes). Users can see how branches diverge and merge.

## Background

### Current State
- Existing `CommitInfo` type includes: hash, short_hash, message, author, email, timestamp, parents
- Existing `get_log` method in `git_service.rs` supports pagination and filtering
- Existing `gitGetLog` IPC call in `tauri.ts`
- GitOpsPanel already uses `loadRecentCommits` for recent 3 commits

### Goal
- Add visual commit log with branch topology
- Show how branches diverge and merge
- Integrate into GitOpsPanel as a toggleable view

## Design Decisions

### Approach: Extend Existing CommitInfo (Recommended)

**Rationale**:
- Reuse existing `get_log` method and IPC call
- Frontend lane assignment is more flexible and easier to debug
- Minimal changes, lower risk
- Follows "minimal surgical diff" principle

**Alternatives Considered**:
- New dedicated `LogEntry` type with backend lane assignment
  - Rejected: more changes, overlaps with existing functionality

## Data Types

### Frontend (types.ts)

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

### Backend (models/project.rs)

```rust
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub parents: Vec<String>,
    pub refs: Vec<String>,  // NEW: branch/tag names
}
```

## Backend Changes

### Modified File: `src-tauri/src/services/git_service.rs`

**Method**: `get_log`

**Changes**:
1. Add refs collection for each commit
2. Use `repo.references()` to find branches/tags pointing to commit

**Implementation**:
```rust
// For each commit in revwalk:
let refs: Vec<String> = repo.references()
    .map_err(|e| AppError::Git(...))?
    .filter_map(|r| r.ok())
    .filter(|r| r.target() == Some(commit_oid))
    .filter_map(|r| r.name().map(|n| n.to_string()).ok())
    .collect();

commits.push(CommitInfo {
    // ... existing fields
    refs,
});
```

## Frontend Lane Assignment Algorithm

### Algorithm
1. Start from HEAD, initial lane = 0
2. For each commit:
   - If normal commit (1 parent): keep current lane
   - If merge commit (2+ parents):
     - First parent keeps current lane
     - Other parents get new lanes
3. Use Map<commitHash, lane> to track assigned lanes

### Visualization
```
● commit A (lane 0)
│
● commit B (lane 0)
│╲
│ ● commit C (lane 1)
│ │
● │ commit D (lane 0)
│╱
● commit E (lane 0)
```

### Color Scheme
6 colors cycling: blue, green, red, purple, orange, cyan

## CommitLog Component

### File: `src/components/CommitLog.tsx` (New)

**Props**:
```typescript
interface CommitLogProps {
  path: string;
  maxCount?: number;  // Default 100
}
```

**UI Layout**:
```
┌─────────────────────────────────────────────────────┐
│ Commit Log                                    [100] │
├─────────────────────────────────────────────────────┤
│ ● abc1234  feat: add new feature                    │
│ │           John Doe • 2 hours ago                  │
│ │                                                   │
│ ● def5678  fix: resolve bug (#123)  [main] [HEAD]   │
│ │           Jane Smith • 3 hours ago                │
│ │                                                   │
│ ● ghi9012  chore: update deps                       │
│ ╲           Bob Wilson • 4 hours ago                │
│  ● jkl3456  feat: experimental feature              │
│  │           Alice Brown • 5 hours ago              │
│  │                                                  │
│ ● mno7890  docs: update readme                      │
│             Charlie Davis • 6 hours ago             │
└─────────────────────────────────────────────────────┘
```

**Each commit row displays**:
1. Lane indicator (colored vertical lines)
2. Commit node (dot/circle)
3. Refs badges (branch/tag labels)
4. Short hash (monospace)
5. Commit message
6. Author + relative time

**States**:
- Loading: spinner animation
- Error: error message with retry button
- Empty: "No commits" message

## Integration

### Modified File: `src/components/GitOpsPanel.tsx`

**UI Location**: Add "Log" button in action buttons area (next to Fetch/Pull/Push)

**Interaction**:
1. Click "Log" button to toggle CommitLog visibility
2. First display: call `gitGetLog(path, 100)` to fetch data
3. Subsequent toggles: reuse loaded data
4. CommitLog appears below action buttons, above file list

**State Management**:
```typescript
const [showLog, setShowLog] = useState(false);
const [logEntries, setLogEntries] = useState<CommitInfo[]>([]);
const [loadingLog, setLoadingLog] = useState(false);
```

## File Changes Summary

### Files to Modify

1. **`src/lib/types.ts`**
   - Add `refs: string[]` to `CommitInfo` interface

2. **`src-tauri/src/models/project.rs`**
   - Add `refs: Vec<String>` to `CommitInfo` struct

3. **`src-tauri/src/services/git_service.rs`**
   - Modify `get_log` method to collect refs information

4. **`src/components/CommitLog.tsx`** (New)
   - Implement CommitLog component
   - Implement lane assignment algorithm
   - Implement visualization rendering

5. **`src/components/GitOpsPanel.tsx`**
   - Add "Log" button
   - Integrate CommitLog component
   - Add state management

### Files NOT Modified

- `src/lib/tauri.ts`: Reuse existing `gitGetLog` call
- `src-tauri/src/commands/git.rs`: Reuse existing `git_get_log` command
- `src-tauri/src/lib.rs`: No new commands to register

## Technical Notes

### Lane Assignment Details

**Data Structures**:
- `laneMap: Map<string, number>` - maps commit hash to lane number
- `activeLanes: Map<string, number>` - maps parent hash to lane number

**Algorithm Steps**:
1. Initialize: `laneMap.set(headHash, 0)`, `activeLanes.set(headHash, 0)`
2. For each commit:
   a. Get current lane from `laneMap`
   b. For each parent:
      - If parent already in `activeLanes`, reuse that lane
      - Otherwise, assign new lane (increment counter)
   c. Update `activeLanes` for current commit's parents

### Performance Considerations

- Default limit: 100 commits (configurable)
- Lane assignment: O(n) where n = number of commits
- Refs collection: O(m) where m = number of references
- Total: O(n * m) worst case, acceptable for 100 commits

### Edge Cases

- Empty repository: show "No commits" message
- Detached HEAD: show commit hash instead of branch name
- Multiple refs on same commit: show all as badges
- Very long commit messages: truncate with ellipsis

## Verification Plan

1. **TypeScript type check**: `npx tsc --noEmit`
2. **Rust type check**: `cargo check`
3. **Build check**: `npm run build`
4. **Manual testing**:
   - Open GitOpsPanel for a repository
   - Click "Log" button
   - Verify commits display with correct lane visualization
   - Verify refs badges show for branches/tags
   - Test with repositories having merges and branches
   - Test loading/error/empty states

## Success Criteria

- [ ] `cargo check` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] CommitLog displays commit history with branch topology
- [ ] Lane visualization correctly shows branch divergence/merges
- [ ] Refs badges display for branches and tags
- [ ] Loading/error/empty states work correctly
- [ ] Integration with GitOpsPanel works smoothly

## Open Questions

None - all design decisions have been made.

## References

- Existing `CommitInfo` type: `src/lib/types.ts:73-81`
- Existing `get_log` method: `src-tauri/src/services/git_service.rs:1086-1178`
- Existing `gitGetLog` call: `src/lib/tauri.ts:74-89`
- GitOpsPanel: `src/components/GitOpsPanel.tsx`

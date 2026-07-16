# Diff Line Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline comment functionality to the diff viewer, allowing users to leave comments on specific lines of code.

**Architecture:** Database-backed comments with frontend inline UI. Comments are stored per project and file, displayed inline below diff lines. Supports both unified and split diff views.

**Tech Stack:** Rust (rusqlite), TypeScript/React, Tauri IPC

## Global Constraints

- All git operations use `spawn_blocking` (libgit2 is sync, Tauri commands are async)
- Error handling via `AppError` enum with typed variants
- UI components use `memo()` + `useCallback` for performance
- Follow existing patterns in codebase (see `commands/git.rs`, `db/schema.rs`)
- No test infrastructure yet — verification via type checking and build

## File Structure

### Backend (Rust)
- `src-tauri/src/models/project.rs` — Add `DiffComment` struct
- `src-tauri/src/db/schema.rs` — Add migration, row mapper, and 3 database methods
- `src-tauri/src/commands/git.rs` — Add 3 Tauri commands
- `src-tauri/src/lib.rs` — Register commands in `invoke_handler`

### Frontend (TypeScript/React)
- `src/lib/types.ts` — Add `DiffComment` interface
- `src/lib/tauri.ts` — Add 3 IPC wrapper functions
- `src/components/DiffViewer.tsx` — Add comment UI to unified and split views

---

### Task 1: Add DiffComment Model (Rust)

**Files:**
- Modify: `src-tauri/src/models/project.rs`

**Interfaces:**
- Produces: `DiffComment` struct for use in database and commands

- [ ] **Step 1: Add DiffComment struct to models**

Add at the end of `src-tauri/src/models/project.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffComment {
    pub id: String,
    pub project_id: String,
    pub file_path: String,
    pub line_number: usize,
    pub content: String,
    pub created_at: String,
}
```

- [ ] **Step 2: Verify Rust compilation**

Run: `cd src-tauri && cargo check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/models/project.rs
git commit -m "feat(models): add DiffComment struct"
```

---

### Task 2: Add Database Schema and Methods (Rust)

**Files:**
- Modify: `src-tauri/src/db/schema.rs`

**Interfaces:**
- Consumes: `DiffComment` from Task 1
- Produces: `insert_diff_comment`, `get_diff_comments`, `delete_diff_comment` methods

- [ ] **Step 1: Add table migration**

In `src-tauri/src/db/schema.rs`, find the `run_migrations` method. After the existing `CREATE TABLE IF NOT EXISTS reviews` block (around line 90), add:

```sql
CREATE TABLE IF NOT EXISTS diff_comments (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    content     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

- [ ] **Step 2: Add index migration**

After the table creation, in the same `execute_batch` call or in the index creation block (around line 180), add:

```sql
CREATE INDEX IF NOT EXISTS idx_diff_comments_project ON diff_comments(project_id, file_path);
```

- [ ] **Step 3: Add row mapper**

In the `Database` impl, after the existing `row_to_group` method (around line 219), add:

```rust
fn row_to_diff_comment(row: &rusqlite::Row) -> rusqlite::Result<DiffComment> {
    Ok(DiffComment {
        id: row.get(0)?,
        project_id: row.get(1)?,
        file_path: row.get(2)?,
        line_number: row.get::<_, i64>(3)? as usize,
        content: row.get(4)?,
        created_at: row.get(5)?,
    })
}
```

- [ ] **Step 4: Add insert_diff_comment method**

After the row mapper, add:

```rust
pub fn insert_diff_comment(&self, comment: &DiffComment) -> Result<(), AppError> {
    self.with_conn(|conn| {
        conn.execute(
            "INSERT INTO diff_comments (id, project_id, file_path, line_number, content, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![comment.id, comment.project_id, comment.file_path,
                   comment.line_number as i64, comment.content, comment.created_at],
        )
        .map_err(|e| AppError::Database(format!("Failed to insert comment: {}", e)))?;
        Ok(())
    })
}
```

- [ ] **Step 5: Add get_diff_comments method**

```rust
pub fn get_diff_comments(&self, project_id: &str, file_path: &str) -> Result<Vec<DiffComment>, AppError> {
    self.with_conn(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, file_path, line_number, content, created_at
                 FROM diff_comments
                 WHERE project_id = ?1 AND file_path = ?2
                 ORDER BY line_number, created_at",
            )
            .map_err(|e| AppError::Database(format!("Failed to prepare comments query: {}", e)))?;

        let comments = stmt
            .query_map(params![project_id, file_path], |row| Self::row_to_diff_comment(row))
            .map_err(|e| AppError::Database(format!("Failed to query comments: {}", e)))?
            .filter_map(|r| {
                r.map_err(|e| log::warn!("skipping corrupt comment row: {}", e))
                    .ok()
            })
            .collect();

        Ok(comments)
    })
}
```

- [ ] **Step 6: Add delete_diff_comment method**

```rust
pub fn delete_diff_comment(&self, id: &str) -> Result<(), AppError> {
    self.with_conn(|conn| {
        let affected = conn
            .execute("DELETE FROM diff_comments WHERE id = ?1", params![id])
            .map_err(|e| AppError::Database(format!("Failed to delete comment: {}", e)))?;
        if affected == 0 {
            return Err(AppError::NotFound(format!("Comment not found: {}", id)));
        }
        Ok(())
    })
}
```

- [ ] **Step 7: Verify Rust compilation**

Run: `cd src-tauri && cargo check`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/db/schema.rs
git commit -m "feat(db): add diff_comments table and CRUD methods"
```

---

### Task 3: Add Tauri Commands (Rust)

**Files:**
- Modify: `src-tauri/src/commands/git.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `DiffComment` from Task 1, database methods from Task 2
- Produces: `add_diff_comment`, `get_diff_comments`, `delete_diff_comment` commands for frontend

- [ ] **Step 1: Add DiffComment to imports**

In `src-tauri/src/commands/git.rs`, find the import line (around line 7):

```rust
use crate::models::{BatchResult, BlameLine, BranchCompareResult, ...};
```

Add `DiffComment` to the import list.

- [ ] **Step 2: Add add_diff_comment command**

At the end of the file, add:

```rust
#[tauri::command]
pub async fn add_diff_comment(
    db: State<'_, Database>,
    project_id: String,
    file_path: String,
    line_number: usize,
    content: String,
) -> Result<DiffComment, AppError> {
    let comment = DiffComment {
        id: uuid::Uuid::new_v4().to_string(),
        project_id,
        file_path,
        line_number,
        content,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    db.insert_diff_comment(&comment)?;
    Ok(comment)
}
```

- [ ] **Step 3: Add get_diff_comments command**

```rust
#[tauri::command]
pub async fn get_diff_comments(
    db: State<'_, Database>,
    project_id: String,
    file_path: String,
) -> Result<Vec<DiffComment>, AppError> {
    db.get_diff_comments(&project_id, &file_path)
}
```

- [ ] **Step 4: Add delete_diff_comment command**

```rust
#[tauri::command]
pub async fn delete_diff_comment(
    db: State<'_, Database>,
    id: String,
) -> Result<(), AppError> {
    db.delete_diff_comment(&id)
}
```

- [ ] **Step 5: Register commands in lib.rs**

In `src-tauri/src/lib.rs`, find the `invoke_handler` block (around line 234). After the last command registration (e.g., `commands::git_bisect_status,`), add:

```rust
commands::add_diff_comment,
commands::get_diff_comments,
commands::delete_diff_comment,
```

- [ ] **Step 6: Verify Rust compilation**

Run: `cd src-tauri && cargo check`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/git.rs src-tauri/src/lib.rs
git commit -m "feat(commands): add diff comment commands"
```

---

### Task 4: Add Frontend Types and IPC (TypeScript)

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/tauri.ts`

**Interfaces:**
- Produces: `DiffComment` type and IPC functions for DiffViewer component

- [ ] **Step 1: Add DiffComment interface to types.ts**

In `src/lib/types.ts`, after the `Group` interface (around line 100), add:

```typescript
export interface DiffComment {
  id: string;
  project_id: string;
  file_path: string;
  line_number: number;
  content: string;
  created_at: string;
}
```

- [ ] **Step 2: Add DiffComment to tauri.ts imports**

In `src/lib/tauri.ts`, find the import block (around line 4). Add `DiffComment` to the imports:

```typescript
import type {
  ...
  DiffComment,
  ...
} from "./types";
```

- [ ] **Step 3: Add addDiffComment function**

At the end of the file, add:

```typescript
export async function addDiffComment(
  projectId: string,
  filePath: string,
  lineNumber: number,
  content: string,
): Promise<DiffComment> {
  return invoke("add_diff_comment", { projectId, filePath, lineNumber, content });
}
```

- [ ] **Step 4: Add getDiffComments function**

```typescript
export async function getDiffComments(
  projectId: string,
  filePath: string,
): Promise<DiffComment[]> {
  return invoke("get_diff_comments", { projectId, filePath });
}
```

- [ ] **Step 5: Add deleteDiffComment function**

```typescript
export async function deleteDiffComment(id: string): Promise<void> {
  return invoke("delete_diff_comment", { id });
}
```

- [ ] **Step 6: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/tauri.ts
git commit -m "feat(types): add DiffComment type and IPC functions"
```

---

### Task 5: Add Comment UI to DiffViewer (Unified View)

**Files:**
- Modify: `src/components/DiffViewer.tsx`

**Interfaces:**
- Consumes: `DiffComment` type and IPC functions from Task 4
- Produces: Inline comment UI in unified diff view

- [ ] **Step 1: Add DiffComment import**

In `src/components/DiffViewer.tsx`, find the imports at the top. Add `DiffComment` to the types import from `../lib/types`:

```typescript
import { parseError, type GitFileEntry, type FileDiffStats, type DiffComment } from "../lib/types";
```

- [ ] **Step 2: Extend DiffViewerProps interface**

Find the `DiffViewerProps` interface (around line 115). Add `projectId` as optional prop:

```typescript
interface DiffViewerProps {
  projectId?: string;  // Optional - if not provided, comments are disabled
  path: string;
  filePath: string;
  onClose: () => void;
  staged?: boolean;
  files?: GitFileEntry[];
}
```

- [ ] **Step 3: Update function signature**

Find the component function (around line 163). Update to destructure `projectId`:

```typescript
export const DiffViewer = memo(function DiffViewer({ projectId, path, filePath, onClose, staged, files }: DiffViewerProps) {
```

- [ ] **Step 4: Add comment state variables**

After the existing state declarations (around line 175), add:

```typescript
const [comments, setComments] = useState<DiffComment[]>([]);
const [commentingLine, setCommentingLine] = useState<number | null>(null);
const [commentText, setCommentText] = useState("");
const [hoveredLine, setHoveredLine] = useState<number | null>(null);
```

- [ ] **Step 5: Add load comments effect**

After the file tree state setup (around line 260), add:

```typescript
useEffect(() => {
  if (projectId && activeFilePath) {
    api.getDiffComments(projectId, activeFilePath)
      .then(setComments)
      .catch(console.error);
  } else {
    setComments([]);
  }
}, [projectId, activeFilePath]);
```

- [ ] **Step 6: Add submit comment handler**

After the existing handlers (around line 320), add:

```typescript
const submitComment = useCallback(async () => {
  if (!projectId || !commentingLine || !commentText.trim()) return;

  try {
    const newComment = await api.addDiffComment(
      projectId,
      activeFilePath,
      commentingLine,
      commentText.trim()
    );
    setComments(prev => [...prev, newComment]);
    setCommentText("");
    setCommentingLine(null);
  } catch (e) {
    console.error("Failed to add comment:", e);
  }
}, [projectId, activeFilePath, commentingLine, commentText]);
```

- [ ] **Step 7: Add delete comment handler**

```typescript
const handleDeleteComment = useCallback(async (commentId: string) => {
  try {
    await api.deleteDiffComment(commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  } catch (e) {
    console.error("Failed to delete comment:", e);
  }
}, []);
```

- [ ] **Step 8: Modify renderLine for unified view**

Find the `renderLine` function (around line 649). Replace the entire function with:

```typescript
const renderLine = (line: DiffLine, i: number) => {
  const lineNum = line.newLine;
  const lineComments = comments.filter(c => c.line_number === lineNum);
  const showCommentIcon = projectId && lineNum !== null && line.type !== 'header';

  return (
    <>
      <tr
        key={i}
        className={`${lineColors[line.type]} group`}
        onMouseEnter={() => showCommentIcon && setHoveredLine(lineNum)}
        onMouseLeave={() => setHoveredLine(null)}
      >
        <td className="w-10 text-right pr-1 pl-1 select-none text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
          {line.oldLine ?? ""}
        </td>
        <td className="w-10 text-right pr-1 pl-1 select-none text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
          {line.newLine ?? ""}
        </td>
        <td className="whitespace-pre px-2" dangerouslySetInnerHTML={hl(line.content, curLineOcc.unified.get(i))} />
        {projectId && (
          <td className="w-8 text-center">
            {hoveredLine === lineNum && (
              <button
                onClick={() => setCommentingLine(lineNum)}
                className="p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Add comment"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.458 1.458 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25v-7.5zM2.75 2.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 01.75.75v2.19l2.72-2.72a.75.75 0 01.53-.22h4.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25H2.75z" />
                </svg>
              </button>
            )}
          </td>
        )}
      </tr>

      {/* Comment input (inline below line) */}
      {commentingLine === lineNum && (
        <tr key={`${i}-comment-input`}>
          <td colSpan={projectId ? 4 : 3} className="p-2 bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a comment..."
              className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              autoFocus
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment();
                if (e.key === 'Escape') setCommentingLine(null);
              }}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={submitComment}
                disabled={!commentText.trim()}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Comment
              </button>
              <button
                onClick={() => { setCommentingLine(null); setCommentText(""); }}
                className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 self-center">
                ⌘+Enter to submit
              </span>
            </div>
          </td>
        </tr>
      )}

      {/* Existing comments */}
      {lineComments.map(comment => (
        <tr key={`comment-${comment.id}`}>
          <td colSpan={projectId ? 4 : 3} className="p-2 bg-gray-50 dark:bg-gray-800/50 border-l-2 border-blue-400">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {comment.content}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(comment.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleDeleteComment(comment.id)}
                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors"
                title="Delete comment"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                </svg>
              </button>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
};
```

- [ ] **Step 9: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 10: Commit**

```bash
git add src/components/DiffViewer.tsx
git commit -m "feat(diff): add comment UI to unified view"
```

---

### Task 6: Add Comment UI to Split View

**Files:**
- Modify: `src/components/DiffViewer.tsx`

**Interfaces:**
- Consumes: Comment handlers from Task 5
- Produces: Inline comment UI in split diff view (right panel only)

- [ ] **Step 1: Modify right panel virtualized view**

Find the split view's right panel virtualized rendering (around line 970). In the right panel's `getVirtualItems().map()`, update the rendering to include comment column:

Find this line in the right panel's virtualized view:
```tsx
<div className="text-right pr-1 pl-1 select-none text-gray-400 dark:text-gray-500">{row.new.line ?? ""}</div>
<div className="whitespace-pre px-2" dangerouslySetInnerHTML={...} />
```

Replace with:
```tsx
<div className="text-right pr-1 pl-1 select-none text-gray-400 dark:text-gray-500">{row.new.line ?? ""}</div>
<div className="whitespace-pre px-2" dangerouslySetInnerHTML={...} />
{projectId && row.new.line !== null && row.type !== 'header' && (
  <div className="w-8 text-center">
    {hoveredLine === row.new.line && (
      <button
        onClick={() => setCommentingLine(row.new.line)}
        className="p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900 text-gray-400"
        title="Add comment"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.458 1.458 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25v-7.5zM2.75 2.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 01.75.75v2.19l2.72-2.72a.75.75 0 01.53-.22h4.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25H2.75z" />
        </svg>
      </button>
    )}
  </div>
)}
```

Also add `onMouseEnter`/`onMouseLeave` handlers to the row div.

- [ ] **Step 2: Modify right panel non-virtualized view**

Similarly, update the non-virtualized split view's right panel (around line 1005). Apply the same pattern: add comment icon column and mouse handlers.

- [ ] **Step 3: Add comment display rows for split view**

After the right panel's main row rendering, add comment input and display rows similar to unified view, but using `colSpan={2}` for the right panel only.

- [ ] **Step 4: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Verify full build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/components/DiffViewer.tsx
git commit -m "feat(diff): add comment UI to split view"
```

---

### Task 7: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run Rust type check**

Run: `cd src-tauri && cargo check`
Expected: No errors

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run full frontend build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Final commit (if any fixes needed)**

If any fixes were needed during verification, commit them:

```bash
git add -A
git commit -m "fix: resolve build issues in diff comments feature"
```

---

## Notes

### Virtualized View Considerations
- When `VIRTUALIZE_THRESHOLD` is exceeded (200+ lines), diff uses virtualization
- `renderLine` returns Fragment with multiple `<tr>` elements — may cause layout issues in virtual list
- Acceptable for v1 — can optimize later if needed

### Split View Implementation
- Comments only on right panel (New file)
- Left panel (Old) does not have comment functionality
- Comment rows use `colSpan={2}` in split view vs `colSpan={4}` in unified view

### Error Handling
- Database errors propagated via `AppError` enum
- Frontend catches and logs errors (graceful degradation)
- No toast notifications for comment operations (lightweight UX)

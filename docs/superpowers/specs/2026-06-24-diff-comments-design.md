---
title: Diff Line Comments Feature Design
date: 2026-06-24
status: approved
---

# Diff Line Comments Feature Design

## Overview

Add the ability to leave comments on specific lines in the diff view. Comments are stored locally in the database and associated with a project and file.

## Design Decisions

Based on user requirements:

1. **Comment Association**: File + Line Number (simplest approach)
2. **Split View Handling**: Comments only on right side (new file) - not on deleted code
3. **Edit Support**: Add + Delete only (no inline editing)
4. **UI Style**: Inline below the line (GitHub-style)

## Architecture

### Backend (Rust)

#### 1. Database Schema

Add to `src-tauri/src/db/schema.rs` `run_migrations`:

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

CREATE INDEX IF NOT EXISTS idx_diff_comments_project ON diff_comments(project_id, file_path);
```

#### 2. Data Model

Add to `src-tauri/src/models/project.rs`:

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

#### 3. Database Methods

Add to `Database` impl in `src-tauri/src/db/schema.rs`:

```rust
// Row mapper
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

// Insert comment
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

// Get comments for a file
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

// Delete a comment
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

#### 4. Tauri Commands

Add to `src-tauri/src/commands/git.rs`:

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

#[tauri::command]
pub async fn get_diff_comments(
    db: State<'_, Database>,
    project_id: String,
    file_path: String,
) -> Result<Vec<DiffComment>, AppError> {
    db.get_diff_comments(&project_id, &file_path)
}

#[tauri::command]
pub async fn delete_diff_comment(
    db: State<'_, Database>,
    id: String,
) -> Result<(), AppError> {
    db.delete_diff_comment(&id)
}
```

#### 5. Command Registration

Add to `src-tauri/src/lib.rs` `invoke_handler`:

```rust
commands::add_diff_comment,
commands::get_diff_comments,
commands::delete_diff_comment,
```

### Frontend (TypeScript/React)

#### 1. Types

Add to `src/lib/types.ts`:

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

#### 2. IPC Wrappers

Add to `src/lib/tauri.ts`:

```typescript
export async function addDiffComment(
  projectId: string,
  filePath: string,
  lineNumber: number,
  content: string,
): Promise<DiffComment> {
  return invoke("add_diff_comment", { projectId, filePath, lineNumber, content });
}

export async function getDiffComments(
  projectId: string,
  filePath: string,
): Promise<DiffComment[]> {
  return invoke("get_diff_comments", { projectId, filePath });
}

export async function deleteDiffComment(id: string): Promise<void> {
  return invoke("delete_diff_comment", { id });
}
```

#### 3. DiffViewer Component Changes

**Props extension** (`src/components/DiffViewer.tsx`):

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

**New state variables**:

```typescript
const [comments, setComments] = useState<DiffComment[]>([]);
const [commentingLine, setCommentingLine] = useState<number | null>(null);
const [commentText, setCommentText] = useState("");
const [hoveredLine, setHoveredLine] = useState<number | null>(null);
```

**Load comments effect**:

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

**Submit comment handler**:

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

**Delete comment handler**:

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

**Unified view modification** (renderLine function):

```tsx
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

**Split view modification** (right side only):

Similar to unified view, but only add comment column to the right (New) panel. Left (Old) panel remains unchanged.

## UI Behavior

1. **Hover**: When hovering over a line in the diff, a comment icon appears in the gutter (for lines with `newLine` number)
2. **Click Icon**: Opens an inline textarea below that line
3. **Submit**: Click "Comment" button or press ⌘+Enter to submit
4. **Cancel**: Click "Cancel" or press Escape to close without saving
5. **Display**: Comments appear as inline blocks below their target line with a blue left border
6. **Delete**: Each comment has a delete button (X icon) on the right
7. **Persistence**: Comments are saved to database and reload when viewing the same file again

## Error Handling

- Database errors propagated via `AppError` enum
- Frontend catches and logs errors (graceful degradation - comments may fail to load/save but diff still works)
- No toast notifications for comment operations (keep it lightweight)

## Testing Verification

1. `cargo check` — Rust compilation
2. `npx tsc --noEmit` — TypeScript type checking
3. `npm run build` — Full frontend build

## Implementation Notes

### Virtualized View Considerations

When `VIRTUALIZE_THRESHOLD` is exceeded (200+ lines), the diff uses virtualization. Since `renderLine` returns a Fragment containing multiple `<tr>` elements (main row + comment input + existing comments), virtualized view may have layout issues.

**Workaround**:
- Comments feature still works in virtualized view
- When a comment is added, the virtual list will re-render and may need adjustment
- For very large diffs with comments, users may need to scroll to see inline comments
- This is acceptable for v1 - if it becomes problematic, we can implement a custom virtual row that handles multiple `<tr>` elements

### Split View Implementation

Split view only shows comments on the **right panel (New)**. Left panel (Old) does not get comment functionality.

Key changes for split view:
1. Add comment icon column only to right panel rows
2. Comment input/Display rows use `colSpan={2}` (one for line number, one for content) instead of spanning full width
3. Both left and right panels scroll in sync, but only right panel has comment UI

## Future Enhancements (Out of Scope)

- Edit existing comments
- Reply to comments / threads
- Export comments with diff
- Comment on deleted lines (left side in split view)
- Keyboard shortcut to add comment (e.g., 'c' key)

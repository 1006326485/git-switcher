use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, Connection};
use std::path::PathBuf;

use crate::models::{
    CustomCommand, GitProject, Group, OperationLogEntry, ReviewResult, TaskExecutionState,
    TaskStrategy, TaskWorkspace, TaskWorkspaceEntry, TaskWorkspaceEntryDetail,
    TaskWorkspaceOutcome, TaskWorkspaceStatus,
};
use crate::AppError;

#[derive(Clone)]
pub struct Database {
    pool: Pool<SqliteConnectionManager>,
}

impl Database {
    fn with_conn<F, T>(&self, f: F) -> Result<T, AppError>
    where
        F: FnOnce(&Connection) -> Result<T, AppError>,
    {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Other(format!("Failed to get connection: {}", e)))?;
        f(&conn)
    }

    pub fn new(app_data_dir: &PathBuf) -> Result<Self, AppError> {
        std::fs::create_dir_all(app_data_dir)?;

        let db_path = app_data_dir.join("git-switcher.db");
        let manager = SqliteConnectionManager::file(&db_path);
        let pool = Pool::builder()
            .max_size(5)
            .build(manager)
            .map_err(|e| AppError::Database(format!("Failed to create pool: {}", e)))?;

        // Configure pragmas on a connection
        {
            let conn = pool
                .get()
                .map_err(|e| AppError::Database(format!("Failed to get connection: {}", e)))?;
            conn.execute_batch(
                "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
            )
            .map_err(|e| AppError::Database(format!("Failed to set PRAGMA: {}", e)))?;

            Self::run_migrations(&conn)?;
        }

        Ok(Self { pool })
    }

    fn run_migrations(conn: &Connection) -> Result<(), AppError> {
        // Step 1: Create tables with original columns (safe for both fresh and existing DBs)
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS groups (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL UNIQUE,
                color       TEXT,
                sort_order  INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS projects (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                path            TEXT NOT NULL UNIQUE,
                group_id        TEXT NOT NULL REFERENCES groups(id),
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS project_groups (
                project_id  TEXT NOT NULL,
                group_id    TEXT NOT NULL,
                PRIMARY KEY (project_id, group_id),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS reviews (
                id              TEXT PRIMARY KEY,
                project_path    TEXT NOT NULL,
                base_branch     TEXT NOT NULL,
                head_branch     TEXT NOT NULL,
                summary         TEXT NOT NULL,
                findings_json   TEXT NOT NULL DEFAULT '[]',
                stats_json      TEXT NOT NULL DEFAULT '{}',
                model           TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .map_err(|e| AppError::Database(format!("Failed to create tables: {}", e)))?;

        // Task Workspaces are local, durable task contexts. Their entries only reference
        // registered projects; deleting a project cascades to the task entry.
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS task_workspaces (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                description     TEXT,
                status          TEXT NOT NULL DEFAULT 'active',
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL,
                last_opened_at  TEXT
            );

            CREATE TABLE IF NOT EXISTS task_workspace_entries (
                id              TEXT PRIMARY KEY,
                workspace_id    TEXT NOT NULL REFERENCES task_workspaces(id) ON DELETE CASCADE,
                project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                sort_order      INTEGER NOT NULL DEFAULT 0,
                strategy        TEXT NOT NULL DEFAULT 'retain_current',
                target_branch   TEXT,
                base_branch     TEXT,
                worktree_path   TEXT,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL,
                UNIQUE(workspace_id, project_id)
            );

            CREATE INDEX IF NOT EXISTS idx_task_workspace_entries_workspace
                ON task_workspace_entries(workspace_id, sort_order);

            CREATE TABLE IF NOT EXISTS task_workspace_outcomes (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL REFERENCES task_workspaces(id) ON DELETE CASCADE,
                entry_id TEXT NOT NULL REFERENCES task_workspace_entries(id) ON DELETE CASCADE,
                state TEXT NOT NULL,
                message TEXT NOT NULL,
                start_branch TEXT,
                start_head TEXT,
                result_branch TEXT,
                worktree_path TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_task_workspace_outcomes_workspace
                ON task_workspace_outcomes(workspace_id, created_at DESC);",
        )
        .map_err(|e| AppError::Database(format!("Failed to migrate task workspaces: {}", e)))?;

        // Step 2: Add new columns to projects (ALTER TABLE silently fails if column exists)
        let migrate_columns = [
            ("alias", "TEXT"),
            ("sort_order", "INTEGER NOT NULL DEFAULT 0"),
            ("last_active_at", "TEXT"),
            ("last_commit_hash", "TEXT"),
            ("color", "TEXT"),
            ("description", "TEXT"),
            ("notes", "TEXT"),
        ];
        for (col, col_type) in &migrate_columns {
            let result = conn.execute(
                &format!("ALTER TABLE projects ADD COLUMN {} {}", col, col_type),
                [],
            );
            if let Err(e) = result {
                let msg = e.to_string();
                if !msg.contains("duplicate column") {
                    log::warn!("migration warning: {}", msg);
                }
            }
        }

        // Step 2b: Add group_id column to projects (for single-select group model)
        let result = conn.execute("ALTER TABLE projects ADD COLUMN group_id TEXT", []);
        if let Err(e) = result {
            let msg = e.to_string();
            if !msg.contains("duplicate column") {
                log::warn!("migration warning: {}", msg);
            }
        }

        // Step 2c: Migrate project_groups data to projects.group_id
        // Assign projects that have groups (take first by sort_order)
        conn.execute(
            "UPDATE projects SET group_id = (
                SELECT pg.group_id FROM project_groups pg
                JOIN groups g ON g.id = pg.group_id
                WHERE pg.project_id = projects.id
                ORDER BY g.sort_order, g.name LIMIT 1
            ) WHERE group_id IS NULL",
            [],
        )
        .map_err(|e| AppError::Database(format!("Failed to migrate project groups: {}", e)))?;

        // Ensure a "Default" group exists for ungrouped projects
        let has_groups: bool = conn
            .query_row("SELECT EXISTS(SELECT 1 FROM groups LIMIT 1)", [], |row| {
                row.get(0)
            })
            .unwrap_or(false);
        if !has_groups {
            conn.execute(
                "INSERT INTO groups (id, name, color, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    uuid::Uuid::new_v4().to_string(),
                    "Default",
                    "#6B7280",
                    0,
                    chrono::Utc::now().to_rfc3339()
                ],
            )
            .map_err(|e| AppError::Database(format!("Failed to create default group: {}", e)))?;
        }

        // Assign remaining ungrouped projects to the first group
        conn.execute(
            "UPDATE projects SET group_id = (SELECT id FROM groups ORDER BY sort_order, name LIMIT 1) WHERE group_id IS NULL",
            [],
        )
        .map_err(|e| AppError::Database(format!("Failed to assign default group: {}", e)))?;

        // Fix orphaned projects: group_id references a non-existent group
        conn.execute(
            "UPDATE projects SET group_id = (SELECT id FROM groups ORDER BY sort_order, name LIMIT 1)
             WHERE group_id NOT IN (SELECT id FROM groups)",
            [],
        )
        .map_err(|e| AppError::Database(format!("Failed to fix orphaned projects: {}", e)))?;

        // Drop the junction table
        conn.execute("DROP TABLE IF EXISTS project_groups", [])
            .map_err(|e| AppError::Database(format!("Failed to drop project_groups: {}", e)))?;

        // Step 3: Create indexes (safe now because columns exist)
        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_projects_sort ON projects(sort_order);
             CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);
             CREATE INDEX IF NOT EXISTS idx_groups_sort ON groups(sort_order);
             CREATE INDEX IF NOT EXISTS idx_projects_group ON projects(group_id);
             CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project_path);",
        )
        .map_err(|e| AppError::Database(format!("Failed to create indexes: {}", e)))?;

        // Step 4b: Custom commands (user-defined Git operations)
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS custom_commands (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                command         TEXT NOT NULL,
                shortcut        TEXT,
                sort_order      INTEGER NOT NULL DEFAULT 0,
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .map_err(|e| {
            AppError::Database(format!("Failed to create custom_commands table: {}", e))
        })?;

        // Step 4: Operation log (audit trail for all Git operations)
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS operation_log (
                id              TEXT PRIMARY KEY,
                operation_type  TEXT NOT NULL,
                project_path    TEXT NOT NULL,
                project_name    TEXT,
                details         TEXT,
                status          TEXT NOT NULL DEFAULT 'success',
                error_message   TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_operation_log_created
                ON operation_log(created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_operation_log_project
                ON operation_log(project_path);",
        )
        .map_err(|e| AppError::Database(format!("Failed to create operation_log table: {}", e)))?;

        Ok(())
    }

    // ── Row mappers ─────────────────────────────────────────────────────

    fn row_to_project(row: &rusqlite::Row) -> rusqlite::Result<GitProject> {
        Ok(GitProject {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            alias: row.get(3)?,
            sort_order: row.get(4)?,
            group_id: row.get(5)?,
            last_active_at: row.get(6)?,
            last_commit_hash: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
            color: row.get(10)?,
            description: row.get(11)?,
            notes: row.get(12)?,
        })
    }

    fn row_to_group(row: &rusqlite::Row) -> rusqlite::Result<Group> {
        Ok(Group {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            sort_order: row.get(3)?,
            created_at: row.get(4)?,
        })
    }

    // ── Projects ────────────────────────────────────────────────────────

    pub fn insert_project(&self, project: &GitProject) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO projects (id, name, path, alias, sort_order, group_id, color, description, notes, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    project.id,
                    project.name,
                    project.path,
                    project.alias,
                    project.sort_order,
                    project.group_id,
                    project.color,
                    project.description,
                    project.notes,
                    project.created_at,
                    project.updated_at,
                ],
            )
            .map_err(|e| AppError::Database(format!("Failed to insert project: {}", e)))?;
            Ok(())
        })
    }

    pub fn get_all_projects(&self) -> Result<Vec<GitProject>, AppError> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare("SELECT id, name, path, alias, sort_order, group_id, last_active_at, last_commit_hash, created_at, updated_at, color, description, notes FROM projects ORDER BY sort_order, name")
                .map_err(|e| AppError::Database(format!("Failed to prepare statement: {}", e)))?;

            let projects = stmt
                .query_map([], Self::row_to_project)
                .map_err(|e| AppError::Database(format!("Failed to query projects: {}", e)))?
                .filter_map(|r| {
                    r.map_err(|e| log::warn!("skipping corrupt project row: {}", e))
                        .ok()
                })
                .collect();

            Ok(projects)
        })
    }

    pub fn get_project_by_id(&self, id: &str) -> Result<GitProject, AppError> {
        self.with_conn(|conn| {
            conn.query_row(
                "SELECT id, name, path, alias, sort_order, group_id, last_active_at, last_commit_hash, created_at, updated_at, color, description, notes FROM projects WHERE id = ?1",
                params![id],
                Self::row_to_project,
            )
            .map_err(|e| AppError::NotFound(format!("Project not found: {}", e)))
        })
    }

    pub fn get_project_by_path(&self, path: &str) -> Result<GitProject, AppError> {
        self.with_conn(|conn| {
            conn.query_row(
                "SELECT id, name, path, alias, sort_order, group_id, last_active_at, last_commit_hash, created_at, updated_at, color, description, notes FROM projects WHERE path = ?1",
                params![path],
                Self::row_to_project,
            )
            .map_err(|e| AppError::NotFound(format!("Project not found at path '{}': {}", path, e)))
        })
    }

    pub fn delete_project(&self, id: &str) -> Result<(), AppError> {
        self.with_conn(|conn| {
            let affected = conn
                .execute("DELETE FROM projects WHERE id = ?1", params![id])
                .map_err(|e| AppError::Database(format!("Failed to delete project: {}", e)))?;
            if affected == 0 {
                return Err(AppError::NotFound(format!("Project not found: {}", id)));
            }
            Ok(())
        })
    }

    pub fn project_exists(&self, path: &str) -> Result<bool, AppError> {
        self.with_conn(|conn| {
            let exists: bool = conn
                .query_row(
                    "SELECT 1 FROM projects WHERE path = ?1 LIMIT 1",
                    params![path],
                    |_| Ok(true),
                )
                .unwrap_or(false);
            Ok(exists)
        })
    }

    pub fn update_project_alias(&self, id: &str, alias: &str) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE projects SET alias = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![alias, id],
            )
            .map_err(|e| AppError::Database(format!("Failed to update alias: {}", e)))?;
            Ok(())
        })
    }

    pub fn update_project_color(&self, id: &str, color: Option<&str>) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE projects SET color = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![color, id],
            )
            .map_err(|e| AppError::Database(format!("Failed to update color: {}", e)))?;
            Ok(())
        })
    }

    pub fn update_project_description(
        &self,
        id: &str,
        description: Option<&str>,
    ) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE projects SET description = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![description, id],
            )
            .map_err(|e| AppError::Database(format!("Failed to update description: {}", e)))?;
            Ok(())
        })
    }

    pub fn update_project_notes(&self, id: &str, notes: Option<&str>) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE projects SET notes = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![notes, id],
            )
            .map_err(|e| AppError::Database(format!("Failed to update notes: {}", e)))?;
            Ok(())
        })
    }

    pub fn update_project_activity(&self, id: &str, commit_hash: &str) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE projects SET last_active_at = datetime('now'), last_commit_hash = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![commit_hash, id],
            )
            .map_err(|e| AppError::Database(format!("Failed to update activity: {}", e)))?;
            Ok(())
        })
    }

    pub fn reorder_projects(&self, ordered_ids: &[String]) -> Result<(), AppError> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Other(format!("Failed to get connection: {}", e)))?;
        conn.execute("BEGIN", [])
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        let result = (|| -> Result<(), AppError> {
            for (i, id) in ordered_ids.iter().enumerate() {
                conn.execute(
                    "UPDATE projects SET sort_order = ?1 WHERE id = ?2",
                    params![i as i64, id],
                )
                .map_err(|e| AppError::Database(format!("Failed to reorder: {}", e)))?;
            }
            Ok(())
        })();
        if result.is_ok() {
            conn.execute("COMMIT", [])
                .map_err(|e| AppError::Database(format!("Failed to commit: {}", e)))?;
        } else {
            if let Err(e) = conn.execute("ROLLBACK", []) {
                log::error!("rollback failed: {}", e);
            }
        }
        result
    }

    // ── Groups ──────────────────────────────────────────────────────────

    pub fn insert_group(&self, group: &Group) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO groups (id, name, color, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![group.id, group.name, group.color, group.sort_order, group.created_at],
            )
            .map_err(|e| AppError::Database(format!("Failed to insert group: {}", e)))?;
            Ok(())
        })
    }

    pub fn get_all_groups(&self) -> Result<Vec<Group>, AppError> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare("SELECT id, name, color, sort_order, created_at FROM groups ORDER BY sort_order, name")
                .map_err(|e| AppError::Database(format!("Failed to prepare groups: {}", e)))?;

            let groups = stmt
                .query_map([], Self::row_to_group)
                .map_err(|e| AppError::Database(format!("Failed to query groups: {}", e)))?
                .filter_map(|r| {
                    r.map_err(|e| log::warn!("skipping corrupt group row: {}", e))
                        .ok()
                })
                .collect();

            Ok(groups)
        })
    }

    pub fn get_group_by_id(&self, id: &str) -> Result<Group, AppError> {
        self.with_conn(|conn| {
            conn.query_row(
                "SELECT id, name, color, sort_order, created_at FROM groups WHERE id = ?1",
                params![id],
                Self::row_to_group,
            )
            .map_err(|e| AppError::NotFound(format!("Group not found: {}", e)))
        })
    }

    pub fn delete_group(&self, id: &str) -> Result<(), AppError> {
        self.with_conn(|conn| {
            // Prevent deleting the last group
            let group_count: i64 = conn
                .query_row("SELECT COUNT(*) FROM groups", [], |row| row.get(0))
                .map_err(|e| AppError::Database(format!("Failed to count groups: {}", e)))?;
            if group_count <= 1 {
                return Err(AppError::Other("Cannot delete the last group".to_string()));
            }

            // Reassign projects to the first available group (excluding the one being deleted)
            conn.execute(
                "UPDATE projects SET group_id = (
                    SELECT id FROM groups WHERE id != ?1 ORDER BY sort_order, name LIMIT 1
                ), updated_at = datetime('now') WHERE group_id = ?1",
                params![id],
            )
            .map_err(|e| AppError::Database(format!("Failed to reassign projects: {}", e)))?;

            let affected = conn
                .execute("DELETE FROM groups WHERE id = ?1", params![id])
                .map_err(|e| AppError::Database(format!("Failed to delete group: {}", e)))?;
            if affected == 0 {
                return Err(AppError::NotFound(format!("Group not found: {}", id)));
            }
            Ok(())
        })
    }

    pub fn update_group(&self, group: &Group) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE groups SET name = ?1, color = ?2, sort_order = ?3 WHERE id = ?4",
                params![group.name, group.color, group.sort_order, group.id],
            )
            .map_err(|e| AppError::Database(format!("Failed to update group: {}", e)))?;
            Ok(())
        })
    }

    // ── Project-Group relations ─────────────────────────────────────────

    pub fn assign_project_to_group(
        &self,
        project_id: &str,
        group_id: &str,
    ) -> Result<(), AppError> {
        self.with_conn(|conn| {
            let affected = conn
                .execute(
                    "UPDATE projects SET group_id = ?1, updated_at = datetime('now') WHERE id = ?2",
                    params![group_id, project_id],
                )
                .map_err(|e| {
                    AppError::Database(format!("Failed to assign project to group: {}", e))
                })?;
            if affected == 0 {
                return Err(AppError::NotFound(format!(
                    "Project not found: {}",
                    project_id
                )));
            }
            Ok(())
        })
    }

    pub fn get_project_group(&self, project_id: &str) -> Result<Group, AppError> {
        self.with_conn(|conn| {
            conn.query_row(
                "SELECT g.id, g.name, g.color, g.sort_order, g.created_at
                 FROM groups g JOIN projects p ON g.id = p.group_id
                 WHERE p.id = ?1",
                params![project_id],
                Self::row_to_group,
            )
            .map_err(|e| AppError::NotFound(format!("Project group not found: {}", e)))
        })
    }

    pub fn get_projects_in_group(&self, group_id: &str) -> Result<Vec<GitProject>, AppError> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare("SELECT id, name, path, alias, sort_order, group_id, last_active_at, last_commit_hash, created_at, updated_at, color, description, notes
                           FROM projects WHERE group_id = ?1 ORDER BY sort_order, name")
                .map_err(|e| AppError::Database(format!("Failed to prepare get_projects_in_group: {}", e)))?;

            let projects = stmt
                .query_map(params![group_id], Self::row_to_project)
                .map_err(|e| AppError::Database(format!("Failed to query get_projects_in_group: {}", e)))?
                .filter_map(|r| {
                    r.map_err(|e| log::warn!("skipping corrupt project row: {}", e))
                        .ok()
                })
                .collect();

            Ok(projects)
        })
    }

    pub fn reassign_group_projects(
        &self,
        old_group_id: &str,
        new_group_id: &str,
    ) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE projects SET group_id = ?1, updated_at = datetime('now') WHERE group_id = ?2",
                params![new_group_id, old_group_id],
            )
            .map_err(|e| AppError::Database(format!("Failed to reassign group projects: {}", e)))?;
            Ok(())
        })
    }

    // ── Task Workspaces ──────────────────────────────────────────────────

    fn row_to_task_workspace(row: &rusqlite::Row) -> rusqlite::Result<TaskWorkspace> {
        Ok(TaskWorkspace {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            status: TaskWorkspaceStatus::parse(&row.get::<_, String>(3)?),
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
            last_opened_at: row.get(6)?,
        })
    }

    fn row_to_task_workspace_entry(row: &rusqlite::Row) -> rusqlite::Result<TaskWorkspaceEntry> {
        Ok(TaskWorkspaceEntry {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            project_id: row.get(2)?,
            sort_order: row.get(3)?,
            strategy: TaskStrategy::parse(&row.get::<_, String>(4)?),
            target_branch: row.get(5)?,
            base_branch: row.get(6)?,
            worktree_path: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }

    pub fn insert_task_workspace(&self, workspace: &TaskWorkspace) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO task_workspaces (id, name, description, status, created_at, updated_at, last_opened_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    workspace.id,
                    workspace.name,
                    workspace.description,
                    workspace.status.as_str(),
                    workspace.created_at,
                    workspace.updated_at,
                    workspace.last_opened_at,
                ],
            )
            .map_err(|e| AppError::Database(format!("Failed to create task workspace: {}", e)))?;
            Ok(())
        })
    }

    pub fn get_task_workspace(&self, id: &str) -> Result<TaskWorkspace, AppError> {
        self.with_conn(|conn| {
            conn.query_row(
                "SELECT id, name, description, status, created_at, updated_at, last_opened_at
                 FROM task_workspaces WHERE id = ?1",
                params![id],
                Self::row_to_task_workspace,
            )
            .map_err(|e| AppError::NotFound(format!("Task workspace not found: {}", e)))
        })
    }

    pub fn list_task_workspaces(
        &self,
        include_archived: bool,
    ) -> Result<Vec<TaskWorkspace>, AppError> {
        self.with_conn(|conn| {
            let query = if include_archived {
                "SELECT id, name, description, status, created_at, updated_at, last_opened_at
                 FROM task_workspaces ORDER BY status, COALESCE(last_opened_at, updated_at) DESC"
            } else {
                "SELECT id, name, description, status, created_at, updated_at, last_opened_at
                 FROM task_workspaces WHERE status = 'active'
                 ORDER BY COALESCE(last_opened_at, updated_at) DESC"
            };
            let mut statement = conn.prepare(query).map_err(|e| {
                AppError::Database(format!("Failed to prepare task workspace list: {}", e))
            })?;
            let items = statement
                .query_map([], Self::row_to_task_workspace)
                .map_err(|e| AppError::Database(format!("Failed to query task workspaces: {}", e)))?
                .filter_map(Result::ok)
                .collect();
            Ok(items)
        })
    }

    pub fn update_task_workspace(
        &self,
        id: &str,
        name: &str,
        description: Option<&str>,
    ) -> Result<TaskWorkspace, AppError> {
        self.with_conn(|conn| {
            let affected = conn
                .execute(
                    "UPDATE task_workspaces
                     SET name = ?1, description = ?2, updated_at = datetime('now') WHERE id = ?3",
                    params![name, description, id],
                )
                .map_err(|e| {
                    AppError::Database(format!("Failed to update task workspace: {}", e))
                })?;
            if affected == 0 {
                return Err(AppError::NotFound("Task workspace not found".to_string()));
            }
            Ok(())
        })?;
        self.get_task_workspace(id)
    }

    pub fn archive_task_workspace(&self, id: &str) -> Result<(), AppError> {
        self.with_conn(|conn| {
            let affected = conn
                .execute(
                    "UPDATE task_workspaces SET status = 'archived', updated_at = datetime('now') WHERE id = ?1",
                    params![id],
                )
                .map_err(|e| AppError::Database(format!("Failed to archive task workspace: {}", e)))?;
            if affected == 0 {
                return Err(AppError::NotFound("Task workspace not found".to_string()));
            }
            Ok(())
        })
    }

    pub fn touch_task_workspace(&self, id: &str) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE task_workspaces
                 SET last_opened_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
                params![id],
            )
            .map_err(|e| AppError::Database(format!("Failed to touch task workspace: {}", e)))?;
            Ok(())
        })
    }

    pub fn insert_task_workspace_entry(&self, entry: &TaskWorkspaceEntry) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO task_workspace_entries
                 (id, workspace_id, project_id, sort_order, strategy, target_branch, base_branch, worktree_path, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    entry.id,
                    entry.workspace_id,
                    entry.project_id,
                    entry.sort_order,
                    entry.strategy.as_str(),
                    entry.target_branch,
                    entry.base_branch,
                    entry.worktree_path,
                    entry.created_at,
                    entry.updated_at,
                ],
            )
            .map_err(|e| AppError::Database(format!("Failed to add task workspace project: {}", e)))?;
            Ok(())
        })
    }

    pub fn delete_task_workspace_entry(&self, id: &str) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute(
                "DELETE FROM task_workspace_entries WHERE id = ?1",
                params![id],
            )
            .map_err(|e| {
                AppError::Database(format!("Failed to remove task workspace project: {}", e))
            })?;
            Ok(())
        })
    }

    pub fn reorder_task_workspace_entries(
        &self,
        workspace_id: &str,
        entry_ids: &[String],
    ) -> Result<(), AppError> {
        self.with_conn(|conn| {
            let transaction = conn.unchecked_transaction().map_err(|e| AppError::Database(format!("Failed to start task reorder: {}", e)))?;
            for (index, id) in entry_ids.iter().enumerate() {
                transaction.execute("UPDATE task_workspace_entries SET sort_order = ?1, updated_at = datetime('now') WHERE id = ?2 AND workspace_id = ?3", params![index as i64, id, workspace_id])
                    .map_err(|e| AppError::Database(format!("Failed to reorder task project: {}", e)))?;
            }
            transaction.commit().map_err(|e| AppError::Database(format!("Failed to commit task reorder: {}", e)))?;
            Ok(())
        })
    }

    pub fn update_task_workspace_entry(&self, entry: &TaskWorkspaceEntry) -> Result<(), AppError> {
        self.with_conn(|conn| {
            let affected = conn
                .execute(
                    "UPDATE task_workspace_entries
                     SET sort_order = ?1, strategy = ?2, target_branch = ?3, base_branch = ?4,
                         worktree_path = ?5, updated_at = datetime('now') WHERE id = ?6",
                    params![
                        entry.sort_order,
                        entry.strategy.as_str(),
                        entry.target_branch,
                        entry.base_branch,
                        entry.worktree_path,
                        entry.id,
                    ],
                )
                .map_err(|e| {
                    AppError::Database(format!("Failed to update task workspace project: {}", e))
                })?;
            if affected == 0 {
                return Err(AppError::NotFound(
                    "Task workspace project not found".to_string(),
                ));
            }
            Ok(())
        })
    }

    pub fn get_task_workspace_entries(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<TaskWorkspaceEntryDetail>, AppError> {
        self.with_conn(|conn| {
            let mut statement = conn
                .prepare(
                    "SELECT e.id, e.workspace_id, e.project_id, e.sort_order, e.strategy,
                            e.target_branch, e.base_branch, e.worktree_path, e.created_at, e.updated_at,
                            p.id, p.name, p.path, p.alias, p.sort_order, p.group_id,
                            p.last_active_at, p.last_commit_hash, p.created_at, p.updated_at,
                            p.color, p.description, p.notes
                     FROM task_workspace_entries e
                     JOIN projects p ON p.id = e.project_id
                     WHERE e.workspace_id = ?1 ORDER BY e.sort_order",
                )
                .map_err(|e| AppError::Database(format!("Failed to prepare task workspace entries: {}", e)))?;
            let entries = statement
                .query_map(params![workspace_id], |row| {
                    let entry = Self::row_to_task_workspace_entry(row)?;
                    let project = GitProject {
                        id: row.get(10)?, name: row.get(11)?, path: row.get(12)?, alias: row.get(13)?,
                        sort_order: row.get(14)?, group_id: row.get(15)?, last_active_at: row.get(16)?,
                        last_commit_hash: row.get(17)?, created_at: row.get(18)?, updated_at: row.get(19)?,
                        color: row.get(20)?, description: row.get(21)?, notes: row.get(22)?,
                    };
                    Ok(TaskWorkspaceEntryDetail { entry, project })
                })
                .map_err(|e| AppError::Database(format!("Failed to query task workspace entries: {}", e)))?
                .filter_map(Result::ok)
                .collect();
            Ok(entries)
        })
    }

    pub fn get_task_workspace_detail(
        &self,
        id: &str,
    ) -> Result<crate::models::TaskWorkspaceDetail, AppError> {
        Ok(crate::models::TaskWorkspaceDetail {
            workspace: self.get_task_workspace(id)?,
            entries: self.get_task_workspace_entries(id)?,
        })
    }

    pub fn insert_task_workspace_outcome(
        &self,
        outcome: &TaskWorkspaceOutcome,
    ) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute("INSERT INTO task_workspace_outcomes (id, workspace_id, entry_id, state, message, start_branch, start_head, result_branch, worktree_path, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)", params![outcome.id, outcome.workspace_id, outcome.entry_id, outcome.state.as_str(), outcome.message, outcome.start_branch, outcome.start_head, outcome.result_branch, outcome.worktree_path, outcome.created_at])
                .map_err(|e| AppError::Database(format!("Failed to record task outcome: {}", e)))?;
            Ok(())
        })
    }

    pub fn list_task_workspace_outcomes(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<TaskWorkspaceOutcome>, AppError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT id, workspace_id, entry_id, state, message, start_branch, start_head, result_branch, worktree_path, created_at FROM task_workspace_outcomes WHERE workspace_id = ?1 ORDER BY created_at DESC")
                .map_err(|e| AppError::Database(format!("Failed to prepare task outcomes: {}", e)))?;
            let items = stmt.query_map(params![workspace_id], |row| Ok(TaskWorkspaceOutcome { id: row.get(0)?, workspace_id: row.get(1)?, entry_id: row.get(2)?, state: TaskExecutionState::parse(&row.get::<_, String>(3)?), message: row.get(4)?, start_branch: row.get(5)?, start_head: row.get(6)?, result_branch: row.get(7)?, worktree_path: row.get(8)?, created_at: row.get(9)? }))
                .map_err(|e| AppError::Database(format!("Failed to query task outcomes: {}", e)))?.filter_map(Result::ok).collect();
            Ok(items)
        })
    }

    // ── Reviews ─────────────────────────────────────────────────────────

    pub fn insert_review(&self, review: &ReviewResult, project_path: &str) -> Result<(), AppError> {
        self.with_conn(|conn| {
            let findings_json = serde_json::to_string(&review.findings)
                .map_err(|e| AppError::Other(format!("Failed to serialize findings: {}", e)))?;
            let stats_json = serde_json::to_string(&review.stats)
                .map_err(|e| AppError::Other(format!("Failed to serialize stats: {}", e)))?;

            conn.execute(
                "INSERT INTO reviews (id, project_path, base_branch, head_branch, summary, findings_json, stats_json, model, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    review.id,
                    project_path,
                    review.base_branch,
                    review.head_branch,
                    review.summary,
                    findings_json,
                    stats_json,
                    review.model,
                    review.created_at,
                ],
            )
            .map_err(|e| AppError::Database(format!("Failed to insert review: {}", e)))?;
            Ok(())
        })
    }

    pub fn get_reviews_for_project(
        &self,
        project_path: &str,
    ) -> Result<Vec<ReviewResult>, AppError> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT id, base_branch, head_branch, summary, findings_json, stats_json, model, created_at
                     FROM reviews WHERE project_path = ?1 ORDER BY created_at DESC",
                )
                .map_err(|e| AppError::Database(format!("Failed to prepare reviews query: {}", e)))?;

            let reviews = stmt
                .query_map(params![project_path], |row| {
                    let findings_json: String = row.get(4)?;
                    let stats_json: String = row.get(5)?;

                    let findings = serde_json::from_str(&findings_json).unwrap_or_default();
                    let stats = serde_json::from_str(&stats_json).unwrap_or(crate::models::DiffStats {
                        files_changed: 0,
                        total_additions: 0,
                        total_deletions: 0,
                    });

                    Ok(ReviewResult {
                        id: row.get(0)?,
                        base_branch: row.get(1)?,
                        head_branch: row.get(2)?,
                        summary: row.get(3)?,
                        findings,
                        stats,
                        model: row.get(6)?,
                        created_at: row.get(7)?,
                    })
                })
                .map_err(|e| AppError::Database(format!("Failed to query reviews: {}", e)))?
                .filter_map(|r| {
                    r.map_err(|e| log::warn!("skipping corrupt review row: {}", e))
                        .ok()
                })
                .collect();

            Ok(reviews)
        })
    }

    pub fn delete_review(&self, id: &str) -> Result<(), AppError> {
        self.with_conn(|conn| {
            let affected = conn
                .execute("DELETE FROM reviews WHERE id = ?1", params![id])
                .map_err(|e| AppError::Database(format!("Failed to delete review: {}", e)))?;
            if affected == 0 {
                return Err(AppError::NotFound(format!("Review not found: {}", id)));
            }
            Ok(())
        })
    }

    // ── Custom Commands ────────────────────────────────────────────────────

    pub fn insert_custom_command(
        &self,
        id: &str,
        name: &str,
        command: &str,
        shortcut: Option<&str>,
        sort_order: i32,
    ) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO custom_commands (id, name, command, shortcut, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, name, command, shortcut, sort_order],
            )
            .map_err(|e| AppError::Database(format!("Failed to insert custom command: {}", e)))?;
            Ok(())
        })
    }

    pub fn get_all_custom_commands(&self) -> Result<Vec<CustomCommand>, AppError> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT id, name, command, shortcut, sort_order, created_at
                     FROM custom_commands ORDER BY sort_order, name",
                )
                .map_err(|e| AppError::Database(format!("Failed to prepare query: {}", e)))?;
            let rows = stmt
                .query_map([], |row| {
                    Ok(CustomCommand {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        command: row.get(2)?,
                        shortcut: row.get(3)?,
                        sort_order: row.get(4)?,
                        created_at: row.get(5)?,
                    })
                })
                .map_err(|e| {
                    AppError::Database(format!("Failed to query custom commands: {}", e))
                })?;
            let mut commands = Vec::new();
            for row in rows {
                commands.push(row.map_err(|e| AppError::Database(e.to_string()))?);
            }
            Ok(commands)
        })
    }

    pub fn delete_custom_command(&self, id: &str) -> Result<(), AppError> {
        self.with_conn(|conn| {
            let affected = conn
                .execute("DELETE FROM custom_commands WHERE id = ?1", params![id])
                .map_err(|e| {
                    AppError::Database(format!("Failed to delete custom command: {}", e))
                })?;
            if affected == 0 {
                return Err(AppError::NotFound(format!(
                    "Custom command not found: {}",
                    id
                )));
            }
            Ok(())
        })
    }

    // ── Operation Log ────────────────────────────────────────────────────

    #[allow(clippy::too_many_arguments)]
    pub fn insert_operation_log(
        &self,
        id: &str,
        operation_type: &str,
        project_path: &str,
        project_name: Option<&str>,
        details: Option<&str>,
        status: &str,
        error_message: Option<&str>,
    ) -> Result<(), AppError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO operation_log (id, operation_type, project_path, project_name, details, status, error_message)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![id, operation_type, project_path, project_name, details, status, error_message],
            )
            .map_err(|e| AppError::Database(format!("Failed to insert operation log: {}", e)))?;
            Ok(())
        })
    }

    pub fn get_operation_log(&self, limit: usize) -> Result<Vec<OperationLogEntry>, AppError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, operation_type, project_path, project_name, details, status, error_message, created_at
                 FROM operation_log ORDER BY created_at DESC LIMIT ?1",
            )
            .map_err(|e| AppError::Database(format!("Failed to prepare operation log query: {}", e)))?;
            let rows = stmt.query_map(params![limit as i64], |row| {
                Ok(OperationLogEntry {
                    id: row.get(0)?,
                    operation_type: row.get(1)?,
                    project_path: row.get(2)?,
                    project_name: row.get(3)?,
                    details: row.get(4)?,
                    status: row.get(5)?,
                    error_message: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query operation log: {}", e)))?;
            let mut entries = Vec::new();
            for row in rows {
                entries.push(row.map_err(|e| AppError::Database(e.to_string()))?);
            }
            Ok(entries)
        })
    }
}

use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::models::{GitProject, Group};

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    fn with_conn<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        f(&conn)
    }

    pub fn new(app_data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(app_data_dir)
            .map_err(|e| format!("Failed to create data dir: {}", e))?;

        let db_path = app_data_dir.join("git-switcher.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;
             PRAGMA busy_timeout = 5000;"
        ).map_err(|e| format!("Failed to set PRAGMA: {}", e))?;

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
            );"
        )
        .map_err(|e| format!("Failed to create tables: {}", e))?;

        // Step 2: Add new columns to projects (ALTER TABLE silently fails if column exists)
        let migrate_columns = [
            ("alias", "TEXT"),
            ("sort_order", "INTEGER NOT NULL DEFAULT 0"),
            ("last_active_at", "TEXT"),
            ("last_commit_hash", "TEXT"),
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
        let result = conn.execute(
            "ALTER TABLE projects ADD COLUMN group_id TEXT",
            [],
        );
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
        ).map_err(|e| format!("Failed to migrate project groups: {}", e))?;

        // Ensure a "Default" group exists for ungrouped projects
        let has_groups: bool = conn
            .query_row("SELECT EXISTS(SELECT 1 FROM groups LIMIT 1)", [], |row| row.get(0))
            .unwrap_or(false);
        if !has_groups {
            conn.execute(
                "INSERT INTO groups (id, name, color, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![uuid::Uuid::new_v4().to_string(), "Default", "#6B7280", 0, chrono::Utc::now().to_rfc3339()],
            ).map_err(|e| format!("Failed to create default group: {}", e))?;
        }

        // Assign remaining ungrouped projects to the first group
        conn.execute(
            "UPDATE projects SET group_id = (SELECT id FROM groups ORDER BY sort_order, name LIMIT 1) WHERE group_id IS NULL",
            [],
        ).map_err(|e| format!("Failed to assign default group: {}", e))?;

        // Drop the junction table
        conn.execute("DROP TABLE IF EXISTS project_groups", [])
            .map_err(|e| format!("Failed to drop project_groups: {}", e))?;

        // Step 3: Create indexes (safe now because columns exist)
        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_projects_sort ON projects(sort_order);
             CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);
             CREATE INDEX IF NOT EXISTS idx_groups_sort ON groups(sort_order);
             CREATE INDEX IF NOT EXISTS idx_projects_group ON projects(group_id);"
        )
        .map_err(|e| format!("Failed to create indexes: {}", e))?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
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

    pub fn insert_project(&self, project: &GitProject) -> Result<(), String> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO projects (id, name, path, alias, sort_order, group_id, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    project.id, project.name, project.path, project.alias,
                    project.sort_order, project.group_id, project.created_at, project.updated_at,
                ],
            )
            .map_err(|e| format!("Failed to insert project: {}", e))?;
            Ok(())
        })
    }

    pub fn get_all_projects(&self) -> Result<Vec<GitProject>, String> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare("SELECT id, name, path, alias, sort_order, group_id, last_active_at, last_commit_hash, created_at, updated_at FROM projects ORDER BY sort_order, name")
                .map_err(|e| format!("Failed to prepare statement: {}", e))?;

            let projects = stmt
                .query_map([], |row| Self::row_to_project(row))
                .map_err(|e| format!("Failed to query projects: {}", e))?
                .filter_map(|r| r.map_err(|e| log::warn!("skipping corrupt project row: {}", e)).ok())
                .collect();

            Ok(projects)
        })
    }

    pub fn get_project_by_path(&self, path: &str) -> Result<GitProject, String> {
        self.with_conn(|conn| {
            conn.query_row(
                "SELECT id, name, path, alias, sort_order, group_id, last_active_at, last_commit_hash, created_at, updated_at FROM projects WHERE path = ?1",
                params![path],
                |row| Self::row_to_project(row),
            )
            .map_err(|e| format!("Project not found at path '{}': {}", path, e))
        })
    }

    pub fn delete_project(&self, id: &str) -> Result<(), String> {
        self.with_conn(|conn| {
            let affected = conn
                .execute("DELETE FROM projects WHERE id = ?1", params![id])
                .map_err(|e| format!("Failed to delete project: {}", e))?;
            if affected == 0 {
                return Err(format!("Project not found: {}", id));
            }
            Ok(())
        })
    }

    pub fn project_exists(&self, path: &str) -> Result<bool, String> {
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

    pub fn update_project_alias(&self, id: &str, alias: &str) -> Result<(), String> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE projects SET alias = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![alias, id],
            )
            .map_err(|e| format!("Failed to update alias: {}", e))?;
            Ok(())
        })
    }

    pub fn update_project_activity(&self, id: &str, commit_hash: &str) -> Result<(), String> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE projects SET last_active_at = datetime('now'), last_commit_hash = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![commit_hash, id],
            )
            .map_err(|e| format!("Failed to update activity: {}", e))?;
            Ok(())
        })
    }

    pub fn reorder_projects(&self, ordered_ids: &[String]) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        conn.execute("BEGIN", []).map_err(|e| format!("Failed to begin transaction: {}", e))?;
        let result = (|| -> Result<(), String> {
            for (i, id) in ordered_ids.iter().enumerate() {
                conn.execute(
                    "UPDATE projects SET sort_order = ?1 WHERE id = ?2",
                    params![i as i64, id],
                )
                .map_err(|e| format!("Failed to reorder: {}", e))?;
            }
            Ok(())
        })();
        if result.is_ok() {
            conn.execute("COMMIT", []).map_err(|e| format!("Failed to commit: {}", e))?;
        } else {
            if let Err(e) = conn.execute("ROLLBACK", []) {
                log::error!("rollback failed: {}", e);
            }
        }
        result
    }

    // ── Groups ──────────────────────────────────────────────────────────

    pub fn insert_group(&self, group: &Group) -> Result<(), String> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO groups (id, name, color, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![group.id, group.name, group.color, group.sort_order, group.created_at],
            )
            .map_err(|e| format!("Failed to insert group: {}", e))?;
            Ok(())
        })
    }

    pub fn get_all_groups(&self) -> Result<Vec<Group>, String> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare("SELECT id, name, color, sort_order, created_at FROM groups ORDER BY sort_order, name")
                .map_err(|e| format!("Failed to prepare groups: {}", e))?;

            let groups = stmt
                .query_map([], |row| Self::row_to_group(row))
                .map_err(|e| format!("Failed to query groups: {}", e))?
                .filter_map(|r| r.map_err(|e| log::warn!("skipping corrupt group row: {}", e)).ok())
                .collect();

            Ok(groups)
        })
    }

    pub fn get_group_by_id(&self, id: &str) -> Result<Group, String> {
        self.with_conn(|conn| {
            conn.query_row(
                "SELECT id, name, color, sort_order, created_at FROM groups WHERE id = ?1",
                params![id],
                |row| Self::row_to_group(row),
            )
            .map_err(|e| format!("Group not found: {}", e))
        })
    }

    pub fn delete_group(&self, id: &str) -> Result<(), String> {
        self.with_conn(|conn| {
            let affected = conn
                .execute("DELETE FROM groups WHERE id = ?1", params![id])
                .map_err(|e| format!("Failed to delete group: {}", e))?;
            if affected == 0 {
                return Err(format!("Group not found: {}", id));
            }
            Ok(())
        })
    }

    pub fn update_group(&self, group: &Group) -> Result<(), String> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE groups SET name = ?1, color = ?2, sort_order = ?3 WHERE id = ?4",
                params![group.name, group.color, group.sort_order, group.id],
            )
            .map_err(|e| format!("Failed to update group: {}", e))?;
            Ok(())
        })
    }

    // ── Project-Group relations ─────────────────────────────────────────

    pub fn assign_project_to_group(&self, project_id: &str, group_id: &str) -> Result<(), String> {
        self.with_conn(|conn| {
            let affected = conn
                .execute(
                    "UPDATE projects SET group_id = ?1, updated_at = datetime('now') WHERE id = ?2",
                    params![group_id, project_id],
                )
                .map_err(|e| format!("Failed to assign project to group: {}", e))?;
            if affected == 0 {
                return Err(format!("Project not found: {}", project_id));
            }
            Ok(())
        })
    }

    pub fn get_project_group(&self, project_id: &str) -> Result<Group, String> {
        self.with_conn(|conn| {
            conn.query_row(
                "SELECT g.id, g.name, g.color, g.sort_order, g.created_at
                 FROM groups g JOIN projects p ON g.id = p.group_id
                 WHERE p.id = ?1",
                params![project_id],
                |row| Self::row_to_group(row),
            )
            .map_err(|e| format!("Project group not found: {}", e))
        })
    }

    pub fn get_projects_in_group(&self, group_id: &str) -> Result<Vec<GitProject>, String> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare("SELECT id, name, path, alias, sort_order, group_id, last_active_at, last_commit_hash, created_at, updated_at
                           FROM projects WHERE group_id = ?1 ORDER BY sort_order, name")
                .map_err(|e| format!("Failed to prepare get_projects_in_group: {}", e))?;

            let projects = stmt
                .query_map(params![group_id], |row| Self::row_to_project(row))
                .map_err(|e| format!("Failed to query get_projects_in_group: {}", e))?
                .filter_map(|r| r.map_err(|e| log::warn!("skipping corrupt project row: {}", e)).ok())
                .collect();

            Ok(projects)
        })
    }

    pub fn reassign_group_projects(&self, old_group_id: &str, new_group_id: &str) -> Result<(), String> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE projects SET group_id = ?1, updated_at = datetime('now') WHERE group_id = ?2",
                params![new_group_id, old_group_id],
            )
            .map_err(|e| format!("Failed to reassign group projects: {}", e))?;
            Ok(())
        })
    }
}

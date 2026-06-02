use std::fs;
use std::path::Path;

use crate::AppError;
use crate::models::{WorkspaceFile, WorkspaceFolder};

pub struct WorkspaceService;

impl WorkspaceService {
    pub fn parse_workspace_file(file_path: &str) -> Result<Vec<WorkspaceFolder>, AppError> {
        let content = fs::read_to_string(file_path)?;

        // Strip comments and trailing commas (VSCode workspace files are JSONC)
        let cleaned = Self::strip_jsonc(&content);

        let workspace: WorkspaceFile = serde_json::from_str(&cleaned)
            .map_err(|e| AppError::Config(format!("Failed to parse workspace file: {}", e)))?;

        let workspace_dir = Path::new(file_path)
            .parent()
            .ok_or_else(|| AppError::Config("Invalid workspace file path".to_string()))?;

        let mut resolved_folders = Vec::new();
        for folder in workspace.folders {
            let resolved_path = if Path::new(&folder.path).is_absolute() {
                folder.path.clone()
            } else {
                workspace_dir
                    .join(&folder.path)
                    .canonicalize()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| folder.path.clone())
            };

            resolved_folders.push(WorkspaceFolder {
                path: resolved_path,
                name: folder.name,
            });
        }

        Ok(resolved_folders)
    }

    fn strip_jsonc(input: &str) -> String {
        let mut result = String::with_capacity(input.len());
        let mut in_string = false;
        let mut prev_char = '\0';
        let chars: Vec<char> = input.chars().collect();
        let len = chars.len();
        let mut i = 0;

        while i < len {
            let c = chars[i];

            // Handle string literals
            if c == '"' && prev_char != '\\' {
                in_string = !in_string;
                result.push(c);
                prev_char = c;
                i += 1;
                continue;
            }

            if in_string {
                result.push(c);
                prev_char = c;
                i += 1;
                continue;
            }

            // Strip // line comments
            if c == '/' && i + 1 < len && chars[i + 1] == '/' {
                while i < len && chars[i] != '\n' {
                    i += 1;
                }
                continue;
            }

            // Strip /* */ block comments
            if c == '/' && i + 1 < len && chars[i + 1] == '*' {
                i += 2; // skip /*
                while i + 1 < len && !(chars[i] == '*' && chars[i + 1] == '/') {
                    i += 1;
                }
                i += 2; // skip */
                continue;
            }

            // Strip trailing commas: , followed by ] or } (with optional whitespace)
            if c == ',' {
                let mut j = i + 1;
                while j < len && (chars[j] == ' ' || chars[j] == '\t' || chars[j] == '\n' || chars[j] == '\r') {
                    j += 1;
                }
                if j < len && (chars[j] == ']' || chars[j] == '}') {
                    i += 1;
                    continue;
                }
            }

            result.push(c);
            prev_char = c;
            i += 1;
        }

        result
    }
}

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::State;

use crate::db::Database;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub project_name: String,
    pub file_path: String,
    pub line_number: usize,
    pub line_content: String,
    pub match_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub extensions: Option<Vec<String>>,
    pub max_results: Option<usize>,
    pub exclude_dirs: Option<Vec<String>>,
}

const DEFAULT_EXCLUDES: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    "__pycache__",
];

const DEFAULT_MAX_RESULTS: usize = 100;

fn regex_escape(input: &str) -> String {
    let special = r"\.+*?^${}()|[]";
    let mut out = String::with_capacity(input.len() * 2);
    for c in input.chars() {
        if special.contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

fn score_result(query: &str, project_name: &str, file_path: &str, line_content: &str) -> f64 {
    let q_lower = query.to_lowercase();
    let mut score: f64 = 0.0;

    // Exact substring match in line content scores highest
    if line_content.to_lowercase().contains(&q_lower) {
        score += 100.0;
    }

    // Word boundary match
    let words: Vec<&str> = line_content.split_whitespace().collect();
    if words.iter().any(|w| w.to_lowercase() == q_lower) {
        score += 80.0;
    }

    // Partial match in tokens
    if words.iter().any(|w| w.to_lowercase().contains(&q_lower)) {
        score += 50.0;
    }

    // Boost for project name match
    if project_name.to_lowercase().contains(&q_lower) {
        score += 30.0;
    }

    // Boost for file path match
    if file_path.to_lowercase().contains(&q_lower) {
        score += 20.0;
    }

    score
}

#[tauri::command]
pub async fn search_content(
    query: String,
    options: Option<SearchOptions>,
    db: State<'_, Database>,
) -> Result<Vec<SearchResult>, AppError> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let max_results = options
        .as_ref()
        .and_then(|o| o.max_results)
        .unwrap_or(DEFAULT_MAX_RESULTS);

    let extensions = options.as_ref().and_then(|o| o.extensions.clone());

    let exclude_dirs: Vec<String> = options
        .as_ref()
        .and_then(|o| o.exclude_dirs.clone())
        .unwrap_or_else(|| DEFAULT_EXCLUDES.iter().map(|s| s.to_string()).collect());

    let projects = db
        .get_all_projects()
        .map_err(|e| AppError::Database(e.to_string()))?;

    let pattern = format!("(?i){}", regex_escape(&query));

    tokio::task::spawn_blocking(move || {
        use grep::regex::RegexMatcherBuilder;
        use grep::searcher::sinks::UTF8;
        use grep::searcher::SearcherBuilder;

        let matcher = match RegexMatcherBuilder::new().build(&pattern) {
            Ok(m) => m,
            Err(_) => return Ok(Vec::new()),
        };

        let all_done = Arc::new(AtomicBool::new(false));
        let counter = Arc::new(AtomicUsize::new(0));
        let mut all_results: Vec<SearchResult> = Vec::new();

        for project in &projects {
            if all_done.load(Ordering::Relaxed) {
                break;
            }

            let project_path = std::path::Path::new(&project.path);
            if !project_path.exists() {
                continue;
            }

            let walker = walkdir::WalkDir::new(project_path)
                .into_iter()
                .filter_entry(|e| {
                    let name = e.file_name().to_string_lossy();
                    !exclude_dirs.iter().any(|d| name.as_ref() == d.as_str())
                })
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file());

            for entry in walker {
                if all_done.load(Ordering::Relaxed) {
                    break;
                }

                let file_path = entry.path();

                // Filter by extension if specified
                if let Some(ref exts) = extensions {
                    match file_path.extension().and_then(|e| e.to_str()) {
                        Some(ext) if exts.iter().any(|e| e == ext) => {}
                        _ => continue,
                    }
                }

                let relative = file_path
                    .strip_prefix(project_path)
                    .ok()
                    .and_then(|p| p.to_str())
                    .unwrap_or("")
                    .to_string();

                let project_name = project.name.clone();
                let done_flag = all_done.clone();
                let cnt = counter.clone();
                let max = max_results;

                let mut matches = Vec::new();

                let result = SearcherBuilder::new().build().search_path(
                    &matcher,
                    file_path,
                    UTF8(|_line_number, line_content| {
                        let line_number = _line_number as usize;
                        let trimmed = line_content.trim_end();
                        let score = score_result(&query, &project_name, &relative, trimmed);

                        matches.push(SearchResult {
                            project_name: project_name.clone(),
                            file_path: relative.clone(),
                            line_number,
                            line_content: trimmed.to_string(),
                            match_score: score,
                        });

                        let total = cnt.fetch_add(1, Ordering::Relaxed) + 1;
                        if total >= max {
                            done_flag.store(true, Ordering::Relaxed);
                            return Ok(false);
                        }

                        Ok(true)
                    }),
                );

                if result.is_ok() {
                    all_results.extend(matches);
                }
            }
        }

        // Sort by score descending
        all_results.sort_by(|a, b| {
            b.match_score
                .partial_cmp(&a.match_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        all_results.truncate(max_results);
        Ok(all_results)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

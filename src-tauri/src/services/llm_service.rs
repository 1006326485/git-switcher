use git2::{Delta, DiffOptions, Patch, Repository};

use crate::models::{BranchDiff, DiffFile, DiffStats, LlmConfig, ReviewResult};
use chrono::Utc;
use uuid::Uuid;

pub struct LlmService;

// ── Helpers ──────────────────────────────────────────────────────────────

/// UTF-8 safe truncation — panics no more on multi-byte boundaries.
fn truncate_str(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let end = s.floor_char_boundary(max_bytes);
    &s[..end]
}

/// Paths that should never be sent to the LLM.
fn is_excluded_path(path: &str) -> bool {
    static EXCLUDED: &[&str] = &[
        "package-lock.json",
        "Cargo.lock",
        "pnpm-lock.yaml",
        "yarn.lock",
        "bun.lockb",
    ];
    static EXCLUDED_PREFIXES: &[&str] = &["node_modules/", "dist/", "target/", ".git/"];
    static EXCLUDED_EXTENSIONS: &[&str] = &[
        ".min.js", ".min.css", ".map", ".png", ".jpg", ".jpeg", ".gif",
        ".ico", ".icns", ".svg", ".woff", ".woff2", ".ttf", ".eot",
        ".wasm", ".lock",
    ];

    let basename = path.rsplit('/').next().unwrap_or(path);
    if EXCLUDED.iter().any(|&e| basename == e) {
        return true;
    }
    if EXCLUDED_PREFIXES.iter().any(|&p| path.starts_with(p)) {
        return true;
    }
    let lower = path.to_lowercase();
    if EXCLUDED_EXTENSIONS.iter().any(|&ext| lower.ends_with(ext)) {
        return true;
    }
    false
}

// ── Diff Extraction ──────────────────────────────────────────────────────

const MAX_RAW_PATCH_BYTES: usize = 5000;

impl LlmService {
    pub fn get_branch_diff(
        path: &str,
        base_branch: &str,
        head_branch: &str,
    ) -> Result<BranchDiff, String> {
        let repo = Repository::open(path).map_err(|e| format!("Failed to open repo: {}", e))?;

        let base_ref = repo
            .resolve_reference_from_short_name(base_branch)
            .map_err(|e| format!("Base branch '{}' not found: {}", base_branch, e))?;
        let head_ref = repo
            .resolve_reference_from_short_name(head_branch)
            .map_err(|e| format!("Head branch '{}' not found: {}", head_branch, e))?;

        let base_commit = base_ref
            .peel_to_commit()
            .map_err(|e| format!("Failed to get base commit: {}", e))?;
        let head_commit = head_ref
            .peel_to_commit()
            .map_err(|e| format!("Failed to get head commit: {}", e))?;

        let base_tree = base_commit
            .tree()
            .map_err(|e| format!("Failed to get base tree: {}", e))?;
        let head_tree = head_commit
            .tree()
            .map_err(|e| format!("Failed to get head tree: {}", e))?;

        let mut diff_opts = DiffOptions::new();
        diff_opts.context_lines(3);
        // Skip files larger than 1MB — they're noise for code review
        diff_opts.max_size(1024 * 1024);

        let diff = repo
            .diff_tree_to_tree(Some(&base_tree), Some(&head_tree), Some(&mut diff_opts))
            .map_err(|e| format!("Failed to compute diff: {}", e))?;

        let mut files = Vec::new();
        let mut total_additions = 0u32;
        let mut total_deletions = 0u32;

        let deltas: Vec<_> = diff.deltas().collect();
        for (i, delta) in deltas.iter().enumerate() {
            // Skip binary files
            if delta.flags().contains(git2::DiffFlags::BINARY) {
                continue;
            }

            let old_file = delta.old_file();
            let new_file = delta.new_file();
            let file_path = new_file
                .path()
                .or(old_file.path())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();

            // Skip excluded paths (lock files, build artifacts, images, etc.)
            if is_excluded_path(&file_path) {
                continue;
            }

            let status = match delta.status() {
                Delta::Added => "added",
                Delta::Deleted => "deleted",
                Delta::Modified => "modified",
                Delta::Renamed => "renamed",
                _ => "modified",
            };

            // Get patch — cap at MAX_RAW_PATCH_BYTES during collection
            let (patch, additions, deletions) = match Patch::from_diff(&diff, i) {
                Ok(Some(mut p)) => {
                    let mut buf = Vec::new();
                    let mut truncated = false;
                    if let Err(e) = p.print(&mut |_delta, _hunk, line| {
                        if buf.len() < MAX_RAW_PATCH_BYTES {
                            buf.extend_from_slice(line.content());
                        } else {
                            truncated = true;
                        }
                        true
                    }) {
                        log::warn!("patch print failed: {}", e);
                    }
                    let mut patch_text = String::from_utf8_lossy(&buf).into_owned();
                    if truncated {
                        patch_text.push_str("\n... (truncated)");
                    }
                    let (a, d, _) = p.line_stats().unwrap_or((0, 0, 0));
                    (patch_text, a as u32, d as u32)
                }
                _ => (String::new(), 0u32, 0u32),
            };

            total_additions += additions;
            total_deletions += deletions;

            files.push(DiffFile {
                path: file_path,
                status: status.to_string(),
                additions,
                deletions,
                patch,
            });
        }

        let files_changed = files.len() as u32;

        Ok(BranchDiff {
            base_branch: base_branch.to_string(),
            head_branch: head_branch.to_string(),
            stats: DiffStats {
                files_changed,
                total_additions,
                total_deletions,
            },
            files,
        })
    }

    // ── LLM Review ─────────────────────────────────────────────────────

    pub async fn review_diff(
        diff: &BranchDiff,
        config: &LlmConfig,
    ) -> Result<ReviewResult, String> {
        if config.api_key.is_empty() {
            return Err("API key is not configured. Go to Settings to set up LLM.".to_string());
        }

        let diff_text = Self::format_diff_for_llm(diff);
        let prompt = Self::build_review_prompt(&diff_text);

        let response = Self::call_llm_api(config, &prompt).await?;

        Ok(ReviewResult {
            id: Uuid::new_v4().to_string(),
            base_branch: diff.base_branch.clone(),
            head_branch: diff.head_branch.clone(),
            summary: response,
            findings: vec![],
            stats: diff.stats,
            model: config.model.clone(),
            created_at: Utc::now().to_rfc3339(),
        })
    }

    fn format_diff_for_llm(diff: &BranchDiff) -> String {
        let mut parts = Vec::new();

        parts.push(format!(
            "## Diff: {} → {}\n",
            diff.base_branch, diff.head_branch
        ));
        parts.push(format!(
            "**{} files changed, +{} -{}**\n",
            diff.stats.files_changed, diff.stats.total_additions, diff.stats.total_deletions
        ));

        for file in &diff.files {
            parts.push(format!(
                "### {} ({}) [+{} -{}]\n",
                file.path, file.status, file.additions, file.deletions
            ));
            if file.patch.len() > 2000 {
                parts.push(format!(
                    "```diff\n{}\n... (truncated, {} bytes total)\n```\n",
                    truncate_str(&file.patch, 2000),
                    file.patch.len()
                ));
            } else {
                parts.push(format!("```diff\n{}\n```\n", &file.patch));
            }
        }

        parts.join("\n")
    }

    fn build_review_prompt(diff_text: &str) -> String {
        format!(
            r#"You are an expert code reviewer. Analyze the following git diff and provide a code review in clean, readable Markdown.

## Output Format

Respond in this EXACT Markdown structure:

```markdown
## Summary

One paragraph overall assessment of this diff.

## Findings

### 🔴 [Critical] Title of finding
- **File:** `path/to/file.ext` (line 42)
- **Category:** Security
- **Description:** Detailed explanation of the issue.
- **Suggestion:** How to fix it.

### 🟡 [Warning] Title of finding
- **File:** `path/to/file.ext`
- **Category:** Performance
- **Description:** Explanation.
- **Suggestion:** Fix approach.

### ℹ️ [Info] Title
...

### 💡 [Suggestion] Title
...
```

## Guidelines

- Use severity levels: 🔴 Critical, 🟡 Warning, ℹ️ Info, 💡 Suggestion
- Categories: Bug, Security, Performance, Code Quality, Best Practice
- Always include File and Description for each finding
- Suggestion is optional but recommended
- If the code looks good, still provide the Summary section and note that no issues were found
- Only include findings actually present in the diff
- Keep descriptions concise and actionable

## Diff to Review

{diff_text}"#
        )
    }

    fn get_client() -> Result<&'static reqwest::Client, String> {
        use std::sync::LazyLock;
        static CLIENT: LazyLock<Result<reqwest::Client, String>> = LazyLock::new(|| {
            reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .map_err(|e| format!("Failed to build HTTP client: {}", e))
        });
        CLIENT.as_ref().map_err(|e| e.clone())
    }

    async fn call_llm_api(config: &LlmConfig, prompt: &str) -> Result<String, String> {
        if !config.endpoint.starts_with("https://") {
            return Err("LLM endpoint must use HTTPS to protect your API key".to_string());
        }

        // Auto-append /chat/completions if endpoint is a base URL (e.g. https://api.example.com/v1)
        let url = if config.endpoint.ends_with("/chat/completions") {
            config.endpoint.clone()
        } else {
            format!("{}/chat/completions", config.endpoint.trim_end_matches('/'))
        };

        let client = Self::get_client()?;

        let request_body = serde_json::json!({
            "model": config.model,
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        });

        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    "LLM API request timed out after 120s".to_string()
                } else if e.is_connect() {
                    format!("Cannot connect to LLM endpoint: {}", e)
                } else {
                    format!("LLM API request failed: {}", e)
                }
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("LLM API error ({}): {}", status, body));
        }

        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| "No content in LLM response".to_string())?;

        Ok(content.to_string())
    }
}

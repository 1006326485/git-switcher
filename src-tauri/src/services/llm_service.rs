use git2::{Delta, DiffOptions, Patch, Repository};

use crate::AppError;
use crate::models::{
    BranchDiff, DiffFile, DiffStats, FindingCategory, FindingSeverity, LlmConfig, ReviewFinding,
    ReviewResult,
};
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

/// Leak a string to get a static str (acceptable for small CLI lifetime data).
fn leak_str(s: String) -> &'static str {
    Box::leak(s.into_boxed_str())
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
    ) -> Result<BranchDiff, AppError> {
        let repo = Repository::open(path).map_err(|e| AppError::Git(format!("Failed to open repo: {}", e)))?;

        let base_ref = repo
            .resolve_reference_from_short_name(base_branch)
            .map_err(|e| AppError::Git(format!("Base branch '{}' not found: {}", base_branch, e)))?;
        let head_ref = repo
            .resolve_reference_from_short_name(head_branch)
            .map_err(|e| AppError::Git(format!("Head branch '{}' not found: {}", head_branch, e)))?;

        let base_commit = base_ref
            .peel_to_commit()
            .map_err(|e| AppError::Git(format!("Failed to get base commit: {}", e)))?;
        let head_commit = head_ref
            .peel_to_commit()
            .map_err(|e| AppError::Git(format!("Failed to get head commit: {}", e)))?;

        let base_tree = base_commit
            .tree()
            .map_err(|e| AppError::Git(format!("Failed to get base tree: {}", e)))?;
        let head_tree = head_commit
            .tree()
            .map_err(|e| AppError::Git(format!("Failed to get head tree: {}", e)))?;

        let mut diff_opts = DiffOptions::new();
        diff_opts.context_lines(3);
        // Skip files larger than 1MB — they're noise for code review
        diff_opts.max_size(1024 * 1024);

        let diff = repo
            .diff_tree_to_tree(Some(&base_tree), Some(&head_tree), Some(&mut diff_opts))
            .map_err(|e| AppError::Git(format!("Failed to compute diff: {}", e)))?;

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
    ) -> Result<ReviewResult, AppError> {
        if config.api_key.is_empty() {
            return Err(AppError::Llm("API key is not configured. Go to Settings to set up LLM.".to_string()));
        }

        let diff_text = Self::format_diff_for_llm(diff);
        let prompt = Self::build_review_prompt(&diff_text);

        let response = Self::call_llm_api(config, &prompt).await?;
        let findings = Self::parse_findings(&response);

        Ok(ReviewResult {
            id: Uuid::new_v4().to_string(),
            base_branch: diff.base_branch.clone(),
            head_branch: diff.head_branch.clone(),
            summary: response,
            findings,
            stats: diff.stats,
            model: config.model.clone(),
            created_at: Utc::now().to_rfc3339(),
        })
    }

    fn parse_findings(markdown: &str) -> Vec<ReviewFinding> {
        let mut findings = Vec::new();
        let mut in_findings_section = false;

        for line in markdown.lines() {
            let trimmed = line.trim();

            // Detect the Findings section
            if trimmed.eq_ignore_ascii_case("## Findings") {
                in_findings_section = true;
                continue;
            }
            // Stop at next top-level section
            if in_findings_section && trimmed.starts_with("## ") && !trimmed.eq_ignore_ascii_case("## Findings") {
                break;
            }

            if !in_findings_section {
                continue;
            }

            // Parse finding headings like: ### 🔴 [Critical] Title
            if trimmed.starts_with("### ") {
                let heading = &trimmed[4..];
                let (severity, title) = Self::parse_finding_heading(heading);
                findings.push(ReviewFinding {
                    severity,
                    category: FindingCategory::Quality,
                    file_path: None,
                    line_hint: None,
                    title,
                    description: String::new(),
                    suggestion: None,
                });
                continue;
            }

            // Parse metadata lines for the current finding
            if let Some(finding) = findings.last_mut() {
                if let Some(rest) = trimmed.strip_prefix("- **File:**") {
                    let file_info = rest.trim();
                    // Extract path from backtick: `path/to/file` (line 42)
                    if let Some(start) = file_info.find('`') {
                        if let Some(end) = file_info[start + 1..].find('`') {
                            finding.file_path =
                                Some(file_info[start + 1..start + 1 + end].to_string());
                            // Extract line hint if present
                            let after = &file_info[start + 1 + end + 1..];
                            if let Some(paren_start) = after.find('(') {
                                if let Some(paren_end) = after.find(')') {
                                    finding.line_hint = Some(
                                        after[paren_start + 1..paren_end].to_string(),
                                    );
                                }
                            }
                        }
                    }
                } else if let Some(rest) = trimmed.strip_prefix("- **Category:**") {
                    finding.category = Self::parse_category(rest.trim());
                } else if let Some(rest) = trimmed.strip_prefix("- **Description:**") {
                    finding.description = rest.trim().to_string();
                } else if let Some(rest) = trimmed.strip_prefix("- **Suggestion:**") {
                    finding.suggestion = Some(rest.trim().to_string());
                }
            }
        }

        findings
    }

    fn parse_finding_heading(heading: &str) -> (FindingSeverity, String) {
        // Patterns: "🔴 [Critical] Title", "[Critical] Title", "Critical: Title"
        let (sev_str, title) = if let Some(rest) = heading.strip_prefix("🔴") {
            Self::split_severity(rest.trim())
        } else if let Some(rest) = heading.strip_prefix("🟡") {
            (Some("warning"), rest.trim().to_string())
        } else if let Some(rest) = heading.strip_prefix("ℹ️") {
            (Some("info"), rest.trim().to_string())
        } else if let Some(rest) = heading.strip_prefix("💡") {
            (Some("suggestion"), rest.trim().to_string())
        } else {
            Self::split_severity(heading)
        };

        let severity = match sev_str {
            Some("critical") => FindingSeverity::Critical,
            Some("warning") => FindingSeverity::Warning,
            Some("info") => FindingSeverity::Info,
            Some("suggestion") => FindingSeverity::Suggestion,
            _ => FindingSeverity::Info,
        };

        (severity, title)
    }

    fn split_severity(text: &str) -> (Option<&str>, String) {
        // Try "[Critical] Title"
        if let Some(rest) = text.strip_prefix('[') {
            if let Some(end) = rest.find(']') {
                let sev = &rest[..end];
                let title = rest[end + 1..].trim().to_string();
                let sev_lower = sev.to_lowercase();
                return (Some(leak_str(sev_lower)), title);
            }
        }
        // Try "Critical: Title"
        if let Some(pos) = text.find(':') {
            let sev = text[..pos].trim().to_lowercase();
            let title = text[pos + 1..].trim().to_string();
            return (Some(leak_str(sev)), title);
        }
        (None, text.to_string())
    }

    fn parse_category(text: &str) -> FindingCategory {
        let lower = text.to_lowercase();
        if lower.contains("security") {
            FindingCategory::Security
        } else if lower.contains("performance") {
            FindingCategory::Performance
        } else if lower.contains("bug") {
            FindingCategory::Bug
        } else if lower.contains("best practice") || lower.contains("best-practice") {
            FindingCategory::BestPractice
        } else {
            FindingCategory::Quality
        }
    }

    // ── Commit Message Generation ───────────────────────────────────────

    pub async fn generate_commit_message(
        path: &str,
        config: &LlmConfig,
    ) -> Result<String, AppError> {
        if config.api_key.is_empty() {
            return Err(AppError::Llm("API key is not configured. Go to Settings to set up LLM.".to_string()));
        }

        // Get staged diff via git diff --cached
        let diff_output = std::process::Command::new("git")
            .args(["diff", "--cached", "--stat"])
            .current_dir(path)
            .output()?;

        let diff_stat = String::from_utf8_lossy(&diff_output.stdout);
        if diff_stat.trim().is_empty() {
            return Err(AppError::Other("No staged changes found. Stage files first.".to_string()));
        }

        // Get full staged diff (truncated)
        let full_diff_output = std::process::Command::new("git")
            .args(["diff", "--cached"])
            .current_dir(path)
            .output()?;

        let mut diff_text = String::from_utf8_lossy(&full_diff_output.stdout).into_owned();
        if diff_text.len() > 4000 {
            diff_text.truncate(4000);
            diff_text.push_str("\n... (truncated)");
        }

        let prompt = format!(
            r#"You are an expert developer. Generate a concise, conventional commit message for the following staged changes.

## Rules
- Use conventional commit format: `type(scope): description`
- Types: feat, fix, refactor, docs, style, test, chore, perf, ci, build
- Keep the first line under 72 characters
- Add a blank line then a brief body if needed (wrap at 72 chars)
- Do NOT include any explanation, just the commit message text
- Do NOT wrap in code blocks or quotes

## Staged Changes (stat)
{diff_stat}

## Full Diff
```diff
{diff_text}
```"#
        );

        let response = Self::call_llm_api(config, &prompt).await?;

        // Clean up: remove markdown code fences if the LLM wrapped them
        let cleaned = response
            .trim()
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
            .trim_start_matches("commit")
            .trim()
            .to_string();

        Ok(cleaned)
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

    fn get_client() -> Result<&'static reqwest::Client, AppError> {
        use std::sync::LazyLock;
        static CLIENT: LazyLock<Result<reqwest::Client, AppError>> = LazyLock::new(|| {
            reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .map_err(|e| AppError::Llm(format!("Failed to build HTTP client: {}", e)))
        });
        CLIENT.as_ref().map_err(|e| match e {
            AppError::Llm(msg) => AppError::Llm(msg.clone()),
            other => AppError::Llm(other.to_string()),
        })
    }

    async fn call_llm_api(config: &LlmConfig, prompt: &str) -> Result<String, AppError> {
        if !config.endpoint.starts_with("https://") {
            return Err(AppError::Llm("LLM endpoint must use HTTPS to protect your API key".to_string()));
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
                    AppError::Llm("LLM API request timed out after 120s".to_string())
                } else if e.is_connect() {
                    AppError::Llm(format!("Cannot connect to LLM endpoint: {}", e))
                } else {
                    AppError::Llm(format!("LLM API request failed: {}", e))
                }
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Llm(format!("LLM API error ({}): {}", status, body)));
        }

        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| AppError::Llm(format!("Failed to parse LLM response: {}", e)))?;

        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| AppError::Llm("No content in LLM response".to_string()))?;

        Ok(content.to_string())
    }
}

use std::path::Path;

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct ProjectScript {
    pub name: String,
    pub command: String,
}

fn detect_pm(lockfile_names: &[&str]) -> &'static str {
    if lockfile_names.contains(&"yarn.lock") {
        "yarn"
    } else if lockfile_names.contains(&"pnpm-lock.yaml") {
        "pnpm"
    } else if lockfile_names.contains(&"bun.lockb") || lockfile_names.contains(&"bun.lock") {
        "bun"
    } else {
        "npm"
    }
}

fn parse_scripts(json: &str, pm: &str) -> Vec<ProjectScript> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return Vec::new();
    };
    let Some(scripts) = value.get("scripts").and_then(|s| s.as_object()) else {
        return Vec::new();
    };
    scripts
        .iter()
        .filter(|(_, cmd)| cmd.is_string())
        .map(|(name, _)| ProjectScript {
            name: name.clone(),
            command: format!("{} run {}", pm, name),
        })
        .collect()
}

#[tauri::command]
pub async fn list_project_scripts(path: String) -> Result<Vec<ProjectScript>, crate::AppError> {
    let dir = Path::new(&path).to_path_buf();
    tokio::task::spawn_blocking(move || {
        let pkg_path = dir.join("package.json");
        let Ok(json) = std::fs::read_to_string(&pkg_path) else {
            return Vec::new();
        };
        let lockfile_names: Vec<&str> = ["yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock"]
            .iter()
            .copied()
            .filter(|name| dir.join(name).exists())
            .collect();
        let pm = detect_pm(&lockfile_names);
        parse_scripts(&json, pm)
    })
    .await
    .map_err(|e| crate::AppError::Other(format!("failed to list project scripts: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_pm_prefers_yarn_then_pnpm_then_bun() {
        assert_eq!(detect_pm(&["yarn.lock", "pnpm-lock.yaml"]), "yarn");
        assert_eq!(detect_pm(&["pnpm-lock.yaml", "bun.lockb"]), "pnpm");
        assert_eq!(detect_pm(&["bun.lockb"]), "bun");
        assert_eq!(detect_pm(&["bun.lock"]), "bun");
        assert_eq!(detect_pm(&[]), "npm");
    }

    #[test]
    fn parse_scripts_builds_run_commands() {
        let scripts = parse_scripts(
            r#"{"scripts": {"build": "tsc", "serve:watch": "vite"}}"#,
            "yarn",
        );
        assert_eq!(scripts.len(), 2);
        assert_eq!(scripts[0].name, "build");
        assert_eq!(scripts[0].command, "yarn run build");
        assert_eq!(scripts[1].name, "serve:watch");
        assert_eq!(scripts[1].command, "yarn run serve:watch");
    }

    #[test]
    fn parse_scripts_tolerates_missing_or_invalid_shapes() {
        assert!(parse_scripts("not json", "npm").is_empty());
        assert!(parse_scripts(r#"{"name": "x"}"#, "npm").is_empty());
        assert!(parse_scripts(r#"{"scripts": null}"#, "npm").is_empty());
        assert!(parse_scripts(r#"{"scripts": {"a": 1}}"#, "npm").is_empty());
    }
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    #[default]
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ViewMode {
    #[default]
    Card,
    List,
    Compact,
    Table,
    Dashboard,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_endpoint")]
    pub endpoint: String,
    #[serde(default = "default_model")]
    pub model: String,
    /// The reviewer instructions, i.e. everything before the diff. An empty
    /// string means "use the built-in prompt", so a file written before this
    /// field existed never sends an empty instruction.
    #[serde(default)]
    pub review_prompt: String,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default)]
    pub key_in_keychain: bool,
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            api_key: String::new(),
            endpoint: default_endpoint(),
            model: default_model(),
            review_prompt: String::new(),
            temperature: default_temperature(),
            max_tokens: default_max_tokens(),
            key_in_keychain: false,
        }
    }
}

/// One-time upgrade of the stored review prompt, applied when the settings
/// file is loaded (never on a settings write).
///
/// Before the prompt was editable it was a hard-coded string in the service;
/// files written then have no `review_prompt` at all and deserialize to the
/// empty "use the built-in prompt" marker, which needs no migration. The
/// legacy case is a copy of that built-in prompt that an early save wrote into
/// the file: keeping it verbatim would freeze the old default forever, so it
/// is cleared and the current built-in prompt takes over again.
///
/// A prompt the user actually edited is left untouched. This only runs on
/// load: `update_settings_partial` round-trips the whole settings struct
/// through serde, so doing it in a deserializer would also rewrite a prompt on
/// every save.
pub fn migrate_legacy_review_prompt(settings: &mut AppSettings) -> bool {
    if settings.llm.review_prompt.trim() == LEGACY_DEFAULT_REVIEW_PROMPT.trim() {
        settings.llm.review_prompt = String::new();
        return true;
    }
    false
}

/// The review prompt that used to be hard-coded in `LlmService::build_review_prompt`
/// (instructions only, without the diff). Kept solely for the migration above;
/// the current built-in prompt lives in `services::llm_service`.
const LEGACY_DEFAULT_REVIEW_PROMPT: &str = r#"You are an expert code reviewer. Analyze the following git diff and provide a code review in clean, readable Markdown.

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
- Keep descriptions concise and actionable"#;

fn default_endpoint() -> String {
    "https://api.openai.com/v1/chat/completions".to_string()
}

fn default_model() -> String {
    "gpt-4o-mini".to_string()
}

fn default_temperature() -> f32 {
    0.3
}

fn default_max_tokens() -> u32 {
    4096
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TraySettings {
    #[serde(default = "default_true")]
    pub git_actions: bool,
    #[serde(default = "default_true")]
    pub recent_projects: bool,
    #[serde(default = "default_true")]
    pub quick_launch: bool,
    #[serde(default = "default_recent_limit")]
    pub recent_limit: u32,
    /// Pinned run entries: `preset:<id>` or `saved:<id>`.
    #[serde(default)]
    pub pinned_commands: Vec<String>,
    #[serde(default = "default_true")]
    pub notifications: bool,
}

impl Default for TraySettings {
    fn default() -> Self {
        Self {
            git_actions: true,
            recent_projects: true,
            quick_launch: true,
            recent_limit: default_recent_limit(),
            pinned_commands: Vec::new(),
            notifications: true,
        }
    }
}

fn default_recent_limit() -> u32 {
    5
}

/// The raw interface-language preference stored in `settings.json`: one of the
/// codes in `locales/*.json`, or `"system"` to follow the operating system.
fn default_language() -> String {
    "system".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub theme: Theme,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_true")]
    pub auto_refresh: bool,
    #[serde(default = "default_refresh_interval")]
    pub refresh_interval_secs: u32,
    #[serde(default)]
    pub view_mode: ViewMode,
    #[serde(default)]
    pub llm: LlmConfig,
    #[serde(default = "default_true")]
    pub auto_fetch_on_launch: bool,
    /// Global hotkey that summons the standalone terminal window.
    #[serde(default = "default_terminal_hotkey")]
    pub terminal_hotkey: String,
    /// In-app shortcut: add project.
    #[serde(default = "default_in_app_add_project")]
    pub in_app_add_project: String,
    /// In-app shortcut: refresh all.
    #[serde(default = "default_in_app_refresh_all")]
    pub in_app_refresh_all: String,
    /// In-app shortcut: focus search.
    #[serde(default = "default_in_app_focus_search")]
    pub in_app_focus_search: String,
    /// In-app shortcut: export/import.
    #[serde(default = "default_in_app_export_import")]
    pub in_app_export_import: String,
    /// In-app shortcut: toggle sidebar.
    #[serde(default = "default_in_app_toggle_sidebar")]
    pub in_app_toggle_sidebar: String,
    /// In-app shortcut: command palette.
    #[serde(default = "default_in_app_command_palette")]
    pub in_app_command_palette: String,
    /// In-app shortcut: shortcuts help.
    #[serde(default = "default_in_app_shortcuts_help")]
    pub in_app_shortcuts_help: String,
    /// In-app shortcut: quick diff.
    #[serde(default = "default_in_app_quick_diff")]
    pub in_app_quick_diff: String,
    /// In-app shortcut: navigate down.
    #[serde(default = "default_in_app_navigate_down")]
    pub in_app_navigate_down: String,
    /// In-app shortcut: navigate up.
    #[serde(default = "default_in_app_navigate_up")]
    pub in_app_navigate_up: String,
    /// In-app shortcut: select focused.
    #[serde(default = "default_in_app_select_focused")]
    pub in_app_select_focused: String,
    /// In-app shortcut: toggle embedded terminal panel.
    ///
    /// Plain deserialization on purpose: the legacy Control+~ migration is a
    /// one-time load-time step (see `migrate_legacy_toggle_terminal`), not a
    /// deserializer. A deserializer would also rewrite the value on every
    /// `update_settings_partial` round-trip, so recording Control+~ in the
    /// Shortcuts editor could never be saved.
    #[serde(default = "default_in_app_toggle_terminal")]
    pub in_app_toggle_terminal: String,
    /// In-app shortcut: card view.
    #[serde(default = "default_in_app_view_card")]
    pub in_app_view_card: String,
    /// In-app shortcut: list view.
    #[serde(default = "default_in_app_view_list")]
    pub in_app_view_list: String,
    /// In-app shortcut: compact view.
    #[serde(default = "default_in_app_view_compact")]
    pub in_app_view_compact: String,
    /// In-app shortcut: table view.
    #[serde(default = "default_in_app_view_table")]
    pub in_app_view_table: String,
    /// In-app shortcut: dashboard view.
    #[serde(default = "default_in_app_view_dashboard")]
    pub in_app_view_dashboard: String,
    /// In-app shortcut: fetch all projects.
    #[serde(default = "default_in_app_fetch_all")]
    pub in_app_fetch_all: String,
    /// In-app shortcut: open settings.
    #[serde(default = "default_in_app_open_settings")]
    pub in_app_open_settings: String,
    /// Terminal shortcut: switch to the previous project group.
    #[serde(default = "default_in_app_terminal_switch_group_prev")]
    pub in_app_terminal_switch_group_prev: String,
    /// Terminal shortcut: switch to the next project group.
    #[serde(default = "default_in_app_terminal_switch_group_next")]
    pub in_app_terminal_switch_group_next: String,
    /// Terminal shortcut: switch to the previous terminal tab.
    #[serde(default = "default_in_app_terminal_switch_tab_prev")]
    pub in_app_terminal_switch_tab_prev: String,
    /// Terminal shortcut: switch to the next terminal tab.
    #[serde(default = "default_in_app_terminal_switch_tab_next")]
    pub in_app_terminal_switch_tab_next: String,
    /// Terminal shortcut: jump to a terminal by index (modifier + any digit).
    #[serde(default = "default_in_app_terminal_jump_index")]
    pub in_app_terminal_jump_index: String,
    /// Terminal shortcut: jump to a terminal in the current project (modifier + any digit).
    #[serde(default = "default_in_app_terminal_jump_project")]
    pub in_app_terminal_jump_project: String,
    /// Terminal shortcut: open the New-project dropdown (new terminal there).
    #[serde(
        default = "default_in_app_terminal_new_tab",
        deserialize_with = "deserialize_new_tab_binding"
    )]
    pub in_app_terminal_new_tab: String,
    /// Terminal shortcut: new terminal tab in the current project.
    #[serde(default = "default_in_app_terminal_new_tab_in_project")]
    pub in_app_terminal_new_tab_in_project: String,
    /// Terminal shortcut: close the current terminal tab.
    #[serde(default = "default_in_app_terminal_close_tab")]
    pub in_app_terminal_close_tab: String,
    /// Terminal shortcut: focus the active terminal's input. Empty = unbound.
    #[serde(default)]
    pub in_app_terminal_focus_input: String,
    /// Terminal shortcut: clear the active terminal's scrollback. Empty = unbound.
    #[serde(default)]
    pub in_app_terminal_clear_screen: String,
    /// Disable bare-key (J/K/Space) project-list navigation entirely.
    #[serde(default)]
    pub disable_bare_key_navigation: bool,
    /// Hide the summoned terminal window as soon as it loses focus.
    #[serde(default)]
    pub terminal_hide_on_blur: bool,
    #[serde(default)]
    pub tray: TraySettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            language: default_language(),
            auto_refresh: true,
            refresh_interval_secs: 30,
            view_mode: ViewMode::Card,
            llm: LlmConfig::default(),
            auto_fetch_on_launch: true,
            terminal_hotkey: default_terminal_hotkey(),
            in_app_add_project: default_in_app_add_project(),
            in_app_refresh_all: default_in_app_refresh_all(),
            in_app_focus_search: default_in_app_focus_search(),
            in_app_export_import: default_in_app_export_import(),
            in_app_toggle_sidebar: default_in_app_toggle_sidebar(),
            in_app_command_palette: default_in_app_command_palette(),
            in_app_shortcuts_help: default_in_app_shortcuts_help(),
            in_app_quick_diff: default_in_app_quick_diff(),
            in_app_navigate_down: default_in_app_navigate_down(),
            in_app_navigate_up: default_in_app_navigate_up(),
            in_app_select_focused: default_in_app_select_focused(),
            in_app_toggle_terminal: default_in_app_toggle_terminal(),
            in_app_view_card: default_in_app_view_card(),
            in_app_view_list: default_in_app_view_list(),
            in_app_view_compact: default_in_app_view_compact(),
            in_app_view_table: default_in_app_view_table(),
            in_app_view_dashboard: default_in_app_view_dashboard(),
            in_app_fetch_all: default_in_app_fetch_all(),
            in_app_open_settings: default_in_app_open_settings(),
            in_app_terminal_switch_group_prev: default_in_app_terminal_switch_group_prev(),
            in_app_terminal_switch_group_next: default_in_app_terminal_switch_group_next(),
            in_app_terminal_switch_tab_prev: default_in_app_terminal_switch_tab_prev(),
            in_app_terminal_switch_tab_next: default_in_app_terminal_switch_tab_next(),
            in_app_terminal_jump_index: default_in_app_terminal_jump_index(),
            in_app_terminal_jump_project: default_in_app_terminal_jump_project(),
            in_app_terminal_new_tab: default_in_app_terminal_new_tab(),
            in_app_terminal_new_tab_in_project: default_in_app_terminal_new_tab_in_project(),
            in_app_terminal_close_tab: default_in_app_terminal_close_tab(),
            in_app_terminal_focus_input: String::new(),
            in_app_terminal_clear_screen: String::new(),
            disable_bare_key_navigation: false,
            terminal_hide_on_blur: false,
            tray: TraySettings::default(),
        }
    }
}

pub fn default_terminal_hotkey() -> String {
    "CmdOrCtrl+Shift+`".to_string()
}

pub fn default_in_app_add_project() -> String {
    "CmdOrCtrl+N".to_string()
}

pub fn default_in_app_refresh_all() -> String {
    "CmdOrCtrl+R".to_string()
}

pub fn default_in_app_focus_search() -> String {
    "CmdOrCtrl+F".to_string()
}

pub fn default_in_app_export_import() -> String {
    "CmdOrCtrl+E".to_string()
}

pub fn default_in_app_toggle_sidebar() -> String {
    "CmdOrCtrl+B".to_string()
}

pub fn default_in_app_command_palette() -> String {
    "CmdOrCtrl+K".to_string()
}

pub fn default_in_app_shortcuts_help() -> String {
    "CmdOrCtrl+/".to_string()
}

pub fn default_in_app_quick_diff() -> String {
    "CmdOrCtrl+D".to_string()
}

pub fn default_in_app_navigate_down() -> String {
    "J".to_string()
}

pub fn default_in_app_navigate_up() -> String {
    "K".to_string()
}

pub fn default_in_app_select_focused() -> String {
    "Enter".to_string()
}

pub fn default_in_app_toggle_terminal() -> String {
    "CmdOrCtrl+`".to_string()
}

/// One-time upgrade of the stored in-app terminal toggle, applied when the
/// settings file is loaded (never on a settings write).
///
/// Control+~ was the old default, so leaving a stored copy verbatim keeps
/// overriding the new CmdOrCtrl+` default (macOS showed ⌃~ and clashed with
/// the global Cmd+Shift+`). The two cases are indistinguishable in an old
/// file, so a value saved before this attribute existed is migrated.
///
/// It must only run on load: `update_settings_partial` round-trips the whole
/// settings struct through serde, so a deserializer-level migration would
/// rewrite the value on every save and silently discard a Control+~ the user
/// just recorded in the Shortcuts editor.
pub fn migrate_legacy_toggle_terminal(settings: &mut AppSettings) -> bool {
    if !legacy_toggle_terminal_form(&settings.in_app_toggle_terminal) {
        return false;
    }
    settings.in_app_toggle_terminal = default_in_app_toggle_terminal();
    true
}

/// True for every spelling the old default could be stored as: the frontend
/// recorder canonicalised it to "Control+~", but a hand-edited or imported
/// file may carry a modifier alias or the backquote spelling instead.
fn legacy_toggle_terminal_form(stored: &str) -> bool {
    let parts: Vec<String> = stored
        .split('+')
        .map(|p| p.trim().to_ascii_lowercase())
        .filter(|p| !p.is_empty())
        .collect();
    match parts.as_slice() {
        [ctrl, key] => {
            (ctrl == "control" || ctrl == "ctrl")
                && (key == "~" || key == "`" || key == "backquote")
        }
        _ => false,
    }
}

pub fn default_in_app_view_card() -> String {
    "CmdOrCtrl+1".to_string()
}

pub fn default_in_app_view_list() -> String {
    "CmdOrCtrl+2".to_string()
}

pub fn default_in_app_view_compact() -> String {
    "CmdOrCtrl+3".to_string()
}

pub fn default_in_app_view_table() -> String {
    "CmdOrCtrl+4".to_string()
}

pub fn default_in_app_view_dashboard() -> String {
    "CmdOrCtrl+5".to_string()
}

pub fn default_in_app_fetch_all() -> String {
    "CmdOrCtrl+Shift+G".to_string()
}

pub fn default_in_app_open_settings() -> String {
    "CmdOrCtrl+,".to_string()
}

pub fn default_in_app_terminal_switch_group_prev() -> String {
    "CmdOrCtrl+ArrowUp".to_string()
}

pub fn default_in_app_terminal_switch_group_next() -> String {
    "CmdOrCtrl+ArrowDown".to_string()
}

pub fn default_in_app_terminal_switch_tab_prev() -> String {
    "CmdOrCtrl+ArrowLeft".to_string()
}

pub fn default_in_app_terminal_switch_tab_next() -> String {
    "CmdOrCtrl+ArrowRight".to_string()
}

pub fn default_in_app_terminal_jump_index() -> String {
    "Alt+Digit".to_string()
}

pub fn default_in_app_terminal_jump_project() -> String {
    "CmdOrCtrl+Digit".to_string()
}

pub fn default_in_app_terminal_new_tab() -> String {
    "CmdOrCtrl+Shift+N".to_string()
}

/// Upgrades a settings file written before the New-terminal chord split: the
/// legacy dropdown binding (CmdOrCtrl+N) now means "new terminal in the
/// current project", so it must not keep occupying the dropdown's slot — the
/// same chord in both would leave one of them unreachable.
fn deserialize_new_tab_binding<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let stored = String::deserialize(deserializer)?;
    Ok(normalize_legacy_new_tab_binding(stored))
}

fn normalize_legacy_new_tab_binding(stored: String) -> String {
    if stored == "CmdOrCtrl+N" {
        default_in_app_terminal_new_tab()
    } else {
        stored
    }
}

pub fn default_in_app_terminal_new_tab_in_project() -> String {
    "CmdOrCtrl+N".to_string()
}

pub fn default_in_app_terminal_close_tab() -> String {
    "CmdOrCtrl+W".to_string()
}

fn default_true() -> bool {
    true
}

/// A stored credential for one remote of one project (or global when
/// `project_path` is empty). Used to authenticate private-repository network
/// operations without interactive prompts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCredential {
    pub id: String,
    /// Empty string means the credential applies to every project.
    pub project_path: String,
    /// Remote URL, e.g. "https://github.com/acme/web.git".
    pub remote_url: String,
    pub username: String,
    /// Token or password. Stored in the local database this phase; migrate to
    /// the OS keychain later (see .ai/reports/git-credentials.md).
    pub secret: String,
    pub created_at: String,
    pub updated_at: String,
}

fn default_refresh_interval() -> u32 {
    30
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_terminal_fields_deserialize_to_defaults() {
        let settings: AppSettings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(settings.terminal_hotkey, default_terminal_hotkey());
        assert!(!settings.terminal_hide_on_blur);
    }

    #[test]
    fn legacy_new_tab_default_migrates_to_the_new_chords() {
        // Files written before the chords were split store the old
        // CmdOrCtrl+N for the New-project dropdown. Loading it verbatim
        // would leave the new "new terminal in current project" action on
        // the same chord, so the legacy value maps onto the new default.
        let legacy = r#"{"theme":"dark","in_app_terminal_new_tab":"CmdOrCtrl+N"}"#;
        let settings: AppSettings = serde_json::from_str(legacy).unwrap();
        assert_eq!(settings.in_app_terminal_new_tab, "CmdOrCtrl+Shift+N");
        assert_eq!(settings.in_app_terminal_new_tab_in_project, "CmdOrCtrl+N");
        // A customised dropdown binding is left alone.
        let custom = r#"{"theme":"dark","in_app_terminal_new_tab":"CmdOrCtrl+T"}"#;
        let settings: AppSettings = serde_json::from_str(custom).unwrap();
        assert_eq!(settings.in_app_terminal_new_tab, "CmdOrCtrl+T");
        assert_eq!(
            normalize_legacy_new_tab_binding("CmdOrCtrl+N".to_string()),
            "CmdOrCtrl+Shift+N"
        );
    }

    #[test]
    fn legacy_toggle_terminal_default_migrates_to_the_new_chord() {
        // Files written while Control+~ was the default keep it persisted;
        // the load-time migration moves them to the new CmdOrCtrl+` default.
        let migrate = |stored: &str| {
            let mut settings: AppSettings = serde_json::from_str(&format!(
                r#"{{"theme":"dark","in_app_toggle_terminal":"{}"}}"#,
                stored
            ))
            .unwrap();
            assert!(
                migrate_legacy_toggle_terminal(&mut settings),
                "{} should migrate",
                stored
            );
            settings.in_app_toggle_terminal
        };
        assert_eq!(migrate("Control+~"), "CmdOrCtrl+`");
        // The same legacy default in a differently spelled form is still the
        // old default, not a custom chord.
        for spelling in ["Control+~", "Ctrl+~", "Control+`", "ctrl + Backquote"] {
            assert_eq!(
                migrate(spelling),
                "CmdOrCtrl+`",
                "{} should migrate",
                spelling
            );
        }

        // Anything that is not the old default stays exactly as stored.
        for custom in ["Ctrl+Shift+~", "Control+T", "Alt+~", "Alt+T"] {
            let mut settings: AppSettings =
                serde_json::from_str(&format!(r#"{{"in_app_toggle_terminal":"{}"}}"#, custom))
                    .unwrap();
            assert!(
                !migrate_legacy_toggle_terminal(&mut settings),
                "{} must not migrate",
                custom
            );
            assert_eq!(settings.in_app_toggle_terminal, custom);
        }

        let settings: AppSettings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(settings.terminal_hotkey, "CmdOrCtrl+Shift+`");
    }

    /// Regression: recording Control+~ in the Shortcuts editor goes through
    /// `update_settings_partial`, which merges the patch into the current
    /// settings as JSON and deserializes the whole struct again. A
    /// deserializer-level legacy migration used to rewrite the freshly
    /// recorded Control+~ back to the default, so the save appeared to do
    /// nothing.
    #[test]
    fn recording_control_tilde_survives_the_partial_update_roundtrip() {
        let current = AppSettings::default();
        let mut current_json = serde_json::to_value(&current).unwrap();
        current_json.as_object_mut().unwrap().insert(
            "in_app_toggle_terminal".to_string(),
            serde_json::json!("Control+~"),
        );
        let new_settings: AppSettings = serde_json::from_value(current_json).unwrap();
        assert_eq!(new_settings.in_app_toggle_terminal, "Control+~");

        // And it round-trips through the persisted file unchanged.
        let back: AppSettings =
            serde_json::from_str(&serde_json::to_string_pretty(&new_settings).unwrap()).unwrap();
        assert_eq!(back.in_app_toggle_terminal, "Control+~");
    }

    #[test]
    fn missing_in_app_shortcuts_deserialize_to_defaults() {
        let settings: AppSettings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(settings.in_app_add_project, default_in_app_add_project());
        assert_eq!(settings.in_app_refresh_all, default_in_app_refresh_all());
        assert_eq!(settings.in_app_focus_search, default_in_app_focus_search());
        assert_eq!(
            settings.in_app_export_import,
            default_in_app_export_import()
        );
        assert_eq!(
            settings.in_app_toggle_sidebar,
            default_in_app_toggle_sidebar()
        );
        assert_eq!(
            settings.in_app_command_palette,
            default_in_app_command_palette()
        );
        assert_eq!(
            settings.in_app_shortcuts_help,
            default_in_app_shortcuts_help()
        );
        assert_eq!(settings.in_app_quick_diff, default_in_app_quick_diff());
        assert_eq!(
            settings.in_app_navigate_down,
            default_in_app_navigate_down()
        );
        assert_eq!(settings.in_app_navigate_up, default_in_app_navigate_up());
        assert_eq!(
            settings.in_app_select_focused,
            default_in_app_select_focused()
        );
        assert_eq!(
            settings.in_app_toggle_terminal,
            default_in_app_toggle_terminal()
        );
        assert_eq!(settings.in_app_view_card, default_in_app_view_card());
        assert_eq!(settings.in_app_fetch_all, default_in_app_fetch_all());
        assert_eq!(
            settings.in_app_open_settings,
            default_in_app_open_settings()
        );
        assert_eq!(
            settings.in_app_terminal_switch_group_prev,
            default_in_app_terminal_switch_group_prev()
        );
        assert_eq!(
            settings.in_app_terminal_jump_index,
            default_in_app_terminal_jump_index()
        );
        assert_eq!(
            settings.in_app_terminal_new_tab,
            default_in_app_terminal_new_tab()
        );
        assert_eq!(
            settings.in_app_terminal_new_tab_in_project,
            default_in_app_terminal_new_tab_in_project()
        );
        assert_eq!(settings.in_app_terminal_focus_input, "");
        assert_eq!(settings.in_app_terminal_clear_screen, "");
        assert!(!settings.disable_bare_key_navigation);
    }

    #[test]
    fn missing_tray_fields_deserialize_to_defaults() {
        let settings: AppSettings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(settings.tray, TraySettings::default());
        assert!(settings.tray.git_actions);
        assert_eq!(settings.tray.recent_limit, 5);
        assert!(settings.tray.pinned_commands.is_empty());
    }

    #[test]
    fn tray_settings_round_trip() {
        let settings = AppSettings {
            tray: TraySettings {
                git_actions: false,
                recent_limit: 3,
                pinned_commands: vec!["preset:p1".to_string(), "saved:c1".to_string()],
                notifications: false,
                ..Default::default()
            },
            ..Default::default()
        };
        let json = serde_json::to_string(&settings).unwrap();
        let back: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.tray, settings.tray);
    }

    #[test]
    fn missing_language_deserializes_to_system() {
        let settings: AppSettings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(settings.language, "system");
        // Old files also keep working after a full round-trip.
        let json = serde_json::to_string(&settings).unwrap();
        let back: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.language, "system");
    }

    #[test]
    fn language_round_trips() {
        let settings = AppSettings {
            language: "zh-CN".to_string(),
            ..Default::default()
        };
        let json = serde_json::to_string(&settings).unwrap();
        let back: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.language, "zh-CN");
    }

    #[test]
    fn missing_llm_review_prompt_means_built_in_prompt() {
        let settings: AppSettings = serde_json::from_str(r#"{"llm":{"model":"gpt-4o"}}"#).unwrap();
        assert_eq!(settings.llm.review_prompt, "");
        assert_eq!(settings.llm.model, "gpt-4o");
    }

    #[test]
    fn legacy_review_prompt_copy_migrates_back_to_the_built_in_prompt() {
        let stored = |prompt: &str| {
            serde_json::from_str::<AppSettings>(
                &serde_json::json!({
                    "llm": { "review_prompt": prompt },
                })
                .to_string(),
            )
            .unwrap()
        };

        // A copy of the old hard-coded prompt (whitespace differences included)
        // is the old default, not a custom prompt.
        for prompt in [
            LEGACY_DEFAULT_REVIEW_PROMPT.to_string(),
            format!("\n{}\n\n", LEGACY_DEFAULT_REVIEW_PROMPT),
            format!("{LEGACY_DEFAULT_REVIEW_PROMPT} "),
        ] {
            let mut settings = stored(&prompt);
            assert!(migrate_legacy_review_prompt(&mut settings));
            assert_eq!(settings.llm.review_prompt, "");
        }

        // An edited prompt, the empty marker and a near-miss stay as stored.
        for custom in [
            "Review only for security issues.",
            "",
            "You are an expert code reviewer.",
        ] {
            let mut settings = stored(custom);
            assert!(
                !migrate_legacy_review_prompt(&mut settings),
                "{custom:?} must not migrate"
            );
            assert_eq!(settings.llm.review_prompt, custom);
        }
    }

    /// Same regression as the terminal chord: a prompt saved through
    /// `update_settings_partial` is round-tripped through serde and must come
    /// back unchanged, including an empty one ("use the built-in prompt").
    #[test]
    fn saved_review_prompt_survives_the_partial_update_roundtrip() {
        for prompt in ["", "Only look for race conditions."] {
            let current = AppSettings::default();
            let mut current_json = serde_json::to_value(&current).unwrap();
            current_json["llm"]["review_prompt"] = serde_json::json!(prompt);
            let new_settings: AppSettings = serde_json::from_value(current_json).unwrap();
            assert_eq!(new_settings.llm.review_prompt, prompt);

            let back: AppSettings =
                serde_json::from_str(&serde_json::to_string_pretty(&new_settings).unwrap())
                    .unwrap();
            assert_eq!(back.llm.review_prompt, prompt);
        }
    }

    #[test]
    fn terminal_hotkey_round_trips() {
        let settings = AppSettings {
            terminal_hotkey: "Alt+Space".to_string(),
            terminal_hide_on_blur: true,
            ..Default::default()
        };
        let json = serde_json::to_string(&settings).unwrap();
        let back: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.terminal_hotkey, "Alt+Space");
        assert!(back.terminal_hide_on_blur);
    }
}

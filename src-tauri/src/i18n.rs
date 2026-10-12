//! Message catalogues for the parts of the app the webview cannot reach: the
//! tray menu, OS notifications and messages built on the Rust side.
//!
//! The JSON files are the *same* `locales/*.json` the frontend imports, so one
//! edit translates both sides and `scripts/check-i18n.mjs` keeps the key sets
//! in step. Keys use the dotted form `namespace.path`.

use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

const EN: &str = include_str!("../../locales/en.json");
const ZH_CN: &str = include_str!("../../locales/zh-CN.json");

/// Languages the Rust side ships; must match `SUPPORTED_LANGUAGES` in
/// `src/lib/i18n.ts` and the files in `locales/`.
pub const SUPPORTED_LANGUAGES: [&str; 2] = ["en", "zh-CN"];

/// The language every translation falls back to when a key is missing.
const DEFAULT_LANGUAGE: &str = "en";

/// Stored preference meaning "whatever the operating system asks for".
const LANGUAGE_SYSTEM: &str = "system";

static CATALOGUES: OnceLock<HashMap<String, Value>> = OnceLock::new();

/// The active language, kept as an index so [`current_language`] can hand back
/// a `'static` reference without holding the mutex across the call.
static CURRENT: Mutex<usize> = Mutex::new(0);

fn catalogues() -> &'static HashMap<String, Value> {
    CATALOGUES.get_or_init(|| {
        let mut map = HashMap::new();
        for (language, json) in [("en", EN), ("zh-CN", ZH_CN)] {
            match serde_json::from_str::<Value>(json) {
                Ok(value) => {
                    map.insert(language.to_string(), value);
                }
                Err(e) => log::error!("failed to parse the {language} catalogue: {e}"),
            }
        }
        map
    })
}

/// Maps a BCP-47-ish tag onto a language we ship. Only the language subtag
/// decides, so `en-GB`, `zh-Hans-CN` and bare `zh` all resolve.
pub fn normalize_locale(tag: &str) -> &'static str {
    let subtag = tag.split(['-', '_']).next().unwrap_or("");
    match subtag.to_ascii_lowercase().as_str() {
        "en" => "en",
        "zh" => "zh-CN",
        _ => DEFAULT_LANGUAGE,
    }
}

/// The operating system locale, resolved onto a language we ship.
pub fn system_language() -> &'static str {
    sys_locale::get_locale()
        .as_deref()
        .map(normalize_locale)
        .unwrap_or(DEFAULT_LANGUAGE)
}

/// Resolves a stored preference; `"system"` (or an empty string) means the
/// operating system.
pub fn normalize_language(preference: &str) -> &'static str {
    if preference.trim() == LANGUAGE_SYSTEM || preference.trim().is_empty() {
        system_language()
    } else {
        normalize_locale(preference)
    }
}

fn current_language() -> &'static str {
    let index = CURRENT.lock().map(|guard| *guard).unwrap_or(0);
    SUPPORTED_LANGUAGES
        .get(index)
        .copied()
        .unwrap_or(DEFAULT_LANGUAGE)
}

/// Sets the language used by [`tl`]. Called at startup and on every settings
/// save; rebuilding the tray menu is the caller's job, since the menu needs the
/// `AppHandle` this function deliberately does not take.
pub fn set_language(preference: &str) -> &'static str {
    let language = normalize_language(preference);
    let index = SUPPORTED_LANGUAGES
        .iter()
        .position(|lang| *lang == language)
        .unwrap_or(0);
    if let Ok(mut guard) = CURRENT.lock() {
        *guard = index;
    }
    language
}

/// Translates `key` for `language` without touching any global state, so unit
/// tests can translate in parallel.
pub fn t(language: &str, key: &str, params: &[(&str, &str)]) -> String {
    let catalogues = catalogues();
    let language = normalize_locale(language);
    let Some(template) = catalogues
        .get(language)
        .or_else(|| catalogues.get(DEFAULT_LANGUAGE))
        .and_then(|catalogue| lookup(catalogue, key))
    else {
        // Never show a key path or a blank to the user.
        log::warn!("missing translation {language}.{key}");
        return key.to_string();
    };
    interpolate(template, params)
}

/// Translates `key` for the language set by [`set_language`].
pub fn tl(key: &str, params: &[(&str, &str)]) -> String {
    t(current_language(), key, params)
}

/// Walks an `a.b.c` key into `catalogue` and returns the leaf string.
fn lookup<'a>(catalogue: &'a Value, key: &str) -> Option<&'a str> {
    let mut node = catalogue;
    for part in key.split('.') {
        node = node.get(part)?;
    }
    node.as_str()
}

/// Replaces `{{name}}` markers. An unmatched name is left exactly as written so
/// a wiring bug shows up as `{{missing}}` instead of silently dropping text.
fn interpolate(template: &str, params: &[(&str, &str)]) -> String {
    if params.is_empty() {
        return template.to_string();
    }
    let mut output = String::with_capacity(template.len() + 16);
    let mut rest = template;
    while let Some(open) = rest.find("{{") {
        output.push_str(&rest[..open]);
        let body = &rest[open + 2..];
        let Some(close) = body.find("}}") else {
            output.push_str(&rest[open..]);
            rest = "";
            break;
        };
        let raw_name = &body[..close];
        match params
            .iter()
            .find(|(name, _)| *name == raw_name.trim())
            .map(|(_, value)| *value)
        {
            Some(value) => output.push_str(value),
            // Keep the whole `{{...}}` marker (including the original
            // whitespace) so a wiring bug stays visible in the UI.
            None => output.push_str(&rest[open..open + 2 + close + 2]),
        }
        rest = &body[close + 2..];
    }
    output.push_str(rest);
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_locale_tags_to_shipped_languages() {
        assert_eq!(normalize_locale("en"), "en");
        assert_eq!(normalize_locale("en-GB"), "en");
        assert_eq!(normalize_locale("EN"), "en");
        assert_eq!(normalize_locale("zh"), "zh-CN");
        assert_eq!(normalize_locale("zh-CN"), "zh-CN");
        assert_eq!(normalize_locale("zh-Hans-CN"), "zh-CN");
        assert_eq!(normalize_locale("zh_TW"), "zh-CN");
        assert_eq!(normalize_locale("de-DE"), "en");
        assert_eq!(normalize_locale(""), "en");
    }

    #[test]
    fn resolves_the_system_preference() {
        assert_eq!(normalize_language("system"), system_language());
        assert_eq!(normalize_language("  system  "), system_language());
        assert_eq!(normalize_language(""), system_language());
        assert_eq!(normalize_language("zh-CN"), "zh-CN");
        assert!(SUPPORTED_LANGUAGES.contains(&system_language()));
    }

    #[test]
    fn translates_each_language() {
        assert_eq!(t("en", "settings.language.title", &[]), "Language");
        assert_eq!(t("zh-CN", "settings.language.title", &[]), "语言");
        // Unknown languages fall back to English.
        assert_eq!(t("de-DE", "settings.language.title", &[]), "Language");
    }

    #[test]
    fn a_real_key_never_comes_back_as_its_own_path() {
        assert_eq!(t("zh-CN", "settings.language.title", &[]), "语言");
        assert_eq!(t("en", "settings.missing.key", &[]), "settings.missing.key");
        assert_eq!(
            t("zh-CN", "settings.missing.key", &[]),
            "settings.missing.key"
        );
    }

    #[test]
    fn interpolates_named_placeholders() {
        let params: &[(&str, &str)] = &[("branch", "main"), ("count", "3")];
        assert_eq!(
            interpolate("Switched to {{branch}}", params),
            "Switched to main"
        );
        assert_eq!(interpolate("{{count}} stashes", params), "3 stashes");
        assert_eq!(interpolate("{{count}} in {{branch}}", params), "3 in main");
        assert_eq!(
            interpolate("Branch {{count}} in {{branch}}", params),
            "Branch 3 in main"
        );
        // Unmatched names survive verbatim.
        assert_eq!(
            interpolate("No such {{missing}} here", params),
            "No such {{missing}} here"
        );
        assert_eq!(interpolate("No placeholders", params), "No placeholders");
        assert_eq!(
            interpolate("Unclosed {{branch", params),
            "Unclosed {{branch"
        );
        assert_eq!(interpolate("Branch", &[]), "Branch");
    }

    /// The only test that mutates the process-wide language. Cargo runs tests on
    /// parallel threads, so keep `set_language`/`tl` to this one and use the
    /// pure `t` everywhere else.
    #[test]
    fn set_language_switches_tl() {
        set_language("en");
        assert_eq!(tl("settings.language.title", &[]), "Language");
        set_language("zh-CN");
        assert_eq!(tl("settings.language.title", &[]), "语言");
        set_language("de-DE");
        assert_eq!(tl("settings.language.title", &[]), "Language");
    }
}

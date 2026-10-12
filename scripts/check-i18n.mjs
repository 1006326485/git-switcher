import { existsSync, readFileSync, readdirSync } from "node:fs";

// Structural checks that are cheaper to run in CI than to review by hand:
//   * every language in src/lib/i18n.ts has a locales/<code>.json and vice versa
//   * every catalogue has exactly the same keys as the English reference
//   * no value is empty, and translations keep the {{placeholders}} of the source
//   * the pre-paint script in index.html knows the storage key and every language
// Translation *quality* is not checked here — review covers that.
const LOCALES_DIR = "locales";
const I18N_SOURCE = "src/lib/i18n.ts";
const HTML_SOURCE = "index.html";
const STORAGE_KEY = "git-switcher-language";
const REFERENCE = "en";

const problems = [];
const fail = (message) => problems.push(message);

/** Flattens a catalogue into `a.b.c` → value so key sets are comparable. */
function flatten(node, prefix = "") {
  const flat = new Map();
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of flatten(value, path)) flat.set(nestedKey, nestedValue);
    } else {
      flat.set(path, value);
    }
  }
  return flat;
}

function placeholders(value) {
  const names = new Set();
  for (const match of String(value).matchAll(/\{\{\s*([A-Za-z0-9_]+)/g)) names.add(match[1]);
  return [...names].sort();
}

if (!existsSync(LOCALES_DIR)) {
  console.error(`i18n check failed: missing ${LOCALES_DIR}/ directory`);
  process.exit(1);
}

const declared = readFileSync(I18N_SOURCE, "utf8").match(/SUPPORTED_LANGUAGES\s*=\s*\[([^\]]*)\]/);
if (!declared) fail(`${I18N_SOURCE}: could not read SUPPORTED_LANGUAGES`);
const declaredLanguages = declared ? [...declared[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];

const fileLanguages = readdirSync(LOCALES_DIR)
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.replace(/\.json$/, ""))
  .sort();

for (const language of declaredLanguages) {
  if (!fileLanguages.includes(language)) fail(`missing catalogue: ${LOCALES_DIR}/${language}.json`);
}
for (const language of fileLanguages) {
  if (!declaredLanguages.includes(language)) {
    fail(`${LOCALES_DIR}/${language}.json is not listed in SUPPORTED_LANGUAGES (${I18N_SOURCE})`);
  }
}

const catalogues = new Map();
for (const language of fileLanguages) {
  const path = `${LOCALES_DIR}/${language}.json`;
  try {
    catalogues.set(language, flatten(JSON.parse(readFileSync(path, "utf8"))));
  } catch (error) {
    fail(`${path}: ${error.message}`);
  }
}

const reference = catalogues.get(REFERENCE);
if (!reference) {
  fail(`missing reference catalogue: ${LOCALES_DIR}/${REFERENCE}.json`);
} else {
  for (const [language, catalogue] of catalogues) {
    if (language === REFERENCE) continue;
    for (const key of reference.keys()) {
      if (!catalogue.has(key)) fail(`${language}.json: missing key "${key}"`);
    }
    for (const key of catalogue.keys()) {
      if (!reference.has(key)) fail(`${language}.json: key "${key}" is not in ${REFERENCE}.json`);
    }
  }

  for (const [language, catalogue] of catalogues) {
    for (const [key, value] of catalogue) {
      if (typeof value !== "string" || value.trim() === "") {
        fail(`${language}.json: "${key}" must be a non-empty string`);
        continue;
      }
      const source = reference.get(key);
      if (typeof source !== "string") continue;
      const expected = placeholders(source);
      const found = placeholders(value);
      if (expected.join(",") !== found.join(",")) {
        fail(
          `${language}.json: "${key}" placeholders are [${found.join(", ")}] but ` +
            `${REFERENCE}.json has [${expected.join(", ")}]`
        );
      }
    }
  }
}

const html = readFileSync(HTML_SOURCE, "utf8");
if (!html.includes(STORAGE_KEY)) {
  fail(`${HTML_SOURCE}: the pre-paint script must read the "${STORAGE_KEY}" key`);
}
for (const language of declaredLanguages) {
  if (!html.includes(`"${language}"`)) {
    fail(`${HTML_SOURCE}: the pre-paint script does not mention the "${language}" language`);
  }
}

if (problems.length > 0) {
  console.error(`i18n check failed with ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(
  `i18n check passed: ${fileLanguages.length} language(s) × ${reference ? reference.size : 0} key(s)`
);

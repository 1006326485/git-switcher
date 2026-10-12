import { describe, expect, it } from "vitest";
import en from "../../locales/en.json";
import zhCN from "../../locales/zh-CN.json";

/**
 * Mirrors `scripts/check-i18n.mjs` so a broken catalogue also fails `npm test`.
 */
function flatten(node: Record<string, unknown>, prefix = ""): Map<string, unknown> {
  const flat = new Map<string, unknown>();
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of flatten(value as Record<string, unknown>, path)) {
        flat.set(nestedKey, nestedValue);
      }
    } else {
      flat.set(path, value);
    }
  }
  return flat;
}

function placeholders(value: unknown): string[] {
  return [...String(value).matchAll(/\{\{\s*([A-Za-z0-9_]+)/g)].map((match) => match[1]).sort();
}

const reference = flatten(en);
const catalogues = { "zh-CN": flatten(zhCN) };

describe("locale catalogues", () => {
  it("has at least one translated string", () => {
    expect(reference.size).toBeGreaterThan(0);
  });

  it.each(Object.entries(catalogues))("%s has exactly the English key set", (_language, catalogue) => {
    expect([...catalogue.keys()].sort()).toEqual([...reference.keys()].sort());
  });

  it.each(Object.entries(catalogues))("%s has no empty strings", (_language, catalogue) => {
    const empty = [...catalogue.entries()]
      .filter(([, value]) => typeof value !== "string" || value.trim() === "")
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it.each(Object.entries(catalogues))("%s keeps the source placeholders", (_language, catalogue) => {
    const mismatched = [...catalogue.entries()]
      .filter(([key, value]) => {
        const source = reference.get(key);
        return typeof source === "string" && placeholders(source).join(",") !== placeholders(value).join(",");
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });
});

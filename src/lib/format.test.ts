import { afterEach, describe, expect, it } from "vitest";
import { applyLanguageChoice } from "./i18n";
import { formatDate, formatDateTime, formatNumber, formatTime, getCollator, getLocale, relativeTime } from "./format";

afterEach(() => {
  applyLanguageChoice("en");
});

describe("getLocale", () => {
  it("follows the interface language, not the operating system", () => {
    expect(getLocale()).toBe("en");
    applyLanguageChoice("zh-CN");
    expect(getLocale()).toBe("zh-CN");
  });
});

describe("relativeTime", () => {
  it("renders in the active language", () => {
    expect(relativeTime(-1, "day")).toBe("yesterday");
    applyLanguageChoice("zh-CN");
    expect(relativeTime(-1, "day")).toBe("昨天");
  });

  it("accepts explicit options", () => {
    expect(relativeTime(-3, "day", { numeric: "always" })).toBe("3 days ago");
  });
});

describe("date and time formatting", () => {
  const newYear = new Date(2021, 0, 1, 9, 30);

  it("uses locale-specific date order", () => {
    const english = formatDate(newYear);
    applyLanguageChoice("zh-CN");
    expect(formatDate(newYear)).not.toBe(english);
  });

  it("formats times and combined date-times", () => {
    expect(formatTime(newYear)).toMatch(/9|09/);
    expect(formatDateTime(newYear)).toContain("2021");
  });

  it("honours explicit options", () => {
    expect(formatDate(newYear, { year: "numeric" })).toBe("2021");
  });
});

describe("numbers and collation", () => {
  it("groups numbers for the active locale", () => {
    expect(formatNumber(1234567.5)).toBe("1,234,567.5");
  });

  it("sorts with a locale-aware collator", () => {
    const collator = getCollator();
    expect(collator.compare("b", "a")).toBeGreaterThan(0);
    expect(collator.compare("a", "A")).toBe(0);
  });
});

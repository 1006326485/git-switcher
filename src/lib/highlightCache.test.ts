import { describe, it, expect, beforeEach } from "vitest";
import {
  getOrComputeHighlight,
  clearHighlightCache,
  highlightCacheSize,
  type HighlightKey,
} from "./highlightCache";

const key: HighlightKey = { content: "const a = 1;", language: "ts", searchQuery: "" };

describe("highlightCache", () => {
  beforeEach(() => {
    clearHighlightCache();
  });

  it("computes once and reuses the cached html for the same key", () => {
    let calls = 0;
    const compute = () => {
      calls++;
      return "<span>hi</span>";
    };
    expect(getOrComputeHighlight(key, compute)).toBe("<span>hi</span>");
    expect(getOrComputeHighlight(key, compute)).toBe("<span>hi</span>");
    expect(calls).toBe(1);
    expect(highlightCacheSize()).toBe(1);
  });

  it("keys entries by content, language, query and current occurrence", () => {
    let calls = 0;
    const compute = () => `v${++calls}`;
    expect(getOrComputeHighlight(key, compute)).toBe("v1");
    expect(getOrComputeHighlight({ ...key, language: "rs" }, compute)).toBe("v2");
    expect(getOrComputeHighlight({ ...key, searchQuery: "a" }, compute)).toBe("v3");
    expect(getOrComputeHighlight({ ...key, currentOccurrence: 0 }, compute)).toBe("v4");
    expect(getOrComputeHighlight({ ...key, currentOccurrence: 1 }, compute)).toBe("v5");
    expect(getOrComputeHighlight(key, compute)).toBe("v1");
    expect(calls).toBe(5);
  });

  it("keeps the cache bounded instead of growing without limit", () => {
    for (let i = 0; i < 6000; i++) {
      getOrComputeHighlight({ ...key, content: `line ${i}` }, () => "html");
    }
    expect(highlightCacheSize()).toBeLessThanOrEqual(5000);
  });
});

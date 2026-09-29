import { describe, it, expect } from "vitest";
import { windowKindFromSearch } from "./windowRoute";

describe("windowKindFromSearch", () => {
  it("routes the terminal window query", () => {
    expect(windowKindFromSearch("?window=terminal")).toBe("terminal");
    expect(windowKindFromSearch("?window=terminal&x=1")).toBe("terminal");
  });

  it("defaults to the main window", () => {
    expect(windowKindFromSearch("")).toBe("main");
    expect(windowKindFromSearch("?window=other")).toBe("main");
    expect(windowKindFromSearch("?foo=bar")).toBe("main");
  });
});

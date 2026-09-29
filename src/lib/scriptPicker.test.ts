import { describe, expect, it } from "vitest";
import { buildPickerItems, filterPickerItems, type PickerItem } from "./scriptPicker";

describe("buildPickerItems", () => {
  it("lists bound saved commands and global saved commands before scripts", () => {
    const items = buildPickerItems(
      [
        { name: "Build", command: "yarn run build", project_path: "/repos/a" },
        { name: "Lint", command: "yarn run lint", project_path: null },
        { name: "Other", command: "yarn run other", project_path: "/repos/b" },
      ],
      [{ name: "serve:watch", command: "yarn run serve:watch" }],
      "/repos/a"
    );
    expect(items.map((i) => i.name)).toEqual(["Build", "Lint", "serve:watch"]);
    expect(items.map((i) => i.kind)).toEqual(["saved", "saved", "script"]);
    expect(items.map((i) => i.isGlobal)).toEqual([false, true, false]);
  });

  it("keeps only global saved commands for unbound projects", () => {
    const items = buildPickerItems(
      [{ name: "Lint", command: "yarn run lint", project_path: undefined }],
      [],
      "/repos/c"
    );
    expect(items).toHaveLength(1);
    expect(items[0].isGlobal).toBe(true);
  });

  it("returns only scripts when no saved commands exist", () => {
    const items = buildPickerItems([], [{ name: "test", command: "npm run test" }], "/repos/a");
    expect(items.map((i) => i.kind)).toEqual(["script"]);
  });
});

describe("filterPickerItems", () => {
  const items: PickerItem[] = [
    { name: "serve:watch", command: "yarn run serve:watch", kind: "script", isGlobal: false },
    { name: "build", command: "yarn run build", kind: "saved", isGlobal: true },
    { name: "test", command: "npm run test", kind: "script", isGlobal: false },
  ];

  it("returns everything for an empty query", () => {
    expect(filterPickerItems(items, "  ")).toEqual(items);
  });

  it("matches name or command, case-insensitively", () => {
    expect(filterPickerItems(items, "BUILD").map((i) => i.name)).toEqual(["build"]);
    expect(filterPickerItems(items, "npm run").map((i) => i.name)).toEqual(["test"]);
    expect(filterPickerItems(items, "watch").map((i) => i.name)).toEqual(["serve:watch"]);
  });

  it("returns empty for a non-matching query", () => {
    expect(filterPickerItems(items, "deploy")).toEqual([]);
  });
});

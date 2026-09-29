import { describe, expect, it } from "vitest";
import { buildRunEntries } from "./runCommands";

describe("buildRunEntries", () => {
  const projects = [
    {
      path: "/repos/a",
      name: "gcf-cod",
      scripts: [{ name: "serve:watch", command: "yarn run serve:watch" }],
    },
    { path: "/repos/b", name: "api", scripts: [{ name: "build", command: "npm run build" }] },
  ];

  it("lists saved commands first with project or Global in description", () => {
    const entries = buildRunEntries(
      [
        { name: "Serve", command: "yarn run serve:watch", project_path: "/repos/a" },
        { name: "Lint", command: "yarn run lint", project_path: null },
      ],
      projects
    );
    expect(entries.map((e) => e.label)).toEqual(["Serve", "Lint", "serve:watch", "build"]);
    expect(entries[0].description).toBe("gcf-cod · yarn run serve:watch");
    expect(entries[1].description).toBe("Global · yarn run lint");
  });

  it("marks global saved commands with a null projectPath", () => {
    const entries = buildRunEntries(
      [
        { name: "Lint", command: "yarn run lint" },
        { name: "Serve", command: "yarn run serve:watch", project_path: "/repos/a" },
      ],
      projects
    );
    expect(entries[0].projectPath).toBeNull();
    expect(entries[1].projectPath).toBe("/repos/a");
  });

  it("creates one entry per project script with project name in description", () => {
    const entries = buildRunEntries([], projects);
    expect(entries).toHaveLength(2);
    expect(entries[0].description).toBe("gcf-cod · yarn run serve:watch");
    expect(entries[1].description).toBe("api · npm run build");
  });

  it("falls back to the path when a saved command references an unregistered project", () => {
    const entries = buildRunEntries(
      [{ name: "X", command: "yarn run x", project_path: "/repos/ghost" }],
      []
    );
    expect(entries[0].description).toBe("/repos/ghost · yarn run x");
    expect(entries[0].projectPath).toBe("/repos/ghost");
  });
});

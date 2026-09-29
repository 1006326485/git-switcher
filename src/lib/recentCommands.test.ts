import { beforeEach, describe, expect, it } from "vitest";
import { getRecentCommand, setRecentCommand } from "./recentCommands";

beforeEach(() => {
  localStorage.clear();
});

describe("recent commands", () => {
  it("returns null when nothing is stored", () => {
    expect(getRecentCommand("/repos/a")).toBeNull();
  });

  it("round-trips an entry per project path", () => {
    setRecentCommand("/repos/a", { name: "serve:watch", command: "yarn run serve:watch" });
    expect(getRecentCommand("/repos/a")).toEqual({
      name: "serve:watch",
      command: "yarn run serve:watch",
    });
    expect(getRecentCommand("/repos/b")).toBeNull();
  });

  it("keeps one entry per path and overwrites on rerun", () => {
    setRecentCommand("/repos/a", { name: "build", command: "yarn run build" });
    setRecentCommand("/repos/a", { name: "serve:watch", command: "yarn run serve:watch" });
    setRecentCommand("/repos/b", { name: "test", command: "npm run test" });
    expect(getRecentCommand("/repos/a")?.name).toBe("serve:watch");
    expect(getRecentCommand("/repos/b")?.command).toBe("npm run test");
  });

  it("survives corrupted storage", () => {
    localStorage.setItem("recent-commands", "{not json");
    expect(getRecentCommand("/repos/a")).toBeNull();
    setRecentCommand("/repos/a", { name: "build", command: "yarn run build" });
    expect(getRecentCommand("/repos/a")?.command).toBe("yarn run build");
  });

  it("rejects entries with a missing command", () => {
    localStorage.setItem("recent-commands", JSON.stringify({ "/repos/a": { name: "x" } }));
    expect(getRecentCommand("/repos/a")).toBeNull();
  });
});

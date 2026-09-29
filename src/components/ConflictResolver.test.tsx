import { describe, expect, it, vi } from "vitest";
import {
  parseConflictSections,
  resolveConflictSections,
  countConflicts,
  type ConflictChoice,
} from "./ConflictResolver";

vi.mock("@tauri-apps/plugin-fs", () => ({ writeTextFile: vi.fn() }));
vi.mock("../lib/tauri", () => ({
  gitListConflicts: vi.fn().mockResolvedValue([]),
  gitResolveConflict: vi.fn().mockResolvedValue(undefined),
  gitAbortMerge: vi.fn().mockResolvedValue(undefined),
  gitStageFile: vi.fn().mockResolvedValue(undefined),
  readTextFile: vi.fn().mockResolvedValue(""),
}));

const CONFLICT_FILE = [
  "line one",
  "<<<<<<< HEAD",
  "ours version",
  "=======",
  "theirs version",
  ">>>>>>> feature",
  "line two",
].join("\n");

describe("parseConflictSections", () => {
  it("splits a conflicted file into text and conflict sections", () => {
    const sections = parseConflictSections(CONFLICT_FILE);
    expect(sections).toHaveLength(3);
    expect(sections[0]).toMatchObject({ kind: "text", lines: ["line one"] });
    expect(sections[1]).toMatchObject({
      kind: "conflict",
      ours: ["ours version"],
      theirs: ["theirs version"],
    });
    expect(sections[2]).toMatchObject({ kind: "text", lines: ["line two"] });
    expect(countConflicts(sections)).toBe(1);
  });

  it("captures the diff3 base block when present", () => {
    const diff3 = [
      "<<<<<<< HEAD",
      "ours",
      "||||||| base",
      "ancestor",
      "=======",
      "theirs",
      ">>>>>>> feature",
    ].join("\n");
    const [section] = parseConflictSections(diff3);
    expect(section).toMatchObject({ kind: "conflict", ours: ["ours"], base: ["ancestor"], theirs: ["theirs"] });
  });

  it("round-trips an unresolved file", () => {
    const sections = parseConflictSections(CONFLICT_FILE);
    const choices: ConflictChoice[] = sections.map(() => "both");
    // "both" keeps both blocks; markers are re-added by the editor, so the
    // marker-free merge output must contain both sides in order.
    expect(resolveConflictSections(sections, choices)).toBe(
      ["line one", "ours version", "theirs version", "line two"].join("\n")
    );
  });
});

describe("resolveConflictSections", () => {
  it("selects ours/theirs per hunk", () => {
    const sections = parseConflictSections(CONFLICT_FILE);
    expect(resolveConflictSections(sections, ["ours"])).toBe(
      ["line one", "ours version", "line two"].join("\n")
    );
    expect(resolveConflictSections(sections, ["theirs"])).toBe(
      ["line one", "theirs version", "line two"].join("\n")
    );
  });
});

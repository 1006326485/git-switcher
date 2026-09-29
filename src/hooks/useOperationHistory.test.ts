import { describe, expect, it } from "vitest";
import { planUndo, undoPlanLabel } from "./useOperationHistory";
import type { DestructiveOpRecord } from "../lib/types";

function record(overrides: Partial<DestructiveOpRecord>): DestructiveOpRecord {
  return {
    id: 1,
    kind: "rebase",
    path: "/repo",
    pre: { head: "abc1234def567890000000000000000000000000", branch: "main" },
    at: 0,
    ...overrides,
  };
}

describe("planUndo", () => {
  it("rolls history rewrites back to the pre-op HEAD via reset --hard", () => {
    expect(planUndo(record({ kind: "rebase" }))).toEqual({
      kind: "reset_hard",
      target: "abc1234def567890000000000000000000000000",
    });
    expect(planUndo(record({ kind: "reset" }))).toEqual({
      kind: "reset_hard",
      target: "abc1234def567890000000000000000000000000",
    });
  });

  it("switches back to the saved branch after a checkout", () => {
    expect(planUndo(record({ kind: "checkout" }))).toEqual({
      kind: "checkout_branch",
      branch: "main",
    });
  });

  it("falls back to manual ReflogView recovery without a usable snapshot", () => {
    expect(planUndo(record({ kind: "merge", pre: { head: null, branch: null } }))).toEqual({
      kind: "manual",
    });
    // Detached HEAD before the op: switching back is not expressible as a branch.
    expect(planUndo(record({ kind: "checkout", pre: { head: "abc", branch: "(HEAD detached)" } }))).toEqual({
      kind: "manual",
    });
  });
});

describe("undoPlanLabel", () => {
  it("describes the concrete recovery step", () => {
    const rec = record({ kind: "rebase" });
    expect(undoPlanLabel(rec, planUndo(rec))).toContain("reset --hard back to abc1234");
    const co = record({ kind: "checkout" });
    expect(undoPlanLabel(co, planUndo(co))).toContain("switch back to main");
  });
});

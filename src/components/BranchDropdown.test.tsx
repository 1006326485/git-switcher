import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BranchInfo } from "../lib/types";
import { BranchDropdown } from "./BranchDropdown";

const branches: BranchInfo[] = [
  { name: "main", is_current: true, is_remote: false, is_merged: true, is_tag: false },
  { name: "origin/main", is_current: false, is_remote: true, is_merged: false, is_tag: false },
  { name: "v1.0.0", is_current: false, is_remote: false, is_merged: false, is_tag: true },
  { name: "release/2024-06", is_current: false, is_remote: false, is_merged: false, is_tag: true },
];

describe("BranchDropdown ref grouping", () => {
  // Regression: tags live in refs/tags and were never listed by the branch
  // picker, so checking out a tag was impossible from the UI.
  it("shows tags in their own group alongside local and remote branches", () => {
    render(
      <BranchDropdown currentBranch="main" branches={branches} onSwitch={vi.fn()} allowCurrent />
    );
    fireEvent.click(screen.getByRole("button", { name: /branch: main/i }));

    expect(screen.getByText("Local")).toBeDefined();
    expect(screen.getByText("Remote")).toBeDefined();
    expect(screen.getByText("Tags")).toBeDefined();
    expect(screen.getByRole("option", { name: /v1\.0\.0/ })).toBeDefined();
    expect(screen.getByRole("option", { name: /release\/2024-06/ })).toBeDefined();
  });

  it("hides the Tags group when a repository has no tags", () => {
    render(
      <BranchDropdown
        currentBranch="main"
        branches={branches.filter((b) => !b.is_tag)}
        onSwitch={vi.fn()}
        allowCurrent
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /branch: main/i }));

    expect(screen.queryByText("Tags")).toBeNull();
    expect(screen.getByRole("option", { name: /origin\/main/ })).toBeDefined();
  });
});

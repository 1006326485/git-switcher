import { render, screen, fireEvent, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("BranchDropdown long branch names", () => {
  // Regression: the compact terminal pill clamps at max-w-40 and the popover
  // keeps the trigger's width (min 280px), so a long branch used to lose its
  // tail — exactly the part that distinguishes similar branches. The width is
  // fixed by design, so the full name must be reachable without widening:
  // a tooltip on the trigger and a wrapping row in the picker.
  const longName = "feature/PS-1234-a-very-long-branch-name-for-authentication";
  const longBranches: BranchInfo[] = [
    { name: "main", is_current: false, is_remote: false, is_merged: false, is_tag: false },
    { name: longName, is_current: true, is_remote: false, is_merged: false, is_tag: false },
  ];

  it.each(["compact", "default"] as const)(
    "keeps the complete name on the %s trigger's tooltip",
    (variant) => {
      render(
        <BranchDropdown
          currentBranch={longName}
          branches={longBranches}
          onSwitch={vi.fn()}
          variant={variant}
        />
      );
      expect(screen.getByRole("button", { name: /branch:/i })).toHaveAttribute(
        "title",
        longName
      );
    }
  );

  it("shows the complete name in the picker, wrapping instead of clipping the tail", () => {
    render(
      <BranchDropdown currentBranch={longName} branches={longBranches} onSwitch={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: /branch:/i }));

    const option = screen.getByRole("option", { name: new RegExp("PS-1234") });
    const label = within(option).getByText(longName);
    expect(label).toHaveAttribute("title", longName);
    // The row must be allowed to wrap: `truncate` would force one nowrap line.
    expect(label.className).toContain("line-clamp-3");
    expect(label.className).not.toContain("truncate");
  });
});

describe("BranchDropdown search highlight", () => {
  beforeEach(() => {
    class ObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView = vi.fn();
  });

  const many: BranchInfo[] = [
    { name: "main", is_current: true, is_remote: false, is_merged: true, is_tag: false },
    { name: "feature/login", is_current: false, is_remote: false, is_merged: false, is_tag: false },
    { name: "feature/logout", is_current: false, is_remote: false, is_merged: false, is_tag: false },
    { name: "origin/login", is_current: false, is_remote: true, is_merged: false, is_tag: false },
  ];

  function highlighted(): string | null {
    const row = screen
      .getAllByRole("option")
      .find((el) => el.className.includes("bg-blue-100"));
    return row?.textContent?.trim() ?? null;
  }

  it("highlights the first branch on open, before any typing", () => {
    render(<BranchDropdown currentBranch="main" branches={many} onSwitch={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /branch: main/i }));
    // "main" is the checked-out branch and cannot be picked by default, so
    // the highlight starts on the first branch that can.
    expect(highlighted()).toContain("feature/login");
  });

  it("puts the highlight back on the first match on every search keystroke", () => {
    render(<BranchDropdown currentBranch="main" branches={many} onSwitch={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /branch: main/i }));
    const search = screen.getByRole("textbox", { name: /search/i });

    fireEvent.change(search, { target: { value: "log" } });
    // Both feature branches match; the FIRST one is highlighted.
    expect(highlighted()).toContain("feature/login");

    // Arrow away, then type again: back to the first match.
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(highlighted()).toContain("feature/logout");
    fireEvent.change(search, { target: { value: "logo" } });
    expect(highlighted()).toContain("feature/logout");
    fireEvent.change(search, { target: { value: "log" } });
    expect(highlighted()).toContain("feature/login");
  });

  it("Enter after a search switches to the first match", () => {
    const onSwitch = vi.fn();
    render(<BranchDropdown currentBranch="main" branches={many} onSwitch={onSwitch} />);
    fireEvent.click(screen.getByRole("button", { name: /branch: main/i }));
    const search = screen.getByRole("textbox", { name: /search/i });
    fireEvent.change(search, { target: { value: "log" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onSwitch).toHaveBeenCalledWith("feature/login");
  });
});

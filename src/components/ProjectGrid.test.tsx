import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectDetail } from "../lib/types";
import { ProjectGrid } from "./ProjectGrid";
import { ProjectProvider, type ProjectActions } from "../context/ProjectContext";
import { CARD_EXPAND_MS } from "./ui/primitives";

// The grid's card-view layout is the unit under test; the card is stubbed so
// its Tauri-dependent internals don't need mocking here. ProjectGrid wraps
// every card in a grid item (the thing that carries the takeover span and the
// CSS order), so the wrapper is what these tests inspect.
vi.mock("./ProjectCard", () => ({
  ProjectCard: ({
    detail,
    gitOpsOpen,
    gitOpsClosing,
    onToggleGitOps,
  }: {
    detail: ProjectDetail;
    gitOpsOpen?: boolean;
    gitOpsClosing?: boolean;
    onToggleGitOps?: () => void;
  }) => (
    <div
      data-testid={`card-${detail.project.id}`}
      data-open={gitOpsOpen ? "1" : "0"}
      data-closing={gitOpsClosing ? "1" : "0"}
    >
      <button aria-label={`toggle-${detail.project.id}`} onClick={onToggleGitOps} />
    </div>
  ),
}));

vi.mock("../lib/tauri", () => ({
  gitGetFiles: vi.fn().mockResolvedValue([]),
  gitStashList: vi.fn().mockResolvedValue([]),
  gitGetStagedDiff: vi.fn().mockResolvedValue(""),
}));

const group = {
  id: "default",
  name: "Default",
  color: null,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
};

function makeProject(id: string): ProjectDetail {
  return {
    project: {
      id,
      name: id,
      path: `/repos/${id}`,
      alias: null,
      sort_order: 0,
      group_id: group.id,
      last_active_at: null,
      last_commit_hash: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    current_branch: "main",
    branches: [],
    status: { modified: 0, staged: 0, untracked: 0, ahead: 0, behind: 0 },
    group,
    stash_count: 0,
  };
}

const projects = [makeProject("a"), makeProject("b"), makeProject("c"), makeProject("d")];

const actions = {
  onSwitchBranch: vi.fn(),
  onRefresh: vi.fn(async () => projects[0]),
  onRemove: vi.fn(),
  onSuccess: vi.fn(),
  onError: vi.fn(),
  onInfo: vi.fn(),
} as unknown as ProjectActions;

/** Sets the viewport the grid reads to pick its column count. */
function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
}

function renderGrid() {
  return render(
    <ProjectProvider value={actions}>
      <ProjectGrid projects={projects} loading={false} viewMode="card" isFiltered={false} />
    </ProjectProvider>
  );
}

/** The grid item wrapping a card: it owns `col-span-full` and `order`. */
function slot(id: string) {
  return screen.getByTestId(`card-${id}`).parentElement as HTMLElement;
}

/**
 * Grid order in effect for a card: its CSS `order` when the layout moved it,
 * otherwise its DOM index (ProjectGrid only writes `order` when it differs).
 */
function orderOf(id: string) {
  const el = slot(id);
  const domIndex = Array.from(el.parentElement!.children).indexOf(el);
  return el.style.order === "" ? domIndex : Number(el.style.order);
}

function expand(id: string) {
  fireEvent.click(screen.getByLabelText(`toggle-${id}`));
}

afterEach(() => {
  vi.useRealTimers();
  setViewportWidth(1024);
  // jsdom has no startViewTransition, so the grid falls back to folding the
  // panel in place. Tests that want the smooth path install their own stub.
  Reflect.deleteProperty(document, "startViewTransition");
});

describe("ProjectGrid card view layout", () => {
  it("keeps grid rows unstretched so an expanding card does not resize its neighbours", () => {
    // Regression: the expanded GitOps content used to render inline inside a
    // card. With the default `align-items: stretch`, CSS Grid grew every card
    // in the same row to the tallest one. `items-start` pins each card to its
    // own content height.
    renderGrid();

    const grid = slot("a").parentElement as HTMLElement;
    expect(grid?.className).toContain("grid");
    expect(grid?.className).toContain("items-start");
  });

  it("expands Git Operations into the trigger card itself — one row, one card, no side row", () => {
    setViewportWidth(1400); // xl: three columns
    renderGrid();

    const grid = slot("a").parentElement!;
    expect(grid.querySelectorAll("[data-testid^='card-']")).toHaveLength(projects.length);

    expand("b");

    // Still exactly one card per project: the panel lives inside the card
    // rather than being appended as a separate full-width row beside it.
    expect(grid.querySelectorAll("[data-testid^='card-']")).toHaveLength(projects.length);
    expect(slot("b").className).toContain("col-span-full");
    // The wrapper holds only the card — no extra child row.
    expect(slot("b").children).toHaveLength(1);
    expect(screen.getByTestId("card-b").dataset.open).toBe("1");
    // Its neighbours keep their own height and are not expanded.
    expect(slot("a").className).not.toContain("col-span-full");
    expect(screen.getByTestId("card-a").dataset.open).toBe("0");
  });

  it("moves the expanded card to its row's start and pushes the row's other cards to the next rows", () => {
    setViewportWidth(1400); // three columns
    renderGrid();

    // b sits at index 1 → row start 0, so it takes the whole first row and
    // a (displaced) slides one slot later while c and d keep their places.
    expand("b");

    expect(orderOf("b")).toBe(0);
    expect(orderOf("a")).toBe(1);
    expect(orderOf("c")).toBe(2);
    expect(orderOf("d")).toBe(3);
    // DOM order is untouched: drag sorting still follows the project list.
    expect(gridCardIds()).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves order untouched when the expansion is already at its row's start", () => {
    setViewportWidth(1400); // three columns
    renderGrid();

    expand("a"); // index 0 → row start 0

    // Nothing moved: no inline order was written at all.
    expect(slot("a").style.order).toBe("");
    expect(orderOf("a")).toBe(0);
    expect(orderOf("b")).toBe(1);
    expect(orderOf("c")).toBe(2);
    expect(orderOf("d")).toBe(3);
  });

  it("slides in from the left for left-half cards and from the right for right-half cards", () => {
    setViewportWidth(1400); // xl: three columns
    renderGrid();

    expand("a"); // column 0 → left
    expect(slot("a").className).toContain("cardExpandInFromLeft");

    expand("c"); // column 2 → right
    expect(slot("c").className).toContain("cardExpandInFromRight");
    expect(slot("a").className).not.toContain("cardExpandInFromLeft");
  });

  it("always resolves to the left in a single-column grid", () => {
    setViewportWidth(600);
    renderGrid();

    expand("b"); // column 0 of 1 → left
    expect(slot("b").className).toContain("cardExpandInFromLeft");
    expect(slot("b").className).not.toContain("cardExpandInFromRight");
  });

  it("keeps the row occupied while the panel folds, then drops the span and the reordering", () => {
    vi.useFakeTimers();
    setViewportWidth(1400);
    renderGrid();

    expand("b");
    expect(slot("b").className).toContain("col-span-full");
    expect(slot("a").style.order).toBe("1");

    expand("b");
    // The card no longer owns the panel (so GitOpsPanel switches to its exit
    // animation) but still holds the row: collapsing it early would cut the
    // body off before it has folded shut.
    expect(screen.getByTestId("card-b").dataset.open).toBe("0");
    expect(screen.getByTestId("card-b").dataset.closing).toBe("1");
    expect(slot("b").className).toContain("col-span-full");
    expect(slot("a").style.order).toBe("1");

    act(() => vi.advanceTimersByTime(CARD_EXPAND_MS));

    expect(screen.getByTestId("card-b").dataset.closing).toBe("0");
    expect(slot("b").className).not.toContain("col-span-full");
    expect(slot("b").style.order).toBe("");
    expect(slot("a").style.order).toBe("");
  });

  it("hands the collapse reflow to a view transition when the browser supports one", () => {
    // Smooth path: the row is released on the very first frame so the browser
    // can interpolate between the two states — the card shrinking back and
    // the displaced sibling sliding home. Nothing holds the layout open.
    const startViewTransition = vi.fn((update: () => void) => {
      update();
      return { finished: Promise.resolve() };
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    });

    setViewportWidth(1400);
    renderGrid();

    expand("b");
    expect(slot("b").className).toContain("col-span-full");
    expect(slot("b").style.viewTransitionName).toBe("gitops-card-b");

    expand("b");

    // The update ran inside the transition, and the reflow landed immediately:
    // no col-span-full, no reordering, no fold cycle left to wait out.
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("card-b").dataset.open).toBe("0");
    expect(screen.getByTestId("card-b").dataset.closing).toBe("0");
    expect(slot("b").className).not.toContain("col-span-full");
    // Names stay put on every card: that stable identity is what lets the
    // browser interpolate each box back to its own slot rather than
    // cross-fading the whole grid.
    expect(slot("b").style.viewTransitionName).toBe("gitops-card-b");
    expect(slot("a").style.viewTransitionName).toBe("gitops-card-a");
    expect(slot("b").style.order).toBe("");
    expect(slot("a").style.order).toBe("");
  });

  it("collapses without a transition wrapper when reduced motion is requested", () => {
    // Reduced motion must not pay for a 320ms tween either: the grid falls
    // back to the plain collapse and the row frees up after the fold.
    vi.useFakeTimers();
    const startViewTransition = vi.fn((update: () => void) => {
      update();
      return { finished: Promise.resolve() };
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    });
    // jsdom ships no matchMedia, so install one reporting reduced motion.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
      })),
    });
    setViewportWidth(1400);
    renderGrid();

    expand("b");
    expand("b");

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(screen.getByTestId("card-b").dataset.closing).toBe("1");

    Reflect.deleteProperty(window, "matchMedia");
    act(() => vi.advanceTimersByTime(CARD_EXPAND_MS));

    expect(slot("b").className).not.toContain("col-span-full");
  });

  it("cancels the pending reflow when the panel is reopened mid-fold", () => {
    vi.useFakeTimers();
    setViewportWidth(1400);
    renderGrid();

    expand("b");
    expand("b");
    act(() => vi.advanceTimersByTime(CARD_EXPAND_MS / 2));
    expand("b");
    act(() => vi.advanceTimersByTime(CARD_EXPAND_MS));

    expect(screen.getByTestId("card-b").dataset.open).toBe("1");
    expect(screen.getByTestId("card-b").dataset.closing).toBe("0");
    expect(slot("b").className).toContain("col-span-full");
    expect(slot("a").style.order).toBe("1");
  });

  it("re-expands another card as the single expanded one", () => {
    setViewportWidth(1400);
    renderGrid();

    expand("b"); // index 1 → row start 0
    expand("c"); // index 2 → row start 0 as well

    // Expanding another card supersedes b's fold instead of letting it run:
    // b is back in its own slot immediately, so only c spans the row.
    expect(screen.getByTestId("card-b").dataset.open).toBe("0");
    expect(screen.getByTestId("card-b").dataset.closing).toBe("0");
    expect(slot("b").className).not.toContain("col-span-full");
    expect(slot("b").style.order).toBe("2");
    expect(screen.getByTestId("card-c").dataset.open).toBe("1");
    expect(slot("c").className).toContain("col-span-full");
    expect(slot("c").style.order).toBe("0");
    expect(slot("a").style.order).toBe("1");
  });
});

/** Logical card ids in DOM order (grid item wrappers stripped). */
function gridCardIds() {
  return Array.from(
    document.querySelectorAll("[data-testid^='card-']")
  ).map((el) => (el.getAttribute("data-testid") ?? "").replace("card-", ""));
}

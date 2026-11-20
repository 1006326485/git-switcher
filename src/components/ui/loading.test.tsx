import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  LoadingBar,
  LoadingState,
  ProgressBar,
  Skeleton,
  Spinner,
  useDelayedFlag,
} from "./loading";
import { SkeletonRow, SkeletonTable } from "./Skeleton";

describe("Spinner", () => {
  it("is decorative by default so a labelled control is not double-announced", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".loading-spin")).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("becomes its own live status when given a label", () => {
    render(<Spinner label="Loading branches" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading branches");
    // The accessible text is the label, never the arc.
    expect(screen.getByRole("status").querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("uses the reduced-motion-safe class instead of Tailwind's animate-spin", () => {
    const { container } = render(<Spinner />);
    // globals.css maps .loading-spin to a fixed 2s rotation under
    // prefers-reduced-motion; .animate-spin was left to the blanket
    // 0.01ms override and could flicker.
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});

describe("LoadingState", () => {
  it("announces the region as busy with a polite status", () => {
    render(<LoadingState label="Loading commit log" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading commit log");
  });

  it("falls back to the shared loading label", () => {
    render(<LoadingState />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });
});

describe("ProgressBar", () => {
  it("exposes determinate progress through progressbar ARIA", () => {
    render(<ProgressBar value={4} max={12} label="Fetching projects" />);
    const bar = screen.getByRole("progressbar", { name: "Fetching projects" });
    expect(bar).toHaveAttribute("aria-valuenow", "4");
    expect(bar).toHaveAttribute("aria-valuemax", "12");
    expect(bar).toHaveAttribute("aria-valuetext", "33%");
  });

  it("clamps out-of-range values", () => {
    render(<ProgressBar value={99} max={10} label="p" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "10");
  });

  it("omits values while indeterminate", () => {
    render(<ProgressBar label="Refreshing" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(bar.querySelector(".loading-indeterminate")).not.toBeNull();
  });
});

describe("LoadingBar", () => {
  it("renders nothing when idle", () => {
    const { container } = render(<LoadingBar active={false} />);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("renders the indeterminate hairline once active", () => {
    render(<LoadingBar active label="Refreshing projects" />);
    expect(screen.getByRole("progressbar", { name: "Refreshing projects" })).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("stays out of the accessibility tree and follows the skeleton token", () => {
    const { container } = render(<Skeleton className="h-4 w-10" />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(bar.className).toContain("bg-[var(--skeleton)]");
    expect(bar.className).toContain("skeleton-shimmer");
  });

  it("does not nest its own pulse inside the row container", () => {
    // Nested animate-pulse used to compound opacity out of phase and pulse
    // the card border along with the bars.
    const { container } = render(<SkeletonRow />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
  });

  it("draws every column the real table has", () => {
    const { container } = render(<SkeletonTable columns={9} />);
    const headerBars = container.firstElementChild?.querySelectorAll(":scope > div")[0];
    // 9 column bars + the trailing actions bar
    expect(headerBars?.querySelectorAll('[aria-hidden="true"]').length).toBe(10);
  });
});

function FlagHarness({ active, delay, minDuration }: { active: boolean; delay?: number; minDuration?: number }) {
  const { visible } = useDelayedFlag(active, { delay, minDuration });
  return <span data-testid="flag">{visible ? "visible" : "hidden"}</span>;
}

describe("useDelayedFlag", () => {
  it("never flashes for work that settles inside the delay", () => {
    vi.useFakeTimers();
    try {
      const { getByTestId, rerender } = render(<FlagHarness active delay={150} minDuration={350} />);
      act(() => {
        vi.advanceTimersByTime(100);
      });
      rerender(<FlagHarness active={false} delay={150} minDuration={350} />);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(getByTestId("flag")).toHaveTextContent("hidden");
    } finally {
      vi.useRealTimers();
    }
  });

  it("raises after the delay and holds for the minimum duration", () => {
    vi.useFakeTimers();
    try {
      const { getByTestId, rerender } = render(<FlagHarness active delay={150} minDuration={350} />);
      act(() => {
        vi.advanceTimersByTime(149);
      });
      expect(getByTestId("flag")).toHaveTextContent("hidden");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(getByTestId("flag")).toHaveTextContent("visible");

      // Activity ends immediately; the flag still has to survive its window.
      rerender(<FlagHarness active={false} delay={150} minDuration={350} />);
      act(() => {
        vi.advanceTimersByTime(340);
      });
      expect(getByTestId("flag")).toHaveTextContent("visible");

      act(() => {
        vi.advanceTimersByTime(20);
      });
      expect(getByTestId("flag")).toHaveTextContent("hidden");
    } finally {
      vi.useRealTimers();
    }
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OperationLogPanel from "./OperationLogPanel";
import * as api from "../lib/tauri";
import type { OperationLogEntry } from "../lib/types";

vi.mock("../lib/tauri", () => ({
  getOperationLog: vi.fn(),
}));

const mockGetOperationLog = vi.mocked(api.getOperationLog);

const entries: OperationLogEntry[] = [
  {
    id: "1",
    operation_type: "fetch",
    project_path: "/a/alpha",
    project_name: "alpha",
    details: null,
    status: "success",
    error_message: null,
    created_at: new Date().toISOString(),
  },
  {
    id: "2",
    operation_type: "pull",
    project_path: "/a/gamma",
    project_name: "gamma",
    details: null,
    status: "success",
    error_message: null,
    created_at: new Date().toISOString(),
  },
  {
    id: "3",
    operation_type: "push",
    project_path: "/a/beta",
    project_name: "beta",
    details: null,
    status: "success",
    error_message: null,
    created_at: new Date().toISOString(),
  },
];

let resizeObservers: ResizeObserverStub[] = [];

class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(_callback: ResizeObserverCallback) {
    resizeObservers.push(this);
  }
}

/** jsdom has no layout, so the strip's overflow metrics are stubbed. */
function mockStripWidths(scrollWidth: number, clientWidth: number) {
  const strip = screen.getByTestId("op-log-chips");
  Object.defineProperty(strip, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(strip, "clientWidth", { configurable: true, value: clientWidth });
  strip.scrollBy = vi.fn();
  return strip;
}

beforeEach(() => {
  vi.clearAllMocks();
  resizeObservers = [];
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  mockGetOperationLog.mockResolvedValue(entries);
});

describe("OperationLogPanel filter chips", () => {
  it("renders one chip per distinct operation type and filters the list", async () => {
    render(<OperationLogPanel open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText("All (3)")).toBeInTheDocument());
    expect(screen.getByText(/Fetch \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Pull \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Push \(1\)/)).toBeInTheDocument();

    // All three projects are listed before filtering.
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("gamma")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Fetch \(1\)/));

    // The list narrows to fetch-only entries; chips stay derived from the
    // full history so the other filters remain reachable.
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("gamma")).not.toBeInTheDocument();
    expect(screen.queryByText("beta")).not.toBeInTheDocument();
    expect(screen.getByText("All (3)")).toBeInTheDocument();
    expect(screen.getByText(/Push \(1\)/)).toBeInTheDocument();
  });

  it("keeps the filter row as a hidden-scrollbar strip", async () => {
    render(<OperationLogPanel open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("All (3)")).toBeInTheDocument());

    // No scrollbar chrome may be drawn for the strip; the arrow buttons and
    // fades are the only affordance.
    expect(screen.getByTestId("op-log-chips")).toHaveClass("no-scrollbar");
  });

  it("keeps the measuring scroller free of width constraints", async () => {
    render(<OperationLogPanel open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("All (3)")).toBeInTheDocument());

    // Regression guard: min-w-max on the same element as overflow-x-auto makes
    // that element grow to its content width, so the browser resolves the
    // overflow against the *parent* instead. The scroller would then never
    // report scrollWidth > clientWidth and the arrows/fades would never appear
    // (verified in Chrome: scroller 559px with scrollWidth === clientWidth).
    // The width constraint belongs to the inner row.
    const scroller = screen.getByTestId("op-log-chips");
    expect(scroller).toHaveClass("overflow-x-auto");
    expect(scroller.className).not.toMatch(/min-w-max|w-max/);
    expect(scroller.firstElementChild?.className).toMatch(/w-max/);
  });

  it("shows no navigation when the chips fit", async () => {
    render(<OperationLogPanel open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("All (3)")).toBeInTheDocument());

    mockStripWidths(200, 400);

    expect(screen.queryByLabelText("Scroll filters left")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Scroll filters right")).not.toBeInTheDocument();
  });

  it("reveals the right arrow at the start and scrolls the strip on click", async () => {
    render(<OperationLogPanel open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("All (3)")).toBeInTheDocument());

    const strip = mockStripWidths(900, 300);
    fireEvent.scroll(strip);

    await waitFor(() =>
      expect(screen.getByLabelText("Scroll filters right")).toBeInTheDocument()
    );
    // At the left edge there is nothing to scroll back to.
    expect(screen.queryByLabelText("Scroll filters left")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Scroll filters right"));
    expect(strip.scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: 225, behavior: "smooth" })
    );
  });

  it("tracks the scrolled position across both edges", async () => {
    render(<OperationLogPanel open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("All (3)")).toBeInTheDocument());

    const strip = mockStripWidths(900, 300);

    strip.scrollLeft = 300;
    fireEvent.scroll(strip);
    await waitFor(() =>
      expect(screen.getByLabelText("Scroll filters left")).toBeInTheDocument()
    );
    expect(screen.getByLabelText("Scroll filters right")).toBeInTheDocument();

    strip.scrollLeft = 600;
    fireEvent.scroll(strip);
    await waitFor(() =>
      expect(screen.queryByLabelText("Scroll filters right")).not.toBeInTheDocument()
    );
    expect(screen.getByLabelText("Scroll filters left")).toBeInTheDocument();
  });

  it("observes the strip for resize and disconnects on unmount", async () => {
    const { unmount } = render(<OperationLogPanel open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("All (3)")).toBeInTheDocument());

    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0].observe).toHaveBeenCalledTimes(1);

    unmount();
    expect(resizeObservers[0].disconnect).toHaveBeenCalledTimes(1);
  });
});

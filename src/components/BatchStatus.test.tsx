import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BatchStatus } from "./BatchStatus";

const EMPTY = { completed: 0, failed: 0, failedProjects: [] };

function renderStatus(props: Partial<Parameters<typeof BatchStatus>[0]> = {}) {
  return render(
    <BatchStatus
      batchLoading="fetch"
      batchProgress={EMPTY}
      batchTotal={12}
      batchStalled={false}
      onDismiss={() => {}}
      {...props}
    />
  );
}

describe("BatchStatus", () => {
  it("renders nothing when no batch is running", () => {
    const { container } = renderStatus({ batchLoading: null });
    expect(container.textContent).toBe("");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the operation and its denominator from the moment it starts", () => {
    // Regression: progress used to exist only inside the dropdown that closes
    // on click, so users saw nothing at all once the batch began.
    renderStatus();
    const pill = screen.getByRole("status");
    expect(pill).toHaveTextContent("Fetch");
    expect(pill).toHaveTextContent("0/12");
  });

  it("ticks as repositories settle", () => {
    renderStatus({ batchProgress: { completed: 5, failed: 2, failedProjects: ["a", "b"] } });
    const pill = screen.getByRole("status");
    expect(pill).toHaveTextContent("5/12");
    expect(pill).toHaveTextContent("2 failed");
  });

  it("falls back to the starting label before the backend reports a total", () => {
    renderStatus({ batchTotal: 0 });
    expect(screen.getByRole("status")).toHaveTextContent("Starting…");
  });

  it("stops spinning and offers a way out when the run is stalled", () => {
    const onDismiss = vi.fn();
    renderStatus({ batchStalled: true, onDismiss });
    const pill = screen.getByRole("status");
    expect(pill.querySelector(".loading-spin")).toBeNull();
    expect(pill).toHaveTextContent("still running…");

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

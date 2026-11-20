import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshStatus } from "./RefreshStatus";

// Timers are exercised elsewhere; here we only care about which state wins.
vi.mock("./ui/loading", async () => {
  const actual = await vi.importActual<typeof import("./ui/loading")>("./ui/loading");
  return { ...actual, useDelayedFlag: (active: boolean) => ({ visible: active, pending: active }) };
});

function renderStatus(overrides: Partial<Parameters<typeof RefreshStatus>[0]> = {}) {
  return render(
    <RefreshStatus
      isRefreshingAll={false}
      refreshingProjectCount={0}
      autoFetch={null}
      lastRefreshedAt={null}
      {...overrides}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RefreshStatus", () => {
  it("renders nothing when idle with no history", () => {
    const { container } = renderStatus();
    expect(container.textContent).toBe("");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("announces a full-list refresh in one polite live region", () => {
    renderStatus({ isRefreshingAll: true });
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Refreshing…");
  });

  it("counts the projects being re-read individually", () => {
    renderStatus({ refreshingProjectCount: 2 });
    expect(screen.getByRole("status")).toHaveTextContent("Refreshing 2 projects");
  });

  it("shows launch auto-fetch progress with its failure count", () => {
    renderStatus({ autoFetch: { total: 12, done: 3, failed: 1, running: true } });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Fetching 3/12");
    expect(status).toHaveTextContent("1 failed");
  });

  it("prefers the launch sweep over a concurrent refresh", () => {
    renderStatus({
      isRefreshingAll: true,
      autoFetch: { total: 4, done: 1, failed: 0, running: true },
    });
    expect(screen.getByRole("status")).toHaveTextContent("Fetching 1/4");
  });

  it("leaves a quiet updated label once work settles", () => {
    renderStatus({ lastRefreshedAt: Date.now() });
    expect(screen.getByRole("status")).toHaveTextContent("Updated just now");
  });
});

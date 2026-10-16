import { render } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAutoRefresh } from "./useAutoRefresh";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("../lib/tauri", () => ({
  getSettings: vi.fn(() => Promise.resolve({ auto_refresh: false, refresh_interval_secs: 0 })),
}));

vi.mock("../lib/i18n", () => ({
  t: (key: string) => key,
}));

function Harness({ refreshAll }: { refreshAll: () => void }) {
  useAutoRefresh(refreshAll, () => {});
  return null;
}

describe("useAutoRefresh window focus", () => {
  it("refreshes file/branch state when the window regains focus", async () => {
    const refreshAll = vi.fn();
    render(<Harness refreshAll={refreshAll} />);

    fireEvent(window, new Event("focus"));

    expect(refreshAll).toHaveBeenCalledTimes(1);
  });

  it("coalesces rapid focus storms instead of spamming refresh", async () => {
    const refreshAll = vi.fn();
    render(<Harness refreshAll={refreshAll} />);

    fireEvent(window, new Event("focus"));
    fireEvent(window, new Event("focus"));
    fireEvent(window, new Event("focus"));

    expect(refreshAll).toHaveBeenCalledTimes(1);
  });
});

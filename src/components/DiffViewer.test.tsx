import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiffViewer } from "./DiffViewer";

vi.mock("../lib/tauri", () => ({
  getFileDiff: vi.fn().mockResolvedValue(""),
  getFileDiffStats: vi.fn().mockResolvedValue({ additions: 0, deletions: 0 }),
}));

describe("DiffViewer", () => {
  it("mounts its fixed overlay through a portal so transformed ancestors cannot trap it", async () => {
    const { container } = render(<DiffViewer path="/repos/x" filePath="a.ts" onClose={vi.fn()} />);

    await screen.findByText("a.ts");
    // Project cards apply hover translate, becoming the containing block for
    // fixed descendants; the overlay must escape the React tree entirely.
    expect(container.querySelector(".fixed.inset-0")).toBeNull();
    expect(document.body.querySelector(".fixed.inset-0")).not.toBeNull();
  });
});

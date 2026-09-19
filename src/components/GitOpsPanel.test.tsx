import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GitOpsPanel } from "./GitOpsPanel";

vi.mock("../lib/tauri", () => ({
  gitGetFiles: vi.fn().mockResolvedValue([]),
  gitStashList: vi.fn().mockResolvedValue([]),
  gitGetStagedDiff: vi.fn().mockResolvedValue(""),
}));

const noop = async () => {};

describe("GitOpsPanel", () => {
  it("expands inline when its trigger is clicked (self-managed state)", async () => {
    // Git Operations is part of the card and expands in place below its
    // trigger button, without portals or external grid cells.
    render(
      <GitOpsPanel path="/repos/x" onRefresh={noop} onSuccess={noop} onError={noop} onInfo={noop} />
    );

    expect(screen.queryByLabelText("Fetch from remote")).toBeNull();
    fireEvent.click(screen.getByLabelText("Toggle git operations"));
    expect(await screen.findByLabelText("Fetch from remote")).toBeInTheDocument();
  });
});

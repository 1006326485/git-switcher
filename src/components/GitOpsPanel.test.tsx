import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GitOpsPanel } from "./GitOpsPanel";
import { gitPush } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  gitGetFiles: vi.fn().mockResolvedValue([]),
  gitStashList: vi.fn().mockResolvedValue([]),
  gitGetStagedDiff: vi.fn().mockResolvedValue(""),
  gitPush: vi.fn().mockResolvedValue("ok"),
  getOperationPreview: vi.fn().mockResolvedValue({
    policy: {
      operation: "git_push_force",
      risk: "history_rewrite",
      title: "Force push",
      description: "This rewrites the remote branch.",
      confirm_label: "Force push",
      requires_confirmation: true,
      allow_skip_confirmation: false,
    },
    targets: [{ path: "/repos/x", label: "force-with-lease" }],
  }),
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

  it("force-pushes only after the destructive-operation dialog is confirmed", async () => {
    render(
      <GitOpsPanel path="/repos/x" onRefresh={noop} onSuccess={noop} onError={noop} onInfo={noop} />
    );

    fireEvent.click(screen.getByLabelText("Toggle git operations"));
    fireEvent.click(await screen.findByLabelText("Force push to remote"));
    fireEvent.click(await screen.findByRole("button", { name: "Force push" }));

    await waitFor(() => expect(gitPush).toHaveBeenCalledWith("/repos/x", undefined, true));
  });
});

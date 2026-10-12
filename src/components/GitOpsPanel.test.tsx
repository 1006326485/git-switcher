import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitOpsPanel } from "./GitOpsPanel";
import { CARD_EXPAND_MS } from "./ui/primitives";
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
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("keeps the body mounted for one animation cycle so the fold can play", () => {
    // Controlled usage (card view): flipping `open` off must not unmount the
    // body on the same frame — the wrapper lives one cycle longer so the
    // cardExpandOut keyframes have something to animate, then unmounts.
    vi.useFakeTimers();
    const view = render(
      <GitOpsPanel
        path="/repos/x"
        onRefresh={noop}
        onSuccess={noop}
        onError={noop}
        onInfo={noop}
        open
      />
    );

    expect(screen.getByLabelText("Fetch from remote")).toBeInTheDocument();
    expect(view.container.querySelector('[class*="cardExpandOut"]')).toBeNull();

    view.rerender(
      <GitOpsPanel
        path="/repos/x"
        onRefresh={noop}
        onSuccess={noop}
        onError={noop}
        onInfo={noop}
        open={false}
      />
    );

    // Still in the DOM, now folding shut instead of collapsing instantly.
    expect(screen.queryByLabelText("Fetch from remote")).not.toBeNull();
    expect(view.container.querySelector('[class*="cardExpandOut"]')).not.toBeNull();

    act(() => vi.advanceTimersByTime(CARD_EXPAND_MS));

    expect(view.container.querySelector('[class*="cardExpandOut"]')).toBeNull();
    expect(screen.queryByLabelText("Fetch from remote")).toBeNull();
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

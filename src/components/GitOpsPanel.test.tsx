import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitOpsPanel } from "./GitOpsPanel";
import { CARD_EXPAND_MS } from "./ui/primitives";
import { gitGetFiles, gitPush, gitStashList } from "../lib/tauri";

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

  it("reads the panel once per open, even when the parent re-renders with new callback identities", async () => {
    // The app hands this panel a fresh `onError` whenever the shared refresh
    // bookkeeping or the toast list changes — and the refresh fired on open
    // changes exactly that bookkeeping. Keying the open-effect on those
    // identities made a single expand re-read and re-refresh forever, which is
    // what left the row's refresh spinner blinking and loading.
    vi.mocked(gitGetFiles).mockClear();
    vi.mocked(gitStashList).mockClear();
    const onRefresh = vi.fn();
    let renders = 0;

    function Parent() {
      const [, setTick] = useState(0);
      renders += 1;
      // Stable per mount; bumps the parent's own state like a real refresh does.
      const refresh = useCallback(async () => {
        onRefresh();
        setTick((n) => (n < 3 ? n + 1 : n));
      }, []);
      // New identity on every render, like the context value used to be.
      const churningError = (msg: string) => msg;
      return (
        <GitOpsPanel
          path="/repos/x"
          open
          onRefresh={refresh}
          onSuccess={noop}
          onError={churningError}
          onInfo={noop}
        />
      );
    }

    render(<Parent />);

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    // Let the parent's post-refresh re-renders play out before counting.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(renders).toBeGreaterThan(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(gitGetFiles).toHaveBeenCalledTimes(1);
    expect(gitStashList).toHaveBeenCalledTimes(1);
  });
});

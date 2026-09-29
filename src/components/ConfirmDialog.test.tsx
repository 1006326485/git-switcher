import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("requires an explicit confirmation before running a destructive action", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open
        title="Delete branch"
        message="This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("mounts its overlay through a portal so transformed ancestors cannot trap it", () => {
    // Project cards apply hover translate, becoming the containing block for
    // fixed descendants; the dialog must escape the React tree entirely.
    const { container } = render(
      <ConfirmDialog
        open
        title="Delete branch"
        message="This action cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OperationConfirmDialog } from "./OperationConfirmDialog";
import { getOperationPreview } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  getOperationPreview: vi.fn(),
}));

const mockGetOperationPreview = vi.mocked(getOperationPreview);

describe("OperationConfirmDialog", () => {
  it("loads the backend policy and names every affected target before confirmation", async () => {
    mockGetOperationPreview.mockResolvedValue({
      policy: {
        operation: "git_clean",
        risk: "destructive",
        title: "Delete untracked files",
        description: "This permanently deletes the listed untracked files from the repository.",
        confirm_label: "Delete files",
        requires_confirmation: true,
        allow_skip_confirmation: false,
      },
      targets: [{ path: "/repos/web", label: "notes.txt" }],
    });
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <OperationConfirmDialog
        open
        operation="git_clean"
        targets={[{ path: "/repos/web", label: "notes.txt" }]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    expect(await screen.findByText("Affected targets (1)")).toBeInTheDocument();
    expect(screen.getByText("/repos/web — notes.txt")).toBeInTheDocument();
    expect(screen.getByText("Destructive operation")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete files" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });
});

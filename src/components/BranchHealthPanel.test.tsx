import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BranchHealthReport } from "../lib/types";
import { BranchHealthPanel } from "./BranchHealthPanel";
import { ProjectProvider, type ProjectActions } from "../context/ProjectContext";
import { deleteMergedBranches, getOperationPreview } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  deleteMergedBranches: vi.fn(),
  getOperationPreview: vi.fn(),
}));

const report: BranchHealthReport = {
  merged: [{ name: "dev", behind: 0, last_commit_timestamp: 0, is_merged: true, days_stale: 0 }],
  stale: [],
  behind: [],
};

function renderPanel() {
  const onRefresh = vi.fn();
  const refreshProject = vi.fn().mockResolvedValue({} as never);
  const actions: ProjectActions = {
    onSwitchBranch: vi.fn(),
    onRefresh: refreshProject,
    onRemove: vi.fn(),
    onSuccess: vi.fn(),
    onError: vi.fn(),
    onInfo: vi.fn(),
  };
  render(
    <ProjectProvider value={actions}>
      <BranchHealthPanel
        reports={[{ projectName: "api", path: "/repos/api", report }]}
        loading={false}
        error={null}
        onRefresh={onRefresh}
      />
    </ProjectProvider>
  );
  return { onRefresh, refreshProject };
}

beforeEach(() => {
  vi.mocked(getOperationPreview).mockResolvedValue({
    policy: {
      operation: "delete_merged_branches",
      risk: "destructive",
      title: "Confirm operation",
      description: "description",
      confirm_label: "Confirm",
      requires_confirmation: true,
      allow_skip_confirmation: false,
    },
    targets: [{ path: "/repos/api", label: "dev" }],
  });
  vi.mocked(deleteMergedBranches).mockResolvedValue([]);
});

describe("BranchHealthPanel bulk delete", () => {
  it("refreshes the affected projects so branch selectors drop deleted branches", async () => {
    const { onRefresh, refreshProject } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Delete All" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(deleteMergedBranches).toHaveBeenCalledWith("/repos/api", ["dev"])
    );
    await waitFor(() => expect(refreshProject).toHaveBeenCalledWith("/repos/api"));
    expect(onRefresh).toHaveBeenCalled();
  });
});

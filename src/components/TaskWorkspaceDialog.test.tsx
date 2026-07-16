import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskWorkspaceDialog } from "./TaskWorkspaceDialog";
import * as api from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  listTaskWorkspaces: vi.fn(),
  createTaskWorkspace: vi.fn(),
  getTaskWorkspace: vi.fn(),
  archiveTaskWorkspace: vi.fn(),
  addTaskWorkspaceProject: vi.fn(),
  removeTaskWorkspaceProject: vi.fn(),
  updateTaskWorkspaceEntry: vi.fn(),
  preflightTaskWorkspace: vi.fn(),
  executeTaskWorkspacePlan: vi.fn(),
  listTaskWorkspaceOutcomes: vi.fn(),
}));

describe("TaskWorkspaceDialog", () => {
  it("creates a local task with selected registered repositories", async () => {
    vi.mocked(api.listTaskWorkspaces).mockResolvedValue([]);
    vi.mocked(api.createTaskWorkspace).mockResolvedValue({
      workspace: { id: "task-1", name: "PAY-482", description: null, status: "active", created_at: "now", updated_at: "now", last_opened_at: "now" },
      entries: [],
    });

    render(<TaskWorkspaceDialog open projects={[{ project: { id: "web", name: "web", path: "/repos/web", alias: null, sort_order: 0, group_id: "g", last_active_at: null, last_commit_hash: null, created_at: "", updated_at: "", color: undefined, description: undefined, notes: undefined }, current_branch: "main", branches: [], status: { modified: 0, staged: 0, untracked: 0, ahead: 0, behind: 0 }, group: { id: "g", name: "Default", color: null, sort_order: 0, created_at: "" }, stash_count: 0 }]} onClose={vi.fn()} onSuccess={vi.fn()} onError={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Task name (for example PAY-482)"), { target: { value: "PAY-482" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "web" }));
    fireEvent.click(screen.getByRole("button", { name: "Create task workspace" }));

    await waitFor(() => expect(api.createTaskWorkspace).toHaveBeenCalledWith({ name: "PAY-482", description: null, project_ids: ["web"] }));
    expect(await screen.findByText("PAY-482")).toBeInTheDocument();
  });
});

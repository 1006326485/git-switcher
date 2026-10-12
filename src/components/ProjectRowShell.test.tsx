import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectDetail } from "../lib/types";
import { ProjectRowShell } from "./ProjectRowShell";
import { ProjectProvider, type ProjectActions } from "../context/ProjectContext";
// Extra imports for the modal coverage appended below (existing tests untouched).
import { waitFor, within } from "@testing-library/react";
import { assignToGroup, listGroups, setProjectAlias } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  listGroups: vi.fn().mockResolvedValue([]),
  assignToGroup: vi.fn().mockResolvedValue(undefined),
  setProjectAlias: vi.fn().mockResolvedValue(undefined),
  gitGetFiles: vi.fn().mockResolvedValue([]),
  gitGetReflog: vi.fn().mockResolvedValue([]),
  setProjectColor: vi.fn().mockResolvedValue(undefined),
  setProjectDescription: vi.fn().mockResolvedValue(undefined),
  setProjectNotes: vi.fn().mockResolvedValue(undefined),
  openInTerminal: vi.fn().mockResolvedValue(undefined),
  openInFinder: vi.fn().mockResolvedValue(undefined),
  openInVscode: vi.fn().mockResolvedValue(undefined),
  gitListWorktrees: vi.fn().mockResolvedValue([]),
  gitListSubmodules: vi.fn().mockResolvedValue([]),
  gitBisectStatus: vi.fn().mockResolvedValue({}),
}));

const group = {
  id: "default",
  name: "Default",
  color: null,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
};

const detail: ProjectDetail = {
  project: {
    id: "p1",
    name: "demo",
    path: "/repos/demo",
    alias: null,
    sort_order: 0,
    group_id: group.id,
    last_active_at: null,
    last_commit_hash: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  current_branch: "main",
  branches: [],
  status: { modified: 0, staged: 0, untracked: 0, ahead: 0, behind: 0 },
  group,
  stash_count: 0,
};

const actions: ProjectActions = {
  onSwitchBranch: vi.fn(),
  onRefresh: vi.fn(),
  onRemove: vi.fn(),
  onSuccess: vi.fn(),
  onError: vi.fn(),
  onInfo: vi.fn(),
};

function renderRow() {
  return render(
    <ProjectProvider value={actions}>
      <ProjectRowShell detail={detail}>
        {({ onRowContextMenu, onRowKeyDown, actionButtons }) => (
          <div data-testid="row" tabIndex={-1} onContextMenu={onRowContextMenu} onKeyDown={onRowKeyDown}>
            <button data-testid="row-button" type="button">
              Open
            </button>
            {actionButtons}
          </div>
        )}
      </ProjectRowShell>
    </ProjectProvider>
  );
}

describe("ProjectRowShell context menu", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens the project menu when right-clicking the row root", () => {
    renderRow();

    fireEvent.contextMenu(screen.getByTestId("row"), { clientX: 10, clientY: 20 });

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Project Tools/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Open in Finder/ })).toBeInTheDocument();
  });

  it("does not open the menu when right-clicking a button", () => {
    renderRow();

    fireEvent.contextMenu(screen.getByTestId("row-button"), { clientX: 10, clientY: 20 });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens the menu and focuses the row on Shift+F10", () => {
    renderRow();
    const row = screen.getByTestId("row");

    fireEvent.keyDown(row, { key: "F10", shiftKey: true });

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(document.activeElement).toBe(row);
  });

  it("opens the menu on the ContextMenu key", () => {
    renderRow();

    fireEvent.keyDown(screen.getByTestId("row"), { key: "ContextMenu" });

    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("keeps the native menu when the key event starts on an interactive control", () => {
    renderRow();

    fireEvent.keyDown(screen.getByTestId("row-button"), { key: "F10", shiftKey: true });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("confirms removal once through the project action instead of a local dialog", () => {
    renderRow();

    fireEvent.contextMenu(screen.getByTestId("row"), { clientX: 10, clientY: 20 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove Project" }));

    expect(actions.onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

// ── Group picker & alias editor ─────────────────────────────────────────────
// Appended coverage for P2-1/P2-2/P2-3. Every scenario below is asserted from
// the row context menu, the single entry point both modals share.

function openRowContextMenu() {
  fireEvent.contextMenu(screen.getByTestId("row"), { clientX: 10, clientY: 20 });
}

/** Opens the group picker and waits until its group list has rendered. */
async function openGroupPicker() {
  openRowContextMenu();
  fireEvent.click(await screen.findByRole("menuitem", { name: /^Group/ }));
  const dialog = await screen.findByRole("dialog");
  await waitFor(() =>
    expect(within(dialog).getByRole("button", { name: group.name })).toBeInTheDocument()
  );
  // The context menu unmounts on a later tick; a lingering menu would swallow
  // the Escape key before the modal sees it.
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  return dialog;
}

/** Opens the alias editor and waits until its input has rendered. */
async function openAliasEditor() {
  openRowContextMenu();
  fireEvent.click(await screen.findByRole("menuitem", { name: /Edit Alias/ }));
  const dialog = await screen.findByRole("dialog");
  await waitFor(() =>
    expect(within(dialog).getByPlaceholderText("Display name")).toBeInTheDocument()
  );
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  return dialog;
}

describe("ProjectRowShell group picker and alias editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listGroups).mockReset();
    vi.mocked(listGroups).mockResolvedValue([group]);
    vi.mocked(assignToGroup).mockReset();
    vi.mocked(assignToGroup).mockResolvedValue(undefined);
    vi.mocked(setProjectAlias).mockReset();
    vi.mocked(setProjectAlias).mockResolvedValue(undefined);
  });

  it("shows a loading state while the group list is still in flight", async () => {
    let rejectLoad: (reason?: unknown) => void = () => {};
    vi.mocked(listGroups).mockReturnValueOnce(
      new Promise<never>((_resolve, reject) => {
        rejectLoad = reject;
      })
    );

    renderRow();
    openRowContextMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Group/ }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Loading…")).toBeInTheDocument();
    expect(within(dialog).queryByText("No groups yet.")).not.toBeInTheDocument();

    rejectLoad(new Error("list failed"));
    await waitFor(() =>
      expect(within(dialog).getByText("Failed to load groups")).toBeInTheDocument()
    );
    expect(within(dialog).queryByText("No groups yet.")).not.toBeInTheDocument();

    vi.mocked(listGroups).mockResolvedValue([group]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: group.name })).toBeInTheDocument()
    );
  });

  it("keeps the group picker open and reports the error when assigning fails", async () => {
    vi.mocked(assignToGroup).mockRejectedValue(new Error("assign failed"));

    renderRow();
    const dialog = await openGroupPicker();
    fireEvent.click(within(dialog).getByRole("button", { name: group.name }));

    await waitFor(() => expect(actions.onError).toHaveBeenCalledWith("assign failed"));
    // P2-1: the dialog must survive a failed save so the selection is not lost.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: group.name })
    ).toBeInTheDocument();
    expect(actions.onSuccess).not.toHaveBeenCalled();
  });

  it("closes the group picker and reports success only after assigning succeeds", async () => {
    renderRow();
    const dialog = await openGroupPicker();

    fireEvent.click(within(dialog).getByRole("button", { name: group.name }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(assignToGroup).toHaveBeenCalledTimes(1);
    expect(assignToGroup).toHaveBeenCalledWith("p1", "default");
    expect(actions.onSuccess).toHaveBeenCalledTimes(1);
    expect(actions.onError).not.toHaveBeenCalled();
  });

  it("closes the group picker without calling the API on Escape or scrim click", async () => {
    renderRow();

    let dialog = await openGroupPicker();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(assignToGroup).not.toHaveBeenCalled();

    dialog = await openGroupPicker();
    fireEvent.click(dialog.querySelector("div") as HTMLElement);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(assignToGroup).not.toHaveBeenCalled();
  });

  it("keeps the alias editor open and reports the error when saving fails", async () => {
    vi.mocked(setProjectAlias).mockRejectedValue(new Error("save failed"));

    renderRow();
    const dialog = await openAliasEditor();
    fireEvent.change(within(dialog).getByPlaceholderText("Display name"), {
      target: { value: "pretty-name" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(actions.onError).toHaveBeenCalledWith("save failed"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByPlaceholderText("Display name")
    ).toHaveValue("pretty-name");
    expect(actions.onSuccess).not.toHaveBeenCalled();
  });

  it("closes the alias editor and reports success only after saving succeeds", async () => {
    renderRow();
    const dialog = await openAliasEditor();

    fireEvent.change(within(dialog).getByPlaceholderText("Display name"), {
      target: { value: "pretty-name" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(setProjectAlias).toHaveBeenCalledWith("p1", "pretty-name");
    expect(actions.onSuccess).toHaveBeenCalledTimes(1);
    expect(actions.onError).not.toHaveBeenCalled();
  });

  it("closes the alias editor without calling the API on Cancel or scrim click", async () => {
    renderRow();

    let dialog = await openAliasEditor();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(setProjectAlias).not.toHaveBeenCalled();

    dialog = await openAliasEditor();
    fireEvent.click(dialog.querySelector("div") as HTMLElement);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(setProjectAlias).not.toHaveBeenCalled();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectGroupsPanel } from "./ProjectGroupsPanel";
import * as api from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  listGroups: vi.fn(() => Promise.resolve([])),
  createGroup: vi.fn(() => Promise.resolve({})),
  deleteGroup: vi.fn(() => Promise.resolve()),
  updateGroup: vi.fn((g: unknown) => Promise.resolve(g)),
}));

const groups = [
  { id: "g1", name: "Backend", color: "#FF0000", sort_order: 0, created_at: "2024-01-01T00:00:00Z" },
  { id: "g2", name: "Frontend", color: "#00FF00", sort_order: 1, created_at: "2024-01-01T00:00:00Z" },
];

function renderPanel() {
  const onGroupChange = vi.fn();
  const onSuccess = vi.fn();
  const onError = vi.fn();
  render(
    <ProjectGroupsPanel
      activeGroup={null}
      onGroupChange={onGroupChange}
      onSuccess={onSuccess}
      onError={onError}
    />
  );
  return { onGroupChange, onSuccess, onError };
}

function rowOf(name: string): HTMLElement {
  const el = screen.getByText(name).closest("div.group");
  if (!(el instanceof HTMLElement)) throw new Error(`row not found: ${name}`);
  return el;
}

function deleteButtonOf(name: string): HTMLElement {
  const buttons = rowOf(name).querySelectorAll("button");
  const btn = buttons[buttons.length - 1];
  if (!(btn instanceof HTMLElement)) throw new Error(`delete button not found: ${name}`);
  return btn;
}

async function openMenu(name: string) {
  await screen.findByText(name);
  fireEvent.contextMenu(rowOf(name), { button: 2, clientX: 30, clientY: 30 });
  return screen.findByRole("menu");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listGroups).mockResolvedValue(groups);
});

describe("ProjectGroupsPanel group context menu", () => {
  it("opens the menu when a group row is right-clicked", async () => {
    renderPanel();

    const menu = await openMenu("Backend");

    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /rename/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /new group/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /copy name/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /delete group/i })).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("does not open the menu when right-clicking the ✕ delete button", async () => {
    renderPanel();
    await screen.findByText("Backend");

    const notPrevented = fireEvent.contextMenu(deleteButtonOf("Backend"), {
      button: 2,
      clientX: 30,
      clientY: 30,
    });

    expect(notPrevented).toBe(true);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens the existing confirm dialog for Delete Group without calling deleteGroup first", async () => {
    renderPanel();
    await openMenu("Backend");

    fireEvent.click(screen.getByRole("menuitem", { name: /delete group/i }));

    expect(api.deleteGroup).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(api.deleteGroup).not.toHaveBeenCalled();
  });

  it("still switches the active group on left-click without opening the menu", async () => {
    const { onGroupChange } = renderPanel();
    await screen.findByText("Backend");

    fireEvent.click(screen.getByText("Backend"));

    expect(onGroupChange).toHaveBeenCalledWith("g1");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renames a group via updateGroup with the id and new name", async () => {
    renderPanel();
    await openMenu("Backend");

    fireEvent.click(screen.getByRole("menuitem", { name: /rename/i }));

    const input = await screen.findByRole("textbox");
    expect(input).toHaveValue("Backend");
    fireEvent.change(input, { target: { value: "Backend Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(api.updateGroup).toHaveBeenCalledWith(
        expect.objectContaining({ id: "g1", name: "Backend Renamed" })
      )
    );
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  });

  it("opens the menu when right-clicking the group name label", async () => {
    renderPanel();
    await screen.findByText("Backend");

    fireEvent.contextMenu(screen.getByText("Backend"), { button: 2, clientX: 30, clientY: 30 });

    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it("opens the create form from New Group…", async () => {
    renderPanel();
    await openMenu("Backend");

    fireEvent.click(screen.getByRole("menuitem", { name: /new group/i }));

    await waitFor(() =>
      expect(document.querySelector('input[type="color"]')).toBeInTheDocument()
    );
  });
});

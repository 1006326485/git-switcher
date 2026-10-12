import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TagManager } from "./TagManager";
import {
  getOperationPreview,
  gitDeleteTag,
  gitListTags,
  gitPushTag,
} from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  gitListTags: vi.fn(),
  gitCreateTag: vi.fn(),
  gitDeleteTag: vi.fn(),
  gitPushTag: vi.fn(),
  getOperationPreview: vi.fn(),
}));

const tags = [
  {
    name: "v1.0.0",
    oid: "aaa111",
    target_oid: "aaa111",
    tagger: "tester",
    message: "release one",
  },
  {
    name: "v0.9.0",
    oid: "bbb222",
    target_oid: "bbb222",
    tagger: "tester",
    message: "",
  },
];

const writeText = vi.fn().mockResolvedValue(undefined);

function renderManager() {
  const onSuccess = vi.fn();
  const onError = vi.fn();
  render(
    <TagManager
      path="/repos/x"
      open
      onClose={vi.fn()}
      onSuccess={onSuccess}
      onError={onError}
    />
  );
  return { onSuccess, onError };
}

async function openDeleteTab() {
  const tabs = await screen.findAllByRole("tab");
  fireEvent.click(tabs[1]);
}

async function rowButtonFor(name: string): Promise<HTMLElement> {
  const label = await screen.findByText(name);
  return label.closest("button") as HTMLElement;
}

async function openRowMenu(name: string) {
  const row = await rowButtonFor(name);
  fireEvent.contextMenu(row, { button: 2, clientX: 40, clientY: 40 });
  return row;
}

async function panelDeleteButton(): Promise<HTMLElement> {
  const buttons = await screen.findAllByRole("button");
  const btn = buttons.find((b) => (b as HTMLButtonElement).disabled);
  if (!btn) throw new Error("panel delete button not found");
  return btn as HTMLElement;
}

beforeEach(() => {
  vi.mocked(gitListTags).mockResolvedValue(tags);
  vi.mocked(gitPushTag).mockResolvedValue(undefined as never);
  vi.mocked(gitDeleteTag).mockResolvedValue(undefined as never);
  vi.mocked(getOperationPreview).mockImplementation(async (operation: string) => ({
    policy: {
      operation,
      risk: "destructive",
      title: "Confirm operation",
      description: "description",
      confirm_label: "Confirm",
      requires_confirmation: true,
      allow_skip_confirmation: false,
    },
    targets: [{ path: "/repos/x", label: "v1.0.0" }],
  }));
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

describe("TagManager tag row context menu", () => {
  it("opens a context menu with Push tag, Copy name and Delete when a row is right-clicked", async () => {
    renderManager();
    await openDeleteTab();

    await openRowMenu("v1.0.0");

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "Push tag" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Copy name" })
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("still opens while text is selected, because the native menu is suppressed", async () => {
    renderManager();
    await openDeleteTab();
    const selection = vi
      .spyOn(window, "getSelection")
      .mockReturnValue({ toString: () => "selected text" } as Selection);
    try {
      const row = await rowButtonFor("v1.0.0");
      fireEvent.contextMenu(row, { button: 2, clientX: 40, clientY: 40 });
      expect(screen.getByRole("menu")).toBeInTheDocument();
    } finally {
      selection.mockRestore();
    }
  });

  it("pushes the right-clicked tag from the menu", async () => {
    const { onSuccess } = renderManager();
    await openDeleteTab();

    await openRowMenu("v1.0.0");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Push tag" }));

    await waitFor(() =>
      expect(gitPushTag).toHaveBeenCalledWith("/repos/x", "v1.0.0")
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it("copies the tag name to the clipboard from the menu", async () => {
    renderManager();
    await openDeleteTab();

    await openRowMenu("v0.9.0");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy name" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("v0.9.0"));
  });

  it("opens the existing delete confirmation without deleting yet", async () => {
    renderManager();
    await openDeleteTab();

    await openRowMenu("v1.0.0");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

    expect(await screen.findByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(gitDeleteTag).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(gitDeleteTag).toHaveBeenCalledWith("/repos/x", "v1.0.0")
    );
  });

  it("still selects the tag on left-click after a right-click", async () => {
    renderManager();
    await openDeleteTab();

    const row = await openRowMenu("v1.0.0");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    const deleteBtn = await panelDeleteButton();
    expect(deleteBtn).toBeDisabled();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(row);

    await waitFor(() => expect(deleteBtn).not.toBeDisabled());
  });
});

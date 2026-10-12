import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StashInfo } from "../lib/types";
import { StashManager } from "./StashManager";
import { getOperationPreview, gitStashDrop, gitStashList } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  gitStashList: vi.fn(),
  gitStashShow: vi.fn(),
  gitStash: vi.fn(),
  gitStashApply: vi.fn(),
  gitStashPop: vi.fn(),
  gitStashDrop: vi.fn(),
  getOperationPreview: vi.fn(),
}));

const stashes: StashInfo[] = [
  {
    index: 0,
    message: "wip latest",
    oid: "aaa111",
    timestamp: Math.floor(Date.now() / 1000),
    branch: "main",
  },
  {
    index: 1,
    message: "wip older",
    oid: "bbb222",
    timestamp: Math.floor(Date.now() / 1000) - 3600,
    branch: "main",
  },
];

const writeText = vi.fn().mockResolvedValue(undefined);

function renderManager() {
  return render(
    <StashManager
      path="/repos/x"
      open
      onClose={vi.fn()}
      onRefresh={vi.fn(async () => {})}
      onSuccess={vi.fn()}
      onError={vi.fn()}
    />
  );
}

async function rowFor(message: string): Promise<HTMLElement> {
  const cell = await screen.findByText(message);
  return cell.closest("div.flex.items-center.gap-2") as HTMLElement;
}

async function openRowMenu(message: string) {
  const row = await rowFor(message);
  fireEvent.contextMenu(row, { button: 2, clientX: 40, clientY: 40 });
}

beforeEach(() => {
  vi.mocked(gitStashList).mockResolvedValue(stashes);
  vi.mocked(gitStashDrop).mockResolvedValue(undefined as never);
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
    targets: [{ path: "/repos/x", label: "stash@{0}" }],
  }));
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

describe("StashManager stash row context menu", () => {
  it("opens a context menu when a stash row is right-clicked", async () => {
    renderManager();

    await openRowMenu("wip latest");

    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it("offers Show diff when collapsed and Hide diff once the diff is shown", async () => {
    renderManager();

    await openRowMenu("wip latest");
    expect(await screen.findByRole("menuitem", { name: "Show diff" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Show diff" }));
    await openRowMenu("wip latest");

    expect(await screen.findByRole("menuitem", { name: "Hide diff" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Show diff" })).toBeNull();
  });

  it("leaves the native menu when right-clicking the inline Apply/Pop/Drop buttons", async () => {
    renderManager();

    const row = await rowFor("wip latest");
    for (const name of ["Apply", "Pop", "Drop"]) {
      fireEvent.contextMenu(within(row).getByRole("button", { name }), {
        button: 2,
        clientX: 40,
        clientY: 40,
      });
      expect(screen.queryByRole("menu")).toBeNull();
    }
  });

  it("asks for confirmation before dropping and does not drop yet", async () => {
    renderManager();

    await openRowMenu("wip latest");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Drop" }));

    expect(await screen.findByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(gitStashDrop).not.toHaveBeenCalled();
  });

  it("copies the stash message to the clipboard from the menu", async () => {
    renderManager();

    await openRowMenu("wip latest");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy stash message" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("wip latest"));
  });
});

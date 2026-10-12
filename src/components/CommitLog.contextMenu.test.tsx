import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LogEntry } from "../lib/types";
import { CommitLog } from "./CommitLog";
import { getOperationPreview, gitCherryPick, gitLog } from "../lib/tauri";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, i) => ({ index: i, key: i, start: i * 28, size: 28 })),
    getTotalSize: () => opts.count * 28,
    measureElement: () => {},
  }),
}));

vi.mock("../lib/tauri", () => ({
  gitLog: vi.fn(),
  gitCherryPick: vi.fn(),
  gitCherryPickRange: vi.fn(),
  gitAbortCherryPick: vi.fn(),
  gitListConflicts: vi.fn(),
  getOperationPreview: vi.fn(),
}));

const now = Math.floor(Date.now() / 1000);
const entries: LogEntry[] = [
  {
    hash: "abc1234abc",
    short_hash: "abc1234",
    message: "latest commit",
    author: "Ann",
    timestamp: now,
    parents: [],
    refs: [],
    lane: 0,
  },
  {
    hash: "def5678def",
    short_hash: "def5678",
    message: "older commit",
    author: "Bob",
    timestamp: now - 3600,
    parents: [],
    refs: [],
    lane: 0,
  },
];

const writeText = vi.fn().mockResolvedValue(undefined);

function renderLog() {
  return render(<CommitLog path="/repos/x" onSuccess={vi.fn()} onError={vi.fn()} onRefresh={vi.fn()} />);
}

async function rowFor(message: string): Promise<HTMLElement> {
  const cell = await screen.findByText(message);
  return cell.closest("[data-index]") as HTMLElement;
}

async function openRowMenu(message: string) {
  const row = await rowFor(message);
  fireEvent.contextMenu(row, { button: 2, clientX: 40, clientY: 40 });
}

beforeEach(() => {
  vi.mocked(gitLog).mockResolvedValue(entries);
  vi.mocked(gitCherryPick).mockResolvedValue(undefined as never);
  vi.mocked(getOperationPreview).mockImplementation(async (operation: string) => ({
    policy: {
      operation,
      risk: "history_rewrite",
      title: "Confirm operation",
      description: "description",
      confirm_label: "Confirm",
      requires_confirmation: true,
      allow_skip_confirmation: false,
    },
    targets: [{ path: "/repos/x", label: "target" }],
  }));
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

describe("CommitLog commit row context menu", () => {
  it("opens a context menu when a commit row is right-clicked", async () => {
    renderLog();

    await openRowMenu("latest commit");

    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it("offers Select on an unselected row and Deselect once selected", async () => {
    renderLog();

    await openRowMenu("older commit");
    expect(await screen.findByRole("menuitem", { name: "Select this commit" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Select this commit" }));
    await openRowMenu("older commit");
    expect(await screen.findByRole("menuitem", { name: "Deselect this commit" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Select this commit" })).toBeNull();
  });

  it("leaves the native menu when right-clicking the checkbox or an inline button", async () => {
    renderLog();

    const row = await rowFor("latest commit");
    const checkbox = row.querySelector('input[type="checkbox"]') as HTMLElement;
    fireEvent.contextMenu(checkbox, { button: 2, clientX: 40, clientY: 40 });
    expect(screen.queryByRole("menu")).toBeNull();

    const cherryPickButton = row.querySelector('button[title^="Cherry-pick"]') as HTMLElement;
    fireEvent.contextMenu(cherryPickButton, { button: 2, clientX: 40, clientY: 40 });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("asks for confirmation before cherry-picking", async () => {
    renderLog();

    await openRowMenu("latest commit");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Cherry-pick…" }));

    expect(await screen.findByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(gitCherryPick).not.toHaveBeenCalled();
  });

  it("copies the short hash to the clipboard from the menu", async () => {
    renderLog();

    await openRowMenu("latest commit");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy hash" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("abc1234"));
  });
});

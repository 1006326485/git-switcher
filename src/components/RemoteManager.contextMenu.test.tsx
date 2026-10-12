import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteManager } from "./RemoteManager";
import { gitListRemotes, gitRemoveRemote, gitSetRemoteUrl } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  gitListRemotes: vi.fn(),
  gitAddRemote: vi.fn(),
  gitRemoveRemote: vi.fn(),
  gitSetRemoteUrl: vi.fn(),
}));

const remotes = [
  {
    name: "origin",
    url: "https://example.com/origin.git",
    push_url: "https://example.com/push.git",
  },
  {
    name: "upstream",
    url: "https://example.com/upstream.git",
    push_url: null,
  },
];

const writeText = vi.fn().mockResolvedValue(undefined);

function renderManager() {
  const onSuccess = vi.fn();
  const onError = vi.fn();
  render(<RemoteManager path="/repos/x" onSuccess={onSuccess} onError={onError} />);
  return { onSuccess, onError };
}

async function showList() {
  fireEvent.click(await screen.findByRole("button", { name: "Toggle remote list" }));
  await screen.findByText("origin");
}

async function openRowMenu(name: string) {
  const label = await screen.findByText(name);
  fireEvent.contextMenu(label, { button: 2, clientX: 40, clientY: 40 });
  return label;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(gitListRemotes).mockResolvedValue(remotes);
  vi.mocked(gitRemoveRemote).mockResolvedValue(undefined);
  vi.mocked(gitSetRemoteUrl).mockResolvedValue(undefined);
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

describe("RemoteManager remote row context menu", () => {
  it("opens a context menu with Edit URL, Copy URL, Copy name and Remove on right-click", async () => {
    renderManager();
    await showList();

    await openRowMenu("origin");

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Edit URL" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Copy URL" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Copy name" })
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Remove" })).toBeInTheDocument();
  });

  it("copies the right-clicked remote url from the menu", async () => {
    renderManager();
    await showList();

    await openRowMenu("origin");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy URL" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("https://example.com/origin.git")
    );
  });

  it("enters the existing edit state from the menu", async () => {
    renderManager();
    await showList();

    await openRowMenu("upstream");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit URL" }));

    expect(
      await screen.findByDisplayValue("https://example.com/upstream.git")
    ).toBeInTheDocument();
  });

  it("opens the existing remove confirmation without calling the API yet", async () => {
    renderManager();
    await showList();

    await openRowMenu("origin");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));

    expect(
      await screen.findByRole("button", { name: "Remove" })
    ).toBeInTheDocument();
    expect(gitRemoveRemote).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(gitRemoveRemote).toHaveBeenCalledWith("/repos/x", "origin")
    );
  });

  it("still opens the edit state on left-click after a right-click", async () => {
    renderManager();
    await showList();

    await openRowMenu("origin");
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit URL for origin" })
    );

    expect(
      await screen.findByDisplayValue("https://example.com/origin.git")
    ).toBeInTheDocument();
  });
});

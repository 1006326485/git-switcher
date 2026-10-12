import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReflogView } from "./ReflogView";
import { gitCheckoutCommit, gitGetReflog } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  gitGetReflog: vi.fn(),
  gitCheckoutCommit: vi.fn(),
}));

const entries = [
  {
    hash: "aaa111aaa111aaa111aaa111aaa111aaa111aaa1",
    short_hash: "aaa111a",
    message: "checkout: moving from main to feature",
    author: "alice",
    timestamp: Math.floor(Date.now() / 1000) - 120,
  },
  {
    hash: "bbb222bbb222bbb222bbb222bbb222bbb222bbb2",
    short_hash: "bbb222b",
    message: "commit: fix parser",
    author: "bob",
    timestamp: Math.floor(Date.now() / 1000) - 7200,
  },
];

const writeText = vi.fn().mockResolvedValue(undefined);

function renderView() {
  const onRefresh = vi.fn(async () => {});
  const onSuccess = vi.fn();
  const onError = vi.fn();
  render(
    <ReflogView
      path="/repos/x"
      onRefresh={onRefresh}
      onSuccess={onSuccess}
      onError={onError}
    />
  );
  return { onRefresh, onSuccess, onError };
}

async function rowButtonFor(message: string): Promise<HTMLElement> {
  const label = await screen.findByText(message);
  return label.closest("button") as HTMLElement;
}

async function openRowMenu(message: string) {
  const row = await rowButtonFor(message);
  fireEvent.contextMenu(row, { button: 2, clientX: 40, clientY: 40 });
  return row;
}

beforeEach(() => {
  vi.mocked(gitGetReflog).mockResolvedValue(entries);
  vi.mocked(gitCheckoutCommit).mockResolvedValue(undefined as never);
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

describe("ReflogView entry row context menu", () => {
  it("opens a context menu with Checkout commit and copy items when a row is right-clicked", async () => {
    renderView();

    await openRowMenu("checkout: moving from main to feature");

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "Checkout commit" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Copy hash" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Copy full hash" })
    ).toBeInTheDocument();
  });

  it("checks out the right-clicked entry's hash from the menu", async () => {
    renderView();

    await openRowMenu("commit: fix parser");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Checkout commit" })
    );

    await waitFor(() =>
      expect(gitCheckoutCommit).toHaveBeenCalledWith(
        "/repos/x",
        "bbb222bbb222bbb222bbb222bbb222bbb222bbb2"
      )
    );
  });

  it("copies the short hash to the clipboard from the menu", async () => {
    renderView();

    await openRowMenu("checkout: moving from main to feature");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy hash" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("aaa111a"));
  });

  it("copies the full hash to the clipboard from the menu", async () => {
    renderView();

    await openRowMenu("commit: fix parser");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Copy full hash" })
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "bbb222bbb222bbb222bbb222bbb222bbb222bbb2"
      )
    );
  });

  it("still checks out on left-click after a right-click", async () => {
    renderView();

    const row = await openRowMenu("commit: fix parser");
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(row);

    await waitFor(() =>
      expect(gitCheckoutCommit).toHaveBeenCalledWith(
        "/repos/x",
        "bbb222bbb222bbb222bbb222bbb222bbb222bbb2"
      )
    );
  });
});

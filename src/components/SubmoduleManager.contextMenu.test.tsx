import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubmoduleManager } from "./SubmoduleManager";
import { gitListSubmodules, gitUpdateSubmodule } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  gitListSubmodules: vi.fn(),
  gitUpdateSubmodule: vi.fn(),
  gitInitSubmodules: vi.fn(),
}));

const submodules = [
  {
    name: "libs",
    path: "vendor/libs",
    url: "https://example.com/libs.git",
    head: "abc1234",
    active: true,
  },
];

const writeText = vi.fn().mockResolvedValue(undefined);

function renderManager() {
  const onSuccess = vi.fn();
  const onError = vi.fn();
  render(<SubmoduleManager path="/repos/x" onSuccess={onSuccess} onError={onError} />);
  return { onSuccess, onError };
}

async function showList() {
  fireEvent.click(await screen.findByRole("button", { name: "Toggle submodule list" }));
  await screen.findByText("libs");
}

async function openRowMenu(name: string) {
  const label = await screen.findByText(name);
  fireEvent.contextMenu(label, { button: 2, clientX: 40, clientY: 40 });
  return label;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(gitListSubmodules).mockResolvedValue(submodules);
  vi.mocked(gitUpdateSubmodule).mockResolvedValue("ok");
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

describe("SubmoduleManager submodule row context menu", () => {
  it("opens a context menu with Update, Copy name and Copy path on right-click", async () => {
    renderManager();
    await showList();

    await openRowMenu("libs");

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Update" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Copy name" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Copy path" })
    ).toBeInTheDocument();
  });

  it("updates the right-clicked submodule from the menu", async () => {
    renderManager();
    await showList();

    await openRowMenu("libs");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Update" }));

    await waitFor(() =>
      expect(gitUpdateSubmodule).toHaveBeenCalledWith("/repos/x", "libs")
    );
  });

  it("copies the right-clicked submodule name from the menu", async () => {
    renderManager();
    await showList();

    await openRowMenu("libs");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy name" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("libs"));
  });

  it("still triggers the update on left-click after a right-click", async () => {
    renderManager();
    await showList();

    await openRowMenu("libs");
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(
      await screen.findByRole("button", { name: "Update submodule libs" })
    );

    await waitFor(() =>
      expect(gitUpdateSubmodule).toHaveBeenCalledWith("/repos/x", "libs")
    );
  });
});

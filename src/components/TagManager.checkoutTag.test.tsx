import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TagManager } from "./TagManager";
import { getOperationPreview, gitListTags, switchBranch } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  gitListTags: vi.fn(),
  gitCreateTag: vi.fn(),
  gitDeleteTag: vi.fn(),
  gitPushTag: vi.fn(),
  switchBranch: vi.fn(),
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

async function openRowMenu(name: string) {
  const label = await screen.findByText(name);
  const row = label.closest("button") as HTMLElement;
  fireEvent.contextMenu(row, { button: 2, clientX: 40, clientY: 40 });
  return row;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.mocked(gitListTags).mockResolvedValue(tags);
  vi.mocked(switchBranch).mockClear();
  vi.mocked(switchBranch).mockResolvedValue(undefined as never);
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
});

describe("TagManager checkout tag context menu item", () => {
  it("opens the row context menu and offers Checkout tag before the existing items", async () => {
    renderManager();
    await openDeleteTab();

    await openRowMenu("v1.0.0");

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveTextContent("Checkout tag…");
    expect(
      screen.getByRole("menuitem", { name: "Checkout tag…" })
    ).toBeInTheDocument();
  });

  it("checks out the right-clicked tag through switchBranch", async () => {
    const { onSuccess } = renderManager();
    await openDeleteTab();

    await openRowMenu("v1.0.0");
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Checkout tag…" }));

    await waitFor(() =>
      expect(switchBranch).toHaveBeenCalledWith("/repos/x", "v1.0.0")
    );
    expect(onSuccess).toHaveBeenCalledWith(
      "Checked out tag 'v1.0.0' (detached HEAD)"
    );
  });

  it("disables Checkout tag while a checkout is in flight", async () => {
    const pending = deferred<void>();
    vi.mocked(switchBranch).mockReturnValue(pending.promise as never);
    renderManager();
    await openDeleteTab();

    await openRowMenu("v1.0.0");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Checkout tag…" }));

    await waitFor(() => expect(switchBranch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    );

    await openRowMenu("v0.9.0");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Checkout tag…" })
    ).toBeDisabled();

    pending.resolve();

    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: "Checkout tag…" })
      ).not.toBeDisabled()
    );
  });
});

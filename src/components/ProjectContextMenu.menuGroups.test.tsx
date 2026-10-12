import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectContextMenu } from "./ProjectContextMenu";

vi.mock("../lib/tauri", () => ({
  gitGetFiles: vi.fn().mockResolvedValue([]),
  gitGetReflog: vi.fn().mockResolvedValue([]),
  setProjectColor: vi.fn().mockResolvedValue(undefined),
  openInTerminal: vi.fn().mockResolvedValue(undefined),
  openInFinder: vi.fn().mockResolvedValue(undefined),
  openInVscode: vi.fn().mockResolvedValue(undefined),
  gitListWorktrees: vi.fn().mockResolvedValue([]),
  gitListSubmodules: vi.fn().mockResolvedValue([]),
  gitBisectStatus: vi.fn().mockResolvedValue({}),
}));

const noop = () => {};

const anchor = { x: 10, y: 20 };

function renderMenu(overrides: Partial<Parameters<typeof ProjectContextMenu>[0]> = {}) {
  return render(
    <ProjectContextMenu
      projectId="p1"
      path="/repos/x"
      title="demo"
      onSuccess={noop}
      onError={noop}
      contextAnchor={anchor}
      contextOnClose={noop}
      onRunFetch={noop}
      onRunPull={noop}
      onRunPush={noop}
      onOpenStashManager={noop}
      onRemoveProject={vi.fn()}
      {...overrides}
    />
  );
}

function menuNodes() {
  const menu = screen.getByRole("menu");
  return Array.from(
    menu.querySelectorAll('[role="menuitem"], [role="separator"]')
  );
}

function positionOf(label: string) {
  return menuNodes().findIndex(
    (node) => node.getAttribute("role") === "menuitem" &&
      (node.textContent ?? "").startsWith(label)
  );
}

function menuLabels() {
  return menuNodes().map((node) => (node.textContent ?? "").trim());
}

afterEach(cleanup);

describe("ProjectContextMenu row menu groups", () => {
  it("orders items as Git, Open, Appearance, Danger and lists Stash Manager", () => {
    renderMenu();

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Stash Manager/ })).toBeInTheDocument();

    const fetch = positionOf("Fetch");
    const pull = positionOf("Pull");
    const push = positionOf("Push");
    const stash = positionOf("Stash Manager");
    const finder = positionOf("Open in Finder");
    const color = positionOf("Set Color");
    const remove = positionOf("Remove Project");

    expect(fetch).toBeGreaterThanOrEqual(0);
    expect(pull).toBeGreaterThan(fetch);
    expect(push).toBeGreaterThan(pull);
    expect(stash).toBeGreaterThan(push);
    expect(finder).toBeGreaterThan(stash);
    expect(color).toBeGreaterThan(finder);
    expect(remove).toBeGreaterThan(color);
  });

  it("marks Remove Project as the danger item behind a separator", () => {
    renderMenu();

    const nodes = menuNodes();
    const removeIdx = nodes.findIndex(
      (node) => node.getAttribute("role") === "menuitem" &&
        (node.textContent ?? "").startsWith("Remove Project")
    );

    expect(removeIdx).toBeGreaterThan(0);
    expect(nodes[removeIdx - 1].getAttribute("role")).toBe("separator");
    expect(nodes[removeIdx]).toHaveClass("text-red-600");
  });

  it("delegates removal to the App-side confirmation instead of rendering its own", () => {
    const removeProject = vi.fn();
    renderMenu({ onRemoveProject: removeProject });

    fireEvent.click(screen.getByRole("menuitem", { name: "Remove Project" }));

    expect(removeProject).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps separators at group boundaries", () => {
    renderMenu();

    const nodes = menuNodes();
    const lastOpenIdx = positionOf("Open in VS Code");
    const colorIdx = positionOf("Set Color");

    expect(lastOpenIdx).toBeGreaterThan(0);
    expect(nodes[lastOpenIdx + 1].getAttribute("role")).toBe("separator");
    expect(nodes[colorIdx - 1].getAttribute("role")).toBe("separator");
    expect(nodes[0].getAttribute("role")).toBe("menuitem");
  });

  it("offers Refresh, Group and Edit Alias for the spec §3.1 menu", () => {
    renderMenu({
      onRefresh: noop,
      onAssignGroup: noop,
      onEditAlias: noop,
    });

    const tools = positionOf("Project Tools");
    const refresh = positionOf("Refresh");
    const color = positionOf("Set Color");
    const groupItem = positionOf("Group…");
    const notes = positionOf("Notes");
    const alias = positionOf("Edit Alias");

    expect(tools).toBeGreaterThanOrEqual(0);
    expect(refresh).toBeGreaterThan(tools);
    expect(groupItem).toBeGreaterThan(color);
    expect(alias).toBeGreaterThan(notes);
  });

  it("renders the identical item set from the kebab trigger and the right-click menu", async () => {
    const base = {
      projectId: "p1",
      path: "/repos/x",
      title: "demo",
      onSuccess: noop,
      onError: noop,
      onRunFetch: noop,
      onRunPull: noop,
      onRunPush: noop,
      onOpenStashManager: noop,
      onRefresh: noop,
      onAssignGroup: noop,
      onEditAlias: noop,
      onRemoveProject: vi.fn(),
    };

    render(<ProjectContextMenu {...base} />);
    fireEvent.click(screen.getByTitle("More actions"));
    await screen.findByRole("menu");
    const kebabLabels = menuLabels();
    cleanup();

    renderMenu(base);
    const contextLabels = menuLabels();

    expect(kebabLabels.length).toBeGreaterThan(0);
    expect(contextLabels).toEqual(kebabLabels);
  });

  it("grays out Fetch while it is in progress", () => {
    renderMenu({ fetching: true });

    expect(screen.getByRole("menuitem", { name: "Fetch" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Pull" })).not.toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Push" })).not.toBeDisabled();
  });

  it("hides git ops, stash and remove when their props are absent", () => {
    renderMenu({
      onRunFetch: undefined,
      onRunPull: undefined,
      onRunPush: undefined,
      onOpenStashManager: undefined,
      onRemoveProject: undefined,
    });

    expect(screen.queryByRole("menuitem", { name: "Fetch" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Pull" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Push" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Stash Manager/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Remove Project" })).not.toBeInTheDocument();
  });
});

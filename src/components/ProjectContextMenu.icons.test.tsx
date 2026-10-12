import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectContextMenu } from "./ProjectContextMenu";

vi.mock("../lib/tauri", () => ({
  gitGetFiles: vi.fn().mockResolvedValue([]),
  setProjectColor: vi.fn().mockResolvedValue(undefined),
  openInTerminal: vi.fn().mockResolvedValue(undefined),
  openInFinder: vi.fn().mockResolvedValue(undefined),
  openInVscode: vi.fn().mockResolvedValue(undefined),
}));

const noop = () => {};

afterEach(cleanup);

describe("ProjectContextMenu icons", () => {
  it("renders every menu item with an icon", () => {
    render(
      <ProjectContextMenu
        projectId="p1"
        path="/repos/x"
        title="demo"
        onSuccess={noop}
        onError={noop}
        contextAnchor={{ x: 10, y: 20 }}
        contextOnClose={noop}
        onRunFetch={noop}
        onRunPull={noop}
        onRunPush={noop}
        onOpenBranchManager={noop}
        onOpenTagManager={noop}
        onOpenLogViewer={noop}
        onOpenAiReview={noop}
        onOpenStashManager={noop}
        onRefresh={noop}
        onAssignGroup={noop}
        onEditAlias={noop}
        onOpenBuiltInTerminal={noop}
        onRunProjectScript={noop}
        onEditDescription={noop}
        notes="n"
        onEditNotes={noop}
        onRemoveProject={noop}
      />
    );

    const items = screen.getAllByRole("menuitem");
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.querySelector("svg, span.rounded-full")).not.toBeNull();
    }
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MenuItem } from "./primitives";
import { ContextMenu, MenuSeparator } from "./ContextMenu";
import { useContextMenu } from "../../hooks/useContextMenu";

const noop = () => {};

function stubPanelMetrics(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(height);
}

function stubPaintedRect(rect: Partial<DOMRect>) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
}

function stubViewport(width: number, height: number) {
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(width);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(height);
}

function renderAt(
  anchor: { x: number; y: number },
  props: Partial<React.ComponentProps<typeof ContextMenu>> = {}
) {
  render(
    <ContextMenu open anchor={anchor} onClose={noop} {...props}>
      <MenuItem label="Copy" onClick={noop} />
    </ContextMenu>
  );
  return screen.getByRole("menu");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContextMenu", () => {
  it("renders children when open", () => {
    render(
      <ContextMenu open anchor={{ x: 20, y: 20 }} onClose={noop}>
        <MenuItem label="Copy" onClick={noop} />
        <MenuItem label="Paste" onClick={noop} />
      </ContextMenu>
    );

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.getByText("Paste")).toBeInTheDocument();
  });

  it("closes when a mousedown lands outside the menu", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu open anchor={{ x: 20, y: 20 }} onClose={onClose}>
        <MenuItem label="Copy" onClick={noop} />
      </ContextMenu>
    );

    fireEvent.mouseDown(screen.getByText("Copy"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and consumes the event before outer layers", () => {
    const onClose = vi.fn();
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    render(
      <ContextMenu open anchor={{ x: 20, y: 20 }} onClose={onClose}>
        <MenuItem label="Copy" onClick={noop} />
      </ContextMenu>
    );

    const notPrevented = fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outer);
  });

  it("clamps the panel inside the viewport at the right edge", () => {
    stubPanelMetrics(300, 200);
    render(
      <ContextMenu
        open
        anchor={{ x: window.innerWidth - 4, y: 100 }}
        onClose={noop}
      >
        <MenuItem label="Copy" onClick={noop} />
      </ContextMenu>
    );

    const panel = screen.getByRole("menu");
    const left = Number.parseFloat(panel.style.left);
    expect(left).toBe(window.innerWidth - 300 - 8);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + 300).toBeLessThanOrEqual(window.innerWidth - 8);
  });

  it("clamps with the layout size while the entrance animation is scaling the panel", () => {
    stubPanelMetrics(300, 200);
    // popoverIn starts at scale(0.96): the painted box is narrower than the layout box.
    stubPaintedRect({ width: 288, height: 192 });
    render(
      <ContextMenu open anchor={{ x: window.innerWidth - 4, y: 100 }} onClose={noop}>
        <MenuItem label="Copy" onClick={noop} />
      </ContextMenu>
    );

    const left = Number.parseFloat(screen.getByRole("menu").style.left);
    expect(left).toBe(window.innerWidth - 300 - 8);
  });

  it("flips upward when there is not enough space below the anchor", () => {
    stubPanelMetrics(300, 200);
    render(
      <ContextMenu
        open
        anchor={{ x: 40, y: window.innerHeight - 4 }}
        onClose={noop}
      >
        <MenuItem label="Copy" onClick={noop} />
      </ContextMenu>
    );

    const panel = screen.getByRole("menu");
    expect(panel.style.bottom).toBe("10px");
    expect(panel.style.top).toBe("");
    expect(panel.className).toContain("origin-bottom-left");
  });

  it.each([
    { align: "start" as const, anchorX: 400, expectedLeft: 400 },
    { align: "center" as const, anchorX: 400, expectedLeft: 250 },
    { align: "end" as const, anchorX: 400, expectedLeft: 100 },
  ])("aligns the panel with align=$align", ({ align, anchorX, expectedLeft }) => {
    stubPanelMetrics(300, 200);
    const panel = renderAt({ x: anchorX, y: 100 }, { align });

    expect(Number.parseFloat(panel.style.left)).toBe(expectedLeft);
    expect(panel.className).toContain("origin-top-left");
  });

  it("clamps the panel to the left edge", () => {
    stubPanelMetrics(300, 200);
    const panel = renderAt({ x: 2, y: 100 });

    expect(Number.parseFloat(panel.style.left)).toBe(8);
  });

  it("keeps the panel on screen when the anchor is above the viewport", () => {
    stubPanelMetrics(300, 200);
    const panel = renderAt({ x: 40, y: -30 });

    expect(Number.parseFloat(panel.style.top)).toBe(8);
    expect(Number.parseFloat(panel.style.maxHeight)).toBeLessThanOrEqual(window.innerHeight - 16);
  });

  it("keeps the panel on screen when the anchor is below the viewport", () => {
    stubPanelMetrics(300, 200);
    const panel = renderAt({ x: 40, y: window.innerHeight + 40 });

    expect(Number.parseFloat(panel.style.bottom)).toBe(8);
    expect(panel.style.top).toBe("");
    const maxHeight = Number.parseFloat(panel.style.maxHeight);
    expect(maxHeight).toBeLessThanOrEqual(window.innerHeight - 16);
  });

  it("never collapses the panel when the viewport is shorter than the menu", () => {
    stubViewport(1024, 100);
    stubPanelMetrics(300, 400);
    const panel = renderAt({ x: 40, y: -50 });

    const maxHeight = Number.parseFloat(panel.style.maxHeight);
    expect(maxHeight).toBe(84);
    expect(Number.parseFloat(panel.style.top) + maxHeight).toBeLessThanOrEqual(92);
  });

  it("keeps a visible sliver when neither side of the anchor has room", () => {
    // Both spaceBelow and spaceAbove are negative here: the panel used to collapse to 0px.
    stubViewport(1024, 20);
    stubPanelMetrics(300, 400);
    const panel = renderAt({ x: 40, y: 10 });

    const maxHeight = Number.parseFloat(panel.style.maxHeight);
    expect(maxHeight).toBeGreaterThan(0);
    expect(Number.parseFloat(panel.style.top) + maxHeight).toBeLessThanOrEqual(20 - 8);
  });

  it("renders MenuSeparator as a separator", () => {
    render(
      <ContextMenu open anchor={{ x: 20, y: 20 }} onClose={noop}>
        <MenuItem label="Copy" onClick={noop} />
        <MenuSeparator />
      </ContextMenu>
    );

    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("moves focus between menu items with arrow keys", () => {
    render(
      <ContextMenu open anchor={{ x: 20, y: 20 }} onClose={noop}>
        <MenuItem label="One" onClick={noop} />
        <MenuItem label="Two" onClick={noop} />
        <MenuItem label="Three" onClick={noop} />
      </ContextMenu>
    );

    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "One" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Two" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "End" });
    expect(screen.getByRole("menuitem", { name: "Three" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "One" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: "Three" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Home" });
    expect(screen.getByRole("menuitem", { name: "One" })).toHaveFocus();
  });
});

function HookHarness() {
  const { anchor, onContextMenu } = useContextMenu();
  return (
    <div data-testid="area" onContextMenu={onContextMenu}>
      {anchor ? `${anchor.x},${anchor.y}` : "closed"}
    </div>
  );
}

describe("useContextMenu", () => {
  it("records the pointer position and prevents the native menu", () => {
    render(<HookHarness />);
    const area = screen.getByTestId("area");

    const notPrevented = fireEvent.contextMenu(area, { clientX: 12, clientY: 34 });

    expect(notPrevented).toBe(false);
    expect(area).toHaveTextContent("12,34");
  });

  it("opens even while text is selected, because the native menu is suppressed", () => {
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "selected text",
    } as unknown as Selection);
    render(<HookHarness />);
    const area = screen.getByTestId("area");

    const notPrevented = fireEvent.contextMenu(area, { clientX: 12, clientY: 34 });

    expect(notPrevented).toBe(false);
    expect(area).toHaveTextContent("12,34");
  });
});

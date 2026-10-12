import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DropdownMenu, MenuItem } from "./primitives";

function stubTriggerRect(rect: Partial<DOMRect>) {
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

afterEach(() => {
  vi.restoreAllMocks();
});

function renderMenu() {
  return render(
    <DropdownMenu
      trigger={<button>More actions</button>}
    >
      {Array.from({ length: 12 }, (_, i) => (
        <MenuItem key={i} label={`Item ${i}`} onClick={() => {}} />
      ))}
    </DropdownMenu>
  );
}

describe("DropdownMenu", () => {
  it("clamps the panel to the viewport and makes it scrollable", () => {
    // jsdom default: window.innerHeight = 768, rect at origin
    stubTriggerRect({});
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    const panel = screen.getByRole("menu");
    // Tall menus must scroll instead of overflowing past the viewport
    expect(panel.className).toContain("overflow-y-auto");
    // Clamped to the space between trigger bottom and the viewport edge
    expect(panel.style.maxHeight).toBe(`${window.innerHeight - 6 - 8}px`);
    expect(panel.style.top).toBe("6px");
  });

  it("flips up when there is not enough space below the trigger", () => {
    stubTriggerRect({ top: 700, bottom: 740, right: 300 });
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    const panel = screen.getByRole("menu");
    // Opens upward anchored to the trigger top
    expect(panel.style.bottom).toBe(`${window.innerHeight - 700 + 6}px`);
    expect(panel.style.top).toBe("");
    // Scrollable within the space above the trigger
    expect(panel.style.maxHeight).toBe(`${700 - 6 - 8}px`);
  });
});

const baseMenuItemClass =
  "press w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-all active:scale-[0.99] hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300";

describe("MenuItem", () => {
  it("renders the pre-disabled/shortcut DOM when both props are omitted", () => {
    render(<MenuItem label="Copy" onClick={() => {}} />);

    expect(screen.getByRole("menuitem").outerHTML).toBe(
      `<button type="button" role="menuitem" class="${baseMenuItemClass}"><div class="flex-1 min-w-0"><div class="text-gray-900 dark:text-gray-100">Copy</div></div></button>`
    );
  });

  it("does not call onClick and dims the item when disabled", () => {
    const onClick = vi.fn();
    render(<MenuItem label="Fetch" onClick={onClick} disabled />);

    const item = screen.getByRole("menuitem");
    expect(item).toBeDisabled();
    expect(item.className).toBe(`${baseMenuItemClass} opacity-50 cursor-not-allowed`);

    fireEvent.click(item);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders the shortcut hint on the trailing edge", () => {
    render(<MenuItem label="Refresh" onClick={() => {}} shortcut="⌘R" />);

    const item = screen.getByRole("menuitem");
    expect(item).toHaveAttribute("role", "menuitem");
    expect(item.lastElementChild).toHaveTextContent("⌘R");
    expect(item.lastElementChild?.className).toContain("font-mono");
  });

  it("keeps the menuitemradio role when selected is combined with the new props", () => {
    render(<MenuItem label="VS Code" onClick={() => {}} selected shortcut="⇧⌘O" disabled />);

    expect(screen.getByRole("menuitemradio")).toHaveAttribute("aria-checked", "true");
  });
});

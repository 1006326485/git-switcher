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

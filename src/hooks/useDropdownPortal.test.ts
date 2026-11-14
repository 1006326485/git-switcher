import { describe, expect, it } from "vitest";
import { computePortalPosition } from "./useDropdownPortal";

/**
 * Requirement: a dropdown must never paint at the viewport's top-left corner
 * first. Positioning is therefore computed from the trigger's real box BEFORE
 * the portal is rendered, and these cases pin the contract the hook relies on.
 */
const viewport = { width: 1200, height: 800 };
const base = { minWidth: 240, align: "left" as const, estimatedHeight: 0, menuMinHeight: 220 };

function anchor(rect: { top: number; bottom: number; left: number; right: number; width: number }) {
  return rect;
}

describe("computePortalPosition", () => {
  it("anchors under the trigger's bottom edge, never at 0,0", () => {
    const pos = computePortalPosition(anchor({ top: 40, bottom: 64, left: 300, right: 380, width: 80 }), base, viewport);
    expect(pos.top).toBe(68);
    expect(pos.left).toBe(300);
    expect(pos.width).toBe(240); // minWidth wins over a narrow trigger
    expect(pos.placeAbove).toBe(false);
  });

  it("matches the trigger's left edge when wider than minWidth, and right edge when right-aligned", () => {
    const wide = anchor({ top: 10, bottom: 30, left: 100, right: 400, width: 300 });
    expect(computePortalPosition(wide, base, viewport).width).toBe(300);
    expect(computePortalPosition(wide, { ...base, align: "right" }, viewport).left).toBe(100);
    const narrow = anchor({ top: 10, bottom: 30, left: 500, right: 540, width: 40 });
    expect(computePortalPosition(narrow, { ...base, align: "right" }, viewport).left).toBe(540 - 240);
  });

  it("prefers the side that fits a short list, and flips above a low trigger", () => {
    // Trigger near the bottom: a 200px list cannot fit below (800-780-12).
    const low = anchor({ top: 760, bottom: 780, left: 100, right: 180, width: 80 });
    const flipped = computePortalPosition(low, { ...base, estimatedHeight: 200 }, viewport);
    expect(flipped.placeAbove).toBe(true);
    // The popover is translated up by its measured height: never over its
    // trigger (bottom of the box <= trigger top - gap).
    expect(flipped.top - 200).toBeLessThanOrEqual(low.top - 4);

    // Plenty of room below: no flip even for a tall menu.
    const high = anchor({ top: 40, bottom: 60, left: 100, right: 180, width: 80 });
    expect(computePortalPosition(high, { ...base, estimatedHeight: 400 }, viewport).placeAbove).toBe(false);
  });

  it("keeps a main menu below a trigger with room for it", () => {
    const mid = anchor({ top: 400, bottom: 420, left: 100, right: 180, width: 80 });
    expect(computePortalPosition(mid, { ...base, estimatedHeight: 120 }, viewport)).toMatchObject({
      top: 424,
      placeAbove: false,
    });
  });

  it("clamps to the viewport edges on both axes", () => {
    // A menu opened near the right edge stays fully visible.
    const right = anchor({ top: 100, bottom: 120, left: 1100, right: 1196, width: 96 });
    const pos = computePortalPosition(right, base, viewport);
    expect(pos.left).toBe(viewport.width - 240 - 8);
    expect(pos.left + pos.width).toBeLessThanOrEqual(viewport.width);

    // A trigger at the very top flips down rather than off-screen.
    const top = anchor({ top: 2, bottom: 22, left: 50, right: 130, width: 80 });
    const below = computePortalPosition(top, { ...base, estimatedHeight: 300 }, viewport);
    expect(below.placeAbove).toBe(false);
    expect(below.top).toBeGreaterThan(top.bottom);
  });

  it("never returns the (0,0) corner the first frame used to flash at", () => {
    for (const top of [0, 120, 400, 790]) {
      for (const left of [0, 300, 1190]) {
        const pos = computePortalPosition(
          anchor({ top, bottom: top + 20, left, right: left + 80, width: 80 }),
          { ...base, estimatedHeight: 160 },
          viewport
        );
        expect(pos.top === 0 && pos.left === 0).toBe(false);
      }
    }
  });
});

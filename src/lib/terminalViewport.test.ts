import { describe, expect, it } from "vitest";
import { resyncTerminalViewport, type ViewportTerminal } from "./terminalViewport";

/**
 * Mirrors the parts of xterm's `BufferService` that decide whether the view
 * follows the output: `scrollLines` clamps the viewport, latches
 * `isUserScrolling` on an upward scroll, and fires the scroll event only when
 * the line actually changes. A viewport that never fires that event keeps the
 * stale DOM scroll area it built while its container was `display:none` —
 * exactly the bug this module repairs.
 */
class FakeTerminal implements ViewportTerminal {
  ydisp: number;
  baseY: number;
  isUserScrolling: boolean;
  scrollAmounts: number[] = [];
  scrollEvents: number[] = [];

  constructor(baseY: number, ydisp: number) {
    this.baseY = baseY;
    this.ydisp = ydisp;
    this.isUserScrolling = ydisp < baseY;
  }

  get buffer() {
    return { active: { viewportY: this.ydisp, baseY: this.baseY } };
  }

  scrollLines(amount: number): void {
    this.scrollAmounts.push(amount);
    if (amount < 0) {
      if (this.ydisp === 0) return;
      this.isUserScrolling = true;
    } else if (amount + this.ydisp >= this.baseY) {
      this.isUserScrolling = false;
    }
    const next = Math.max(Math.min(this.ydisp + amount, this.baseY), 0);
    if (next !== this.ydisp) {
      this.ydisp = next;
      this.scrollEvents.push(next);
    }
  }

  /** Output arrives: the tail moves, and a following viewport rides along. */
  appendLine(): void {
    this.baseY += 1;
    if (!this.isUserScrolling) this.ydisp = this.baseY;
  }
}

describe("resyncTerminalViewport", () => {
  it("is not scrollToBottom(), which fires no scroll event at the tail", () => {
    // Terminal.scrollToBottom() reduces to scrollLines(0) when the viewport is
    // already at the tail, and a zero-line scroll never reaches the viewport.
    // That is why the resize/scroll path — the only thing that rebuilds the
    // scroll area — stays cold no matter how many times it is called.
    const term = new FakeTerminal(577, 577);
    term.scrollLines(0);

    expect(term.scrollEvents).toEqual([]);
  });

  it("fires the scroll event that rebuilds the scroll area, and stays at the tail", () => {
    const term = new FakeTerminal(577, 577);

    resyncTerminalViewport(term);

    expect(term.scrollEvents.length).toBeGreaterThan(0);
    expect(term.buffer.active.viewportY).toBe(577);
  });

  it("restores follow-the-tail so the next output is visible", () => {
    const term = new FakeTerminal(300, 300);
    // Latched by the bogus scroll event the hidden container fired.
    term.isUserScrolling = true;

    resyncTerminalViewport(term);
    term.appendLine();

    expect(term.isUserScrolling).toBe(false);
    expect(term.buffer.active.viewportY).toBe(term.baseY);
  });

  it("keeps a terminal the user scrolled up in exactly where it was", () => {
    const term = new FakeTerminal(577, 237);

    resyncTerminalViewport(term);

    // Same line, and still "user is scrolling" so reading history is not
    // interrupted by new output.
    expect(term.buffer.active.viewportY).toBe(237);
    expect(term.isUserScrolling).toBe(true);
    // The scroll area still gets rebuilt, so this position renders correctly.
    expect(term.scrollEvents.length).toBeGreaterThan(0);
  });

  it("leaves a terminal with no scrollback alone", () => {
    const term = new FakeTerminal(0, 0);

    resyncTerminalViewport(term);

    expect(term.scrollAmounts).toEqual([]);
  });

  it("is stable when run twice in a row", () => {
    const term = new FakeTerminal(577, 237);

    resyncTerminalViewport(term);
    resyncTerminalViewport(term);

    expect(term.buffer.active.viewportY).toBe(237);
  });
});

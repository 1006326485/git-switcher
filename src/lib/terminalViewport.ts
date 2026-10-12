/**
 * Re-align an xterm viewport with its buffer after the container it lives in
 * was hidden with `display:none` (an inactive tab, a closed terminal panel).
 *
 * Why this is needed: xterm sizes its scroll area from the container's
 * `offsetHeight`, which reads as 0 while an ancestor is `display:none`, and
 * the browser clamps the viewport's `scrollTop` because nothing is scrollable.
 * Showing the container again repairs neither: `FitAddon.fit()` /
 * `Terminal.resize()` bail out when rows and cols are unchanged, and
 * `scrollToBottom()` is a no-op once `viewportY === baseY`. So the terminal
 * keeps painting the rows it had before it was hidden — roughly a screen above
 * the tail — until the next burst of output (or a manual scroll) emits the
 * scroll event that rebuilds the scroll area. That is the "I have to scroll to
 * the bottom to see what the agent just printed" bug.
 *
 * The fix uses the public scroll API only: step one line, then step back onto
 * the line the buffer was already on. Both calls land in the same task, so
 * xterm coalesces them into a single refresh, and the scroll event they emit
 * makes the viewport rebuild its scroll area at the now-visible height.
 * Stepping back (instead of scrolling to the bottom) preserves the reading
 * position, so a terminal the user had scrolled up in stays put — and stepping
 * back onto the tail also clears xterm's "user is scrolling" latch, so
 * following new output keeps working.
 */
export interface ViewportTerminal {
  readonly buffer: {
    readonly active: { readonly viewportY: number; readonly baseY: number };
  };
  scrollLines(amount: number): void;
}

export function resyncTerminalViewport(term: ViewportTerminal): void {
  const { viewportY, baseY } = term.buffer.active;
  // No scrollback, no scroll area to repair (alternate-screen apps live here,
  // and a zero-line scroll never reaches the viewport anyway).
  if (baseY === 0) return;

  // Step one line in whichever direction has room, so the buffer actually
  // fires a scroll event, then return to where it already was.
  term.scrollLines(viewportY < baseY ? 1 : -1);
  term.scrollLines(viewportY - term.buffer.active.viewportY);
}

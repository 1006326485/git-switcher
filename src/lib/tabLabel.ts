/**
 * Tab labels are a fixed width, so a long title has to give somewhere.
 *
 * iTerm2 elides the *middle* of a squeezed tab title rather than its tail: the
 * head carries the context (project, path) and the tail carries what actually
 * tells two tabs apart (the leaf directory or the running job). Cutting the
 * middle keeps both ends readable, where a plain `text-overflow: ellipsis`
 * would throw the distinguishing part away first.
 *
 * The tail always survives: when the leaf alone is wider than the tab there is
 * no room left for a head that would identify anything, so the head is dropped
 * rather than the tail (`…omponents`, never `spire@spiredeMa…`).
 *
 * Widths are supplied by the caller (canvas measurement in the browser), which
 * keeps this pure and testable — see `src/components/ui/TabLabel.tsx`.
 */

export type MeasureText = (text: string) => number;

/** The single glyph that marks an elided middle. */
export const TAB_LABEL_ELLIPSIS = "…";

/**
 * Characters that end a title's context part and start the part worth keeping:
 * a path separator, a `host: path` colon, an iTerm2-style `— job` dash.
 */
const TAIL_BREAKS = new Set([" ", "/", ":", "—", "|"]);

/**
 * Fits `text` into `maxWidth`, eliding the middle when it does not fit.
 *
 * `maxWidth <= 0` means "no layout to measure against" (first paint, a hidden
 * bar, jsdom): the text is returned untouched so a label never renders as an
 * ellipsis because a box had no width yet.
 */
export function truncateMiddle(text: string, maxWidth: number, measure: MeasureText): string {
  if (!text) return "";
  if (maxWidth <= 0) return text;
  if (measure(text) <= maxWidth) return text;

  const chars = Array.from(text);
  const ellipsisWidth = measure(TAB_LABEL_ELLIPSIS);
  if (ellipsisWidth >= maxWidth) return TAB_LABEL_ELLIPSIS;

  const budget = maxWidth - ellipsisWidth;
  const leaf = leafOf(chars);
  if (leaf.length > 0) {
    const leafWidth = measure(leaf.join(""));
    if (leafWidth <= budget) {
      const head = fitHead(chars.slice(0, chars.length - leaf.length), budget - leafWidth, measure);
      return `${head}${TAB_LABEL_ELLIPSIS}${leaf.join("")}`;
    }
    // The leaf alone is wider than the box. A head stub would identify nothing
    // (`spire@spiredeMa…`), so spend every pixel on the end of the leaf — the
    // part two tabs actually differ in.
    return `${TAB_LABEL_ELLIPSIS}${fitTail(leaf, budget, measure).join("")}`;
  }

  // One unbroken token (`pnpm`, `python3`): its start is what tells it apart.
  return `${fitHead(chars, budget, measure)}${TAB_LABEL_ELLIPSIS}`;
}

/** The run after the last separator — the leaf that tells two tabs apart. */
function leafOf(chars: string[]): string[] {
  for (let index = chars.length - 2; index > 0; index -= 1) {
    if (!TAIL_BREAKS.has(chars[index])) continue;
    const leaf = chars.slice(index + 1);
    if (leaf.length > 0) return leaf;
  }
  return [];
}

/** Longest suffix of `chars` that fits `budget` (possibly empty). */
function fitTail(chars: string[], budget: number, measure: MeasureText): string[] {
  if (budget <= 0) return [];
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(chars.slice(chars.length - mid).join("")) <= budget) low = mid;
    else high = mid - 1;
  }
  return chars.slice(chars.length - low);
}

/** Longest prefix of `chars` that fits `budget`, minus any dangling separator. */
function fitHead(chars: string[], budget: number, measure: MeasureText): string {
  if (budget <= 0) return "";
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(chars.slice(0, mid).join("")) <= budget) low = mid;
    else high = mid - 1;
  }
  // `src/…src` reads like a typo; drop the separator the ellipsis now replaces.
  let end = low;
  while (end > 0 && (chars[end - 1] === " " || chars[end - 1] === "/" || chars[end - 1] === ":")) {
    end -= 1;
  }
  return chars.slice(0, end).join("");
}

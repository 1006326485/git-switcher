import { describe, expect, it } from "vitest";
import { TAB_LABEL_ELLIPSIS, truncateMiddle } from "./tabLabel";

/** Uniform 10px per code point — enough to exercise every branch. */
const measure = (text: string) => Array.from(text).length * 10;

describe("truncateMiddle", () => {
  it("leaves a title that fits completely alone", () => {
    expect(truncateMiddle("zsh", 100, measure)).toBe("zsh");
    expect(truncateMiddle("zsh", 30, measure)).toBe("zsh");
  });

  it("keeps both ends of a squeezed path", () => {
    expect(truncateMiddle("user@host: ~/src", 100, measure)).toBe(`user@h${TAB_LABEL_ELLIPSIS}src`);
  });

  it("keeps context and leaf when both fit", () => {
    expect(truncateMiddle("~/projects/git-switcher", 220, measure)).toBe(
      `~/project${TAB_LABEL_ELLIPSIS}git-switcher`
    );
  });

  it("drops the head rather than the leaf when the leaf fills the tab", () => {
    // The regression this guards: a leaf too wide for its 75% share used to be
    // thrown away entirely, leaving `~/projects…` — the one part that tells two
    // tabs apart, gone.
    expect(truncateMiddle("~/projects/git-switcher", 120, measure)).toBe(
      `${TAB_LABEL_ELLIPSIS}it-switcher`
    );
    expect(
      truncateMiddle("spire@spiredeMacBook-Pro:~/Documents/workspace/gcf-components", 120, measure)
    ).toBe(`${TAB_LABEL_ELLIPSIS}-components`);
    expect(
      truncateMiddle("spire@spiredeMacBook-Pro:~/Documents/workspace/gcf-components", 150, measure)
    ).toBe(`${TAB_LABEL_ELLIPSIS}gcf-components`);
  });

  it("drops a dangling separator instead of doubling it", () => {
    // The head is cut mid-path, so its trailing slash goes with it rather than
    // sitting next to the ellipsis.
    expect(truncateMiddle("alpha/beta/gamma", 120, measure)).toBe(
      `alpha${TAB_LABEL_ELLIPSIS}gamma`
    );
  });

  it("falls back to a tail-less cut when there is no separator", () => {
    expect(truncateMiddle("abcdefghijkl", 50, measure)).toBe(`abcd${TAB_LABEL_ELLIPSIS}`);
  });

  it("never measures wider than the box it was given", () => {
    const titles = [
      "zsh",
      "pnpm run dev",
      "user@host: ~/git-switcher",
      "~/Library/Application Support/git-switcher",
      "python3 -m http.server 8000",
      "averyveryverylongsingletokenwithoutbreaks",
    ];
    for (const title of titles) {
      for (const width of [0, 12, 30, 60, 90, 140, 400]) {
        const fitted = truncateMiddle(title, width, measure);
        if (width <= 0) {
          expect(fitted).toBe(title);
          continue;
        }
        expect(measure(fitted)).toBeLessThanOrEqual(width);
        expect(fitted.length).toBeGreaterThan(0);
      }
    }
  });

  it("renders only the ellipsis when the box is narrower than one", () => {
    expect(truncateMiddle("pnpm run dev", 5, measure)).toBe(TAB_LABEL_ELLIPSIS);
  });

  it("returns an empty string for an empty title", () => {
    expect(truncateMiddle("", 100, measure)).toBe("");
  });
});

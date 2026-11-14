import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installSpellingPolicy } from "./spellingPolicy";

/**
 * `spellcheck` is a content attribute — there is no CSS property — so the
 * app-wide default is written onto each field by installSpellingPolicy. jsdom
 * does not implement the `spellcheck` *property* (reading it yields undefined),
 * so assertions go through getAttribute, which is what the WebView reads.
 */
const OFF_ATTRIBUTES: ReadonlyArray<[string, string]> = [
  ["spellcheck", "false"],
  ["autocorrect", "off"],
  ["autocapitalize", "off"],
];

function expectCorrectedOff(element: Element | null) {
  expect(element).not.toBeNull();
  for (const [name, value] of OFF_ATTRIBUTES) {
    expect(element!.getAttribute(name), name).toBe(value);
  }
}

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  return host.firstElementChild as HTMLElement;
}

/** MutationObserver callbacks are microtasks; let them run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("installSpellingPolicy", () => {
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    dispose = installSpellingPolicy(document);
  });

  afterEach(() => {
    dispose?.();
    document.body.innerHTML = "";
  });

  it("disables correction on text fields that already exist", () => {
    // Fields present before install are handled synchronously, not via the
    // observer.
    const host = document.createElement("div");
    host.innerHTML = `
      <input type="text" />
      <input />
      <input type="search" />
      <textarea></textarea>
    `;
    document.body.appendChild(host);
    dispose?.();
    dispose = installSpellingPolicy(document);
    for (const field of host.children) expectCorrectedOff(field);
  });

  it("covers inputs mounted after install (dialogs, portals, terminal panes)", async () => {
    const late = mount(`<textarea></textarea>`);
    await flush();
    expectCorrectedOff(late);
  });

  it("covers inputs nested inside a freshly inserted subtree", async () => {
    const container = document.createElement("div");
    container.innerHTML = `<form><label><input type="text" /></label></form>`;
    document.body.appendChild(container);
    await flush();
    expectCorrectedOff(container.querySelector("input"));
  });

  it("leaves non-typing controls alone", async () => {
    for (const type of ["checkbox", "radio", "range", "color", "file", "button", "date"]) {
      const input = mount(`<input type="${type}" />`);
      await flush();
      expect(input.hasAttribute("spellcheck"), type).toBe(false);
    }
  });

  it("does not touch non-editable contenteditable surfaces", () => {
    const element = mount(`<div contenteditable="false"></div>`);
    expect(element.hasAttribute("spellcheck")).toBe(false);
  });

  it("keeps an explicit opt-in so a field can ask for spellcheck", () => {
    // The app default must not override a decision the field made itself.
    const element = mount(`<textarea spellcheck="true"></textarea>`);
    expect(element.getAttribute("spellcheck")).toBe("true");
  });

  it("keeps the existing per-site opt-outs exactly as written", () => {
    const element = mount(
      `<input type="text" spellcheck="false" autocorrect="off" autocapitalize="off" />`
    );
    expectCorrectedOff(element);
  });

  it("stops watching once disposed", async () => {
    dispose?.();
    dispose = undefined;
    const late = mount(`<input type="text" />`);
    await flush();
    expect(late.hasAttribute("spellcheck")).toBe(false);
  });

  it("re-applies when a field's attributes are rewritten later", async () => {
    // A controlled input can have its attributes replaced after mount; the
    // observer re-checks added nodes, and an explicit value must survive.
    const input = mount(`<input type="text" />`);
    await flush();
    expectCorrectedOff(input);
    input.setAttribute("spellcheck", "true");
    expect(input.getAttribute("spellcheck")).toBe("true");
  });
});

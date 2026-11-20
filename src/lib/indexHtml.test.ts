import { describe, expect, it } from "vitest";
import html from "../../index.html?raw";

describe("index.html", () => {
  // Tauri adds a nonce/hash to style-src for every inline <style> it finds, and
  // browsers then ignore 'unsafe-inline'. xterm injects un-nonced <style>
  // elements at runtime (text colors, cursor, selection), so release builds
  // would render a black-and-white terminal with no cursor or selection.
  it("has no inline <style> element", () => {
    expect(html).not.toMatch(/<style[\s>]/i);
  });

  it("loads the first-paint skeleton from an external stylesheet", () => {
    expect(html).toMatch(/<link[^>]+rel="stylesheet"[^>]+boot-shell\.css/);
  });
});

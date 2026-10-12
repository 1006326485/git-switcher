import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installContextMenuGuard } from "./contextMenuGuard";

function fire(target: Element): boolean {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("installContextMenuGuard", () => {
  let host: HTMLDivElement;
  let received: number;

  const bubble = () => received += 1;

  beforeEach(() => {
    installContextMenuGuard();
    host = document.createElement("div");
    document.body.appendChild(host);
    received = 0;
  });

  afterEach(() => {
    host.removeEventListener("contextmenu", bubble);
    host.remove();
  });

  it("suppresses the WebView's default menu on plain surfaces", () => {
    expect(fire(host)).toBe(true);
  });

  it("suppresses it on interactive controls that need the app menu", () => {
    const button = document.createElement("button");
    host.appendChild(button);
    expect(fire(button)).toBe(true);
  });

  it("keeps the native menu on text inputs", () => {
    const input = document.createElement("input");
    host.appendChild(input);
    expect(fire(input)).toBe(false);
  });

  it("keeps the native menu on editable regions", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    host.appendChild(editable);
    expect(fire(editable)).toBe(false);
  });

  it("keeps the native menu when contenteditable is explicitly disabled", () => {
    const notEditable = document.createElement("div");
    notEditable.setAttribute("contenteditable", "false");
    host.appendChild(notEditable);
    expect(fire(notEditable)).toBe(true);
  });

  it("does not stop app-level handlers from opening a custom menu", () => {
    host.addEventListener("contextmenu", bubble);
    expect(fire(host)).toBe(true);
    expect(received).toBe(1);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  clearHeldKeys,
  hasOtherKeyHeld,
  isDirtyChord,
  installHeldKeyTracking,
  noteKeyDown,
  noteKeyUp,
} from "./heldKeys";

const keydown = (code: string) =>
  document.body.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));

const chord = (
  code: string,
  mods: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {}
) => ({
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

afterEach(() => {
  clearHeldKeys();
});

describe("heldKeys bookkeeping", () => {
  it("ignores modifier and lock keys", () => {
    noteKeyDown("ControlLeft");
    noteKeyDown("ShiftRight");
    noteKeyDown("MetaLeft");
    noteKeyDown("CapsLock");
    expect(hasOtherKeyHeld("Backquote")).toBe(false);
  });

  it("reports an unrelated key that is still down", () => {
    noteKeyDown("ControlLeft");
    noteKeyDown("KeyZ");
    expect(hasOtherKeyHeld("Backquote")).toBe(true);
  });

  it("does not treat the chord's own key as interference", () => {
    noteKeyDown("Backquote");
    expect(hasOtherKeyHeld("Backquote")).toBe(false);
  });

  it("forgets a key once it is released", () => {
    noteKeyDown("KeyZ");
    noteKeyUp("KeyZ");
    expect(hasOtherKeyHeld("Backquote")).toBe(false);
  });

  it("ignores presses with no usable code", () => {
    noteKeyDown("");
    expect(hasOtherKeyHeld("")).toBe(false);
  });
});

describe("isDirtyChord", () => {
  it("is false for a modifier-free keystroke, whatever is held", () => {
    noteKeyDown("KeyZ");
    expect(isDirtyChord(chord("KeyJ"))).toBe(false);
  });

  it("is false for a clean modifier chord", () => {
    expect(isDirtyChord(chord("Digit1", { ctrlKey: true }))).toBe(false);
  });

  it("is true when another key is still down", () => {
    noteKeyDown("KeyZ");
    expect(isDirtyChord(chord("Digit1", { ctrlKey: true }))).toBe(true);
    expect(isDirtyChord(chord("Slash", { metaKey: true }))).toBe(true);
    expect(isDirtyChord(chord("Digit2", { altKey: true }))).toBe(true);
  });

  it("ignores modifiers that are themselves held", () => {
    noteKeyDown("ControlLeft");
    noteKeyDown("ShiftLeft");
    expect(isDirtyChord(chord("Backquote", { ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  it("does not treat the chord's own key as interference", () => {
    noteKeyDown("Backquote");
    expect(isDirtyChord(chord("Backquote", { ctrlKey: true }))).toBe(false);
  });
});

describe("installHeldKeyTracking", () => {
  it("tracks real keydown/keyup events and clears on window blur", () => {
    const stop = installHeldKeyTracking();
    keydown("KeyZ");
    expect(hasOtherKeyHeld("Backquote")).toBe(true);
    window.dispatchEvent(new Event("blur"));
    expect(hasOtherKeyHeld("Backquote")).toBe(false);
    stop();
  });

  it("stops listening once the last owner unmounts", () => {
    const stop = installHeldKeyTracking();
    stop();
    keydown("KeyZ");
    expect(hasOtherKeyHeld("Backquote")).toBe(false);
  });

  it("keeps tracking while another owner is still mounted", () => {
    const stopFirst = installHeldKeyTracking();
    const stopSecond = installHeldKeyTracking();
    stopFirst();
    keydown("KeyZ");
    expect(hasOtherKeyHeld("Backquote")).toBe(true);
    stopSecond();
    expect(hasOtherKeyHeld("Backquote")).toBe(false);
  });
});

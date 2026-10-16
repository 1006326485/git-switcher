/**
 * Physical keys that are still held down.
 *
 * A shortcut chord is supposed to be a *clean* chord. The browser hands every
 * `keydown` the modifier flags as they are at that instant, so holding `Ctrl`
 * while typing `z` and then pressing `~` looks identical to a real `Ctrl+~`.
 * Telling them apart requires remembering what is still physically down.
 *
 * Only non-modifier keys are tracked: the modifiers are already asserted
 * separately by the matchers, and a held `Ctrl` must never cancel `Ctrl+~`.
 */

/** Modifier / lock keys — never "interference" inside a chord. */
const NON_KEY_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "AltGraph",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
  "HyperLeft",
  "HyperRight",
  "SuperLeft",
  "SuperRight",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Fn",
  "FnLock",
]);

const held = new Set<string>();

export function noteKeyDown(code: string): void {
  if (!code || NON_KEY_CODES.has(code)) return;
  held.add(code);
}

export function noteKeyUp(code: string): void {
  held.delete(code);
}

export function clearHeldKeys(): void {
  held.clear();
}

/** True while a key other than `code` is still held down. */
export function hasOtherKeyHeld(code: string): boolean {
  for (const heldCode of held) {
    if (heldCode !== code) return true;
  }
  return false;
}

/**
 * True when `e` is a modifier chord that must not fire because another
 * non-modifier key is still physically down — the `Ctrl+z` then `~` case.
 *
 * Callers must only use this to *refuse* an action they were about to take
 * (after their own condition matched); never widen it to every modifier
 * keystroke, or the app would swallow native editing/OS shortcuts it does
 * not implement (Cmd+C, Cmd+Q, …).
 */
export function isDirtyChord(
  e: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "code">,
): boolean {
  if (!e.metaKey && !e.ctrlKey && !e.altKey) return false;
  return hasOtherKeyHeld(e.code);
}

let refCount = 0;
let teardownAll: (() => void) | null = null;

/**
 * Installs the window-level tracking the chord checks rely on. Reference
 * counted so several shortcut owners can share one listener pair, and always
 * drops every held key once the last owner goes away.
 */
export function installHeldKeyTracking(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  refCount += 1;
  if (refCount === 1) {
    const onDown = (e: KeyboardEvent) => noteKeyDown(e.code);
    const onUp = (e: KeyboardEvent) => noteKeyUp(e.code);
    // A keyup the app never saw (app switch, global hotkey stealing focus)
    // would otherwise wedge every later chord.
    const onWindowBlur = () => clearHeldKeys();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") clearHeldKeys();
    };
    // Capture phase, so the record is current before any bubble-phase
    // shortcut handler reads it, whatever order they were registered in.
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibility);
    teardownAll = () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    refCount -= 1;
    if (refCount === 0) {
      teardownAll?.();
      teardownAll = null;
      clearHeldKeys();
    }
  };
}

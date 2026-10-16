let count = 0;

function syncDomFlag(): void {
  try {
    const on = count > 0;
    (window as unknown as { __shortcutCapturing?: boolean }).__shortcutCapturing = on;
    if (typeof document !== "undefined" && document.body) {
      if (on) document.body.dataset.shortcutCapturing = "true";
      else delete document.body.dataset.shortcutCapturing;
    }
  } catch {
    // Non-DOM environments (tests) — the module counter is the source of truth.
  }
}

export function setShortcutCapturing(active: boolean): void {
  count += active ? 1 : -1;
  if (count < 0) count = 0;
  syncDomFlag();
}

export function isShortcutCapturing(): boolean {
  if (count > 0) return true;
  try {
    return (
      (window as unknown as { __shortcutCapturing?: boolean }).__shortcutCapturing === true
    );
  } catch {
    return false;
  }
}

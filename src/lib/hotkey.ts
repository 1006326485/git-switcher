const MAC_SYMBOLS: Record<string, string> = {
  cmdorctrl: "⌘",
  cmd: "⌘",
  command: "⌘",
  meta: "⌘",
  super: "⌘",
  ctrl: "⌃",
  control: "⌃",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
};

const PC_LABELS: Record<string, string> = {
  cmdorctrl: "Ctrl",
  cmd: "Win",
  command: "Win",
  meta: "Win",
  super: "Win",
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
};

export function detectMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac/i.test(navigator.platform || navigator.userAgent);
}

/** Renders a Tauri accelerator (e.g. "CmdOrCtrl+Shift+`") as "⌘⇧`" / "Ctrl+Shift+`". */
export function formatHotkey(hotkey: string, isMac = detectMac()): string {
  const map = isMac ? MAC_SYMBOLS : PC_LABELS;
  const parts = hotkey
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => map[part.toLowerCase()] ?? part);
  return parts.join(isMac ? "" : "+");
}

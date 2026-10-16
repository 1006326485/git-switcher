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

const MOD_ORDER: Record<string, number> = {
  CmdOrCtrl: 0,
  Control: 1,
  Alt: 2,
  Shift: 3,
  Meta: 4,
};

export function normalizeBinding(binding: string): string {
  const rawParts = binding
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (rawParts.length === 0) return "";
  const mods: string[] = [];
  const keys: string[] = [];
  for (const part of rawParts) {
    const lower = part.toLowerCase();
    if (lower === "cmdorctrl") mods.push("CmdOrCtrl");
    else if (lower === "ctrl" || lower === "control") mods.push("Control");
    else if (lower === "alt" || lower === "option") mods.push("Alt");
    else if (lower === "shift") mods.push("Shift");
    else if (lower === "cmd" || lower === "command" || lower === "meta" || lower === "super") mods.push("Meta");
    else if (part === "~" || part === "`" || lower === "backquote") keys.push("~");
    else if (part.length === 1) keys.push(part.toUpperCase());
    else keys.push(part);
  }
  mods.sort((a, b) => (MOD_ORDER[a] ?? 9) - (MOD_ORDER[b] ?? 9));
  const uniq: string[] = [];
  for (const m of mods) if (!uniq.includes(m)) uniq.push(m);
  return [...uniq, ...keys].join("+");
}

interface NormalizedBinding {
  needCmdOrCtrl: boolean;
  needMeta: boolean;
  needCtrl: boolean;
  needAlt: boolean;
  needShift: boolean;
  key: string;
  isBackquote: boolean;
}

function parseBindingForConflict(binding: string): NormalizedBinding | null {
  const parts = binding.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  let needCmdOrCtrl = false;
  let needMeta = false;
  let needCtrl = false;
  let needAlt = false;
  let needShift = false;
  const keys: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "cmdorctrl") needCmdOrCtrl = true;
    else if (lower === "cmd" || lower === "command" || lower === "meta" || lower === "super") needMeta = true;
    else if (lower === "ctrl" || lower === "control") needCtrl = true;
    else if (lower === "alt" || lower === "option") needAlt = true;
    else if (lower === "shift") needShift = true;
    else keys.push(part);
  }
  if (keys.length !== 1) return null;
  const key = keys[0];
  const isBackquote = key === "~" || key === "`" || key.toLowerCase() === "backquote";
  return { needCmdOrCtrl, needMeta, needCtrl, needAlt, needShift, key, isBackquote };
}

function ctrlMatches(p: NormalizedBinding, q: NormalizedBinding): boolean {
  if (p.needCmdOrCtrl) {
    if (!(q.needCmdOrCtrl || q.needCtrl || q.needMeta)) return false;
    if (p.needCtrl && !(q.needCtrl || q.needMeta)) return false;
    return true;
  }
  if (q.needCmdOrCtrl) {
    if (!(p.needCmdOrCtrl || p.needCtrl || p.needMeta)) return false;
    if (q.needCtrl && !(p.needCtrl || p.needMeta)) return false;
    return true;
  }
  return p.needCtrl === q.needCtrl && p.needMeta === q.needMeta;
}

export function bindingsConflict(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (normalizeBinding(a) === normalizeBinding(b)) return true;
  const pa = parseBindingForConflict(a);
  const pb = parseBindingForConflict(b);
  if (!pa || !pb) return false;
  if (!ctrlMatches(pa, pb)) return false;
  const keyA = pa.isBackquote ? "~" : pa.key.toLowerCase();
  const keyB = pb.isBackquote ? "~" : pb.key.toLowerCase();
  if (keyA !== keyB) return false;
  if (pa.needAlt !== pb.needAlt) return false;
  if (!pa.isBackquote && pa.needShift !== pb.needShift) return false;
  return true;
}

export function isSameChord(a: string, b: string, isMac = detectMac()): boolean {
  const pa = parseBindingForConflict(a);
  const pb = parseBindingForConflict(b);
  if (!pa || !pb) return false;
  const ctrl = (p: NormalizedBinding) =>
    p.needCtrl || (p.needCmdOrCtrl && !isMac);
  const meta = (p: NormalizedBinding) =>
    p.needMeta || (p.needCmdOrCtrl && isMac);
  if (ctrl(pa) !== ctrl(pb) || meta(pa) !== meta(pb)) return false;
  if (pa.needAlt !== pb.needAlt || pa.needShift !== pb.needShift) return false;
  const keyA = pa.isBackquote ? "~" : pa.key.toLowerCase();
  const keyB = pb.isBackquote ? "~" : pb.key.toLowerCase();
  return keyA === keyB;
}

export function bindingToDisplayParts(binding: string, isMac = detectMac()): string[] {
  return binding
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => formatHotkey(part, isMac));
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

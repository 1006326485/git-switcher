// The WebView's own context menu (Reload / Inspect Elements) has no Tauri
// config switch; cancelling the event's default action is the only way to
// suppress it. Editable fields are left alone so their Cut/Copy/Paste menu
// survives — that menu never contains Reload/Inspect.
const EDITABLE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export function installContextMenuGuard(target: Window = window): void {
  target.addEventListener(
    "contextmenu",
    (event) => {
      if (event.target instanceof Element && event.target.closest(EDITABLE)) return;
      event.preventDefault();
    },
    true,
  );
}

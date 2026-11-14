// Native spelling correction is always wrong in this app: the fields hold branch
// names, paths, refs and commit subjects, so WKWebView's red squiggles and
// macOS autocorrect only get in the way. `spellcheck` is a *content attribute*
// (there is no CSS property for it), so a single global default has to be
// written onto the element. Doing it here instead of repeating three JSX
// attributes at every call site keeps new inputs from silently reintroducing
// the squiggles.
//
// The default is applied only where the field has NOT spoken for itself: an
// explicit `spellCheck` attribute (true or false) always wins, so a field that
// genuinely wants correction can opt back in.
const SPELLCHECKABLE_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "url",
  "email",
  "password",
  "tel",
]);

// The markers WKWebView consults, in the order it consults them. `spellcheck`
// alone usually suffices, but macOS autocorrect/autocapitalize are driven by the
// legacy attributes, so all three are written together.
const OFF: ReadonlyArray<readonly [string, string]> = [
  ["spellcheck", "false"],
  ["autocorrect", "off"],
  ["autocapitalize", "off"],
];

const FIELDS = "input, textarea, [contenteditable]";

function isTypingSurface(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    // Checkboxes, ranges, date pickers and buttons never spellcheck.
    const type = element.getAttribute("type")?.toLowerCase() ?? "";
    return SPELLCHECKABLE_INPUT_TYPES.has(type);
  }
  const editable = element.getAttribute("contenteditable");
  return editable !== null && editable !== "false";
}

function disableSpelling(element: Element): void {
  for (const [name, value] of OFF) {
    // Respect a decision the field made for itself (either value).
    if (element.hasAttribute(name)) continue;
    element.setAttribute(name, value);
  }
}

function applyAll(root: ParentNode): void {
  for (const field of root.querySelectorAll(FIELDS)) {
    if (isTypingSurface(field)) disableSpelling(field);
  }
}

/**
 * Applies the spelling default to the current DOM and to every field added
 * later (dialogs, portals, terminal panes). Returns a disposer.
 */
export function installSpellingPolicy(target: Document = document): () => void {
  applyAll(target);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        // The root of the added subtree is checked directly: querySelectorAll
        // only matches descendants, and React attaches attributes before the
        // node is inserted.
        if (isTypingSurface(node)) disableSpelling(node);
        applyAll(node);
      }
    }
  });
  observer.observe(target.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

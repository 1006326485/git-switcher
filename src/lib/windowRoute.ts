export type WindowKind = "main" | "terminal";

/** Maps the webview URL query (`?window=terminal`) to the window to render. */
export function windowKindFromSearch(search: string): WindowKind {
  return new URLSearchParams(search).get("window") === "terminal" ? "terminal" : "main";
}

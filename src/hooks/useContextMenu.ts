import { useCallback, useMemo, useState } from "react";

export interface ContextMenuAnchor {
  x: number;
  y: number;
}

export function useContextMenu() {
  const [anchor, setAnchor] = useState<ContextMenuAnchor | null>(null);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    // No text-selection guard: the WebView's native menu is suppressed
    // globally (lib/contextMenuGuard), so deferring to it would leave the
    // user with no menu at all. Every panel menu ships its own Copy item.
    e.preventDefault();
    setAnchor({ x: e.clientX, y: e.clientY });
  }, []);

  const close = useCallback(() => setAnchor(null), []);

  const menuProps = useMemo(
    () => ({
      open: anchor !== null,
      anchor: anchor ?? { x: 0, y: 0 },
      onClose: close,
    }),
    [anchor, close]
  );

  return { anchor, onContextMenu, close, menuProps };
}

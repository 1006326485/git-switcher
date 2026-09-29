import { useState, useRef, useEffect, useCallback, memo } from "react";
import { createPortal } from "react-dom";

interface HoverTooltipProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  visible: boolean;
  children: React.ReactNode;
  offset?: number;
  showDelay?: number;
}

const ARROW_SIZE = 6;
const VIEWPORT_PAD = 8;

const arrowBase: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  transform: "translateX(-50%)",
  width: 0,
  height: 0,
  borderLeft: `${ARROW_SIZE}px solid transparent`,
  borderRight: `${ARROW_SIZE}px solid transparent`,
};

export const HoverTooltip = memo(function HoverTooltip({
  anchorRef,
  visible,
  children,
  offset = 8,
  showDelay = 500,
}: HoverTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShown(false);
      return;
    }
    let timer = 0;
    const start = () => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        setShown(true);
      }, showDelay);
    };
    const cancel = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
      setShown(false);
    };
    start();
    // 弹窗等覆盖锚点时不会触发 mouseleave，靠指针位置判断 hover 是否仍有效
    const anchor = anchorRef.current;
    const onPointerMove = () => {
      if (anchor?.matches(":hover")) start();
      else cancel();
    };
    document.addEventListener("pointermove", onPointerMove, true);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("pointermove", onPointerMove, true);
    };
  }, [visible, showDelay, anchorRef]);
  const [pos, setPos] = useState<{ top: number; left: number; placement: "top" | "bottom" }>({
    top: 0,
    left: 0,
    placement: "top",
  });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;

    const rect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;

    let placement: "top" | "bottom" = "top";
    let top = rect.top - tooltipRect.height - ARROW_SIZE - offset;
    if (top < VIEWPORT_PAD) {
      placement = "bottom";
      top = rect.bottom + ARROW_SIZE + offset;
    }

    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    left = Math.max(VIEWPORT_PAD, Math.min(left, vw - tooltipRect.width - VIEWPORT_PAD));

    setPos({ top: top + window.scrollY, left: left + window.scrollX, placement });
  }, [anchorRef, offset]);

  useEffect(() => {
    if (!shown) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [shown, updatePosition]);

  if (!shown) return null;

  const arrowStyle: React.CSSProperties =
    pos.placement === "top"
      ? { ...arrowBase, bottom: -ARROW_SIZE, borderTop: `${ARROW_SIZE}px solid var(--tooltip-bg)` }
      : { ...arrowBase, top: -ARROW_SIZE, borderBottom: `${ARROW_SIZE}px solid var(--tooltip-bg)` };

  return createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      style={{
        position: "fixed",
        zIndex: 30,
        pointerEvents: "none",
        top: pos.top,
        left: pos.left,
        animation: "tooltipFadeIn 0.12s ease-out",
      }}
    >
      <div
        style={{
          position: "relative",
          padding: "8px 12px",
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.5,
          maxWidth: 280,
          backgroundColor: "var(--tooltip-bg, #1f2937)",
          color: "var(--tooltip-fg, #f3f4f6)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          border: "1px solid var(--tooltip-muted, rgba(255,255,255,0.08))",
        }}
      >
        <div style={arrowStyle} />
        {children}
      </div>
    </div>,
    document.body,
  );
});

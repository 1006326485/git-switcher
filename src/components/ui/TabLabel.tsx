import { useEffect, useRef, useState } from "react";
import { truncateMiddle, type MeasureText } from "../../lib/tabLabel";

/**
 * One canvas for the whole app: measuring text in the DOM would need a hidden
 * node per call, and a canvas context is the cheapest way to ask "how wide is
 * this string in this font" without touching layout.
 */
let measuringContext: CanvasRenderingContext2D | null | undefined;

function textMeasurer(font: string): MeasureText | null {
  if (measuringContext === undefined) {
    measuringContext =
      typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  }
  const context = measuringContext;
  if (!context) return null;
  let applied = "";
  return (text: string) => {
    if (applied !== font) {
      context.font = font;
      applied = font;
    }
    return context.measureText(text).width;
  };
}

interface TabLabelProps {
  text: string;
  className?: string;
}

/**
 * A tab title that adapts to the (fixed) width of its tab: the middle is
 * elided so the leading context and the trailing job name both stay readable.
 * The parent reveals the full title on hover (`data-truncated` says whether
 * anything was cut), so this never sets a native `title`: that would stack a
 * second tooltip under the app's own.
 */
export function TabLabel({ text, className }: TabLabelProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(text);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      // No width yet (first paint) or no layout at all (jsdom): show it whole.
      // Checking this first also keeps the canvas out of environments that
      // stub one out, so nothing logs a "getContext not implemented" warning.
      const width = el.clientWidth;
      if (!(width > 0)) {
        setShown((prev) => (prev === text ? prev : text));
        return;
      }
      const style = window.getComputedStyle(el);
      const measure = textMeasurer(`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`);
      const next = measure ? truncateMiddle(text, width, measure) : text;
      setShown((prev) => (prev === next ? prev : next));
    };

    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  const truncated = shown !== text;
  return (
    <span
      ref={ref}
      className={className}
      data-truncated={truncated ? "" : undefined}
    >
      {shown}
    </span>
  );
}

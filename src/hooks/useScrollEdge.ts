import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * rAF when the environment has it (all real browsers), a timer as the fallback
 * so jsdom-like test environments without layout still flush scroll updates.
 */
function nextFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(callback);
  else setTimeout(callback, 16);
}

/**
 * Reports whether a scroll container has scrolled past a small threshold.
 * Used for scroll-edge effects: chrome (header) shows a soft gradient only
 * while content actually moves beneath it — no hard 1px dividers.
 *
 * Perf: rAF-coalesced, passive listener, and the state is a boolean —
 * React bails out of re-renders when the value doesn't change.
 */
export function useScrollEdge(
  ref: RefObject<HTMLElement | null>,
  threshold = 8
): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let ticking = false;
    const update = () => {
      ticking = false;
      setScrolled(el.scrollTop > threshold);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      nextFrame(update);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref, threshold]);

  return scrolled;
}

interface HorizontalScrollState {
  overflow: boolean;
  atStart: boolean;
  atEnd: boolean;
}

const HORIZONTAL_AT_EDGE: HorizontalScrollState = {
  overflow: false,
  atStart: true,
  atEnd: true,
};

/**
 * Tracks a horizontal scroll strip so its chrome can be progressive: edge
 * fades and scroll arrows appear only when the content actually overflows and
 * can still move in that direction. This is the horizontal companion to
 * useScrollEdge above — an overflow strip that hides its scrollbar needs an
 * explicit affordance, or off-screen items become undiscoverable.
 *
 * Perf: the returned state is three booleans, so React bails out of re-renders
 * when nothing changed. Measurement is rAF-coalesced like useScrollEdge.
 */
export function useHorizontalScroll(ref: RefObject<HTMLElement | null>) {
  const [state, setState] = useState<HorizontalScrollState>(HORIZONTAL_AT_EDGE);
  const metrics = useRef({ left: 0, max: 0, clientWidth: 0 });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    metrics.current = { left, max, clientWidth: el.clientWidth };
    setState({
      overflow: max > 1,
      atStart: left <= 1,
      atEnd: left >= max - 1,
    });
  }, [ref]);

  useLayoutEffect(() => {
    update();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, update]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      nextFrame(() => {
        ticking = false;
        update();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref, update]);

  const scrollBy = useCallback(
    (direction: -1 | 1) => {
      const el = ref.current;
      if (!el) return;
      const { clientWidth } = metrics.current;
      el.scrollBy({
        left: direction * Math.max(120, Math.round(clientWidth * 0.75)),
        behavior: "smooth",
      });
    },
    [ref]
  );

  return { ...state, scrollBy };
}

import { useEffect, useState } from "react";
import type { RefObject } from "react";

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
      requestAnimationFrame(update);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref, threshold]);

  return scrolled;
}

import { createContext, useContext, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

// ── Scroll Parent Context ────────────────────────────────────────────────
// The <main> element in App.tsx is the scroll container for all views.
// We share its ref via context so virtual lists can bind to it.

const ScrollParentContext = createContext<RefObject<HTMLElement | null>>({ current: null });

export const ScrollParentProvider = ScrollParentContext.Provider;

// ── useVirtualList ───────────────────────────────────────────────────────
// Reusable hook for virtualizing a list of items.
// Only activates virtualization when count exceeds the threshold.

interface UseVirtualListOptions {
  count: number;
  estimateSize: number; // estimated row height in px
  overscan?: number;
  threshold?: number; // min items before virtualization kicks in (default 50)
}

export function useVirtualList({ count, estimateSize, overscan = 5, threshold = 50 }: UseVirtualListOptions) {
  const scrollParentRef = useContext(ScrollParentContext);
  const enabled = count > threshold;

  const virtualizer = useVirtualizer({
    count: enabled ? count : 0,
    estimateSize: () => estimateSize,
    overscan,
    getScrollElement: () => scrollParentRef.current,
  });

  return { virtualizer, enabled };
}

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface UseSortableRowOptions {
  id: string;
  sortable?: boolean;
}

export function useSortableRow({ id, sortable = true }: UseSortableRowOptions) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useSortable({ id, disabled: !sortable });

  const style = {
    transform: CSS.Transform.toString(transform),
    // The dragged card follows the pointer 1:1 — never let a transition
    // gate it (fluid interfaces: no latency on the input path).
    // Settling siblings use a damped spring curve instead of dnd-kit's
    // default linear transform.
    transition: isDragging ? "none" : "transform 260ms var(--ease-spring)",
    opacity: isDragging ? 0.5 : 1,
  };

  return { attributes, listeners, setNodeRef, style, isDragging };
}

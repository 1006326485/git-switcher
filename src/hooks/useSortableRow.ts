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
    transition,
    isDragging,
  } = useSortable({ id, disabled: !sortable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return { attributes, listeners, setNodeRef, style, isDragging };
}

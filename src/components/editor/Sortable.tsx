"use client";

import type { ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HandleProps {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  isDragging: boolean;
}

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  children,
  grid,
}: {
  items: T[];
  onReorder: (next: T[]) => void;
  children: (item: T, handle: HandleProps, index: number) => ReactNode;
  grid?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((i) => i.id === e.active.id);
    const to = items.findIndex((i) => i.id === e.over!.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}>
        {items.map((item, i) => (
          <SortableRow key={item.id} id={item.id}>
            {(h) => children(item, h, i)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }: { id: string; children: (h: HandleProps) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 20 : undefined, position: "relative" }}
      className={cn(isDragging && "opacity-90 [&>*]:shadow-lg")}
    >
      {children({ attributes, listeners, isDragging })}
    </div>
  );
}

export function DragHandle({ handle, label, className }: { handle: HandleProps; label: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn("flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg active:cursor-grabbing", className)}
      {...handle.attributes}
      {...handle.listeners}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
}

export function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  return arrayMove(arr, from, to);
}

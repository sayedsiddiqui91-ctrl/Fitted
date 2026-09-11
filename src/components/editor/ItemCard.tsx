"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ChevronDown, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/Button";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { DragHandle, type HandleProps } from "./Sortable";

interface Props {
  title: string;
  subtitle?: string;
  placeholder: string;
  handle: HandleProps;
  defaultOpen?: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  children: ReactNode;
}

/** Collapsible list item with drag handle + actions (duplicate, move, delete). */
export function ItemCard({ title, subtitle, placeholder, handle, defaultOpen = false, onDuplicate, onDelete, onMoveUp, onMoveDown, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-surface transition-shadow">
      <div className="flex items-center gap-1 py-1.5 pl-1 pr-1.5">
        <DragHandle handle={handle} label={`Reorder ${title || placeholder}`} />
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left">
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-sm font-medium", !title && "text-subtle")}>{title || placeholder}</span>
            {subtitle && <span className="block truncate text-xs text-subtle">{subtitle}</span>}
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-subtle transition-transform duration-200", open && "rotate-180")} aria-hidden />
        </button>
        <Menu
          trigger={
            <IconButton label="Item actions" size="sm" tooltip={false}>
              <MoreHorizontal className="size-4" />
            </IconButton>
          }
        >
          <MenuItem icon={<Copy />} onSelect={onDuplicate}>
            Duplicate
          </MenuItem>
          {onMoveUp && (
            <MenuItem icon={<ArrowUp />} onSelect={onMoveUp}>
              Move up
            </MenuItem>
          )}
          {onMoveDown && (
            <MenuItem icon={<ArrowDown />} onSelect={onMoveDown}>
              Move down
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} danger onSelect={onDelete}>
            Delete
          </MenuItem>
        </Menu>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="border-t border-border px-3 pb-4 pt-3.5 sm:px-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Side panel on desktop, bottom sheet on mobile. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  footer,
  width = "sm:max-w-md",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-black/30 data-[state=open]:animate-[fade-in_160ms_ease-out] sm:bg-black/20" />
        <D.Content
          className={cn(
            "fixed z-[61] flex flex-col border-border bg-surface shadow-lg focus:outline-none",
            "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t data-[state=open]:animate-[sheet-in_280ms_cubic-bezier(0.22,1,0.36,1)]",
            "sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:rounded-none sm:border-l sm:border-t-0 sm:data-[state=open]:animate-[slide-in-right_280ms_cubic-bezier(0.22,1,0.36,1)]",
            width,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong sm:hidden" aria-hidden />
          <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
            {icon && <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-fg [&>svg]:size-4">{icon}</span>}
            <div className="min-w-0 flex-1">
              <D.Title className="text-[15px] font-semibold">{title}</D.Title>
              <D.Description className={description ? "text-xs text-subtle" : "sr-only"}>{description ?? title}</D.Description>
            </div>
            <D.Close className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

"use client";

import type { ReactNode } from "react";
import { DropdownMenu as M } from "radix-ui";
import { cn } from "@/lib/utils";

export function Menu({ trigger, children, align = "end" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" | "center" }) {
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={align}
          sideOffset={6}
          className="z-[70] min-w-48 rounded-xl border border-border bg-surface p-1 shadow-lg data-[state=open]:animate-[menu-in_140ms_cubic-bezier(0.22,1,0.36,1)]"
        >
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function MenuItem({ icon, children, onSelect, danger, disabled, hint }: { icon?: ReactNode; children: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: string }) {
  return (
    <M.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        danger ? "text-danger data-[highlighted]:bg-danger-soft" : "text-fg data-[highlighted]:bg-surface-2",
      )}
    >
      {icon && <span className="text-subtle [&>svg]:size-4" aria-hidden>{icon}</span>}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </M.Item>
  );
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <M.Label className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-subtle">{children}</M.Label>;
}

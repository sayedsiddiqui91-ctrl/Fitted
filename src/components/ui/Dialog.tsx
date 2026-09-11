"use client";

import { useState, type ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Render as a bottom sheet on small screens */
  sheetOnMobile?: boolean;
  className?: string;
}

const sizes = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

export function Dialog({ open, onOpenChange, title, description, children, footer, size = "md", sheetOnMobile = true, className }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_160ms_ease-out] data-[state=closed]:animate-[fade-out_120ms_ease-in]" />
        <D.Content
          className={cn(
            "fixed z-[61] flex max-h-[92dvh] w-full flex-col overflow-hidden border border-border bg-surface shadow-lg focus:outline-none",
            sheetOnMobile
              ? "inset-x-0 bottom-0 rounded-t-2xl data-[state=open]:animate-[sheet-in_260ms_cubic-bezier(0.22,1,0.36,1)] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-[state=open]:animate-[dialog-in_200ms_cubic-bezier(0.22,1,0.36,1)]"
              : "left-1/2 top-1/2 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl data-[state=open]:animate-[dialog-in_200ms_cubic-bezier(0.22,1,0.36,1)]",
            sizes[size],
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <D.Title className="text-base font-semibold tracking-tight">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-sm text-muted">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close className="-mr-2 -mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
          {children && <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>}
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-2/50 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

interface ConfirmProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, danger, onConfirm }: ConfirmProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

/** Small prompt dialog for rename / name inputs. */
export function PromptDialog({
  open,
  onOpenChange,
  title,
  label,
  initial,
  confirmLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  label: string;
  initial: string;
  confirmLabel: string;
  onSubmit: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setValue(initial);
  }
  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value.trim());
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!value.trim()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="mb-1.5 block text-[13px] font-medium text-muted" htmlFor="prompt-input">
          {label}
        </label>
        <input
          id="prompt-input"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={80}
          className="h-11 w-full rounded-[10px] border border-border bg-surface px-3 text-[15px] shadow-sm focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 sm:h-10 sm:text-sm"
        />
      </form>
    </Dialog>
  );
}

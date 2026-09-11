"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Tooltip } from "radix-ui";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent-soft" | "dark";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover shadow-sm",
  dark: "bg-fg text-bg hover:opacity-90 shadow-sm",
  secondary: "bg-surface text-fg border border-border hover:bg-surface-2 hover:border-border-strong shadow-sm",
  ghost: "text-muted hover:text-fg hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
  "accent-soft": "bg-accent-soft text-accent-soft-fg hover:brightness-95 dark:hover:brightness-125",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-[10px]",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, iconRight, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,border-color,color,opacity,transform,box-shadow] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "sm" | "md";
  tooltip?: boolean;
  variant?: "ghost" | "secondary";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", tooltip = true, variant = "ghost", className, children, type = "button", ...rest },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "size-8" : "size-10",
        variant === "ghost" ? "text-muted hover:bg-surface-2 hover:text-fg" : "border border-border bg-surface text-fg hover:bg-surface-2",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
  if (!tooltip) return btn;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{btn}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} className="z-[80] rounded-md bg-fg px-2 py-1 text-xs font-medium text-bg shadow-md">
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
});

export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} className="z-[80] max-w-72 rounded-lg bg-fg px-3 py-2 text-xs leading-relaxed text-bg shadow-md">
          {content}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

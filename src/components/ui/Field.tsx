"use client";

import { forwardRef, useCallback, useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-[10px] border border-border bg-surface px-3 text-[15px] sm:text-sm text-fg placeholder:text-subtle shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-border-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(base, "h-11 sm:h-10", className)} {...rest} />;
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoGrow?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, autoGrow = true, onInput, value, ...rest }, forwarded) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const resize = useCallback(() => {
    const el = inner.current;
    if (!el || !autoGrow) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [autoGrow]);
  useEffect(resize, [value, resize]);
  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        if (typeof forwarded === "function") forwarded(el);
        else if (forwarded) forwarded.current = el;
      }}
      value={value}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      className={cn(base, "min-h-20 resize-none py-2.5 leading-relaxed", className)}
      {...rest}
    />
  );
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(base, "h-11 appearance-none pr-9 sm:h-10", className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
  optional?: boolean;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}

/** Visible label + helper/error text wired up for screen readers. */
export function Field({ label, hint, error, className, optional, children }: FieldProps) {
  const id = useId();
  const descId = hint || error ? `${id}-desc` : undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-muted">
        {label}
        {optional && <span className="ml-1 font-normal text-subtle">(optional)</span>}
      </label>
      {children({ id, "aria-describedby": descId, "aria-invalid": error ? true : undefined })}
      {(error || hint) && (
        <p id={descId} className={cn("text-xs", error ? "text-danger" : "text-subtle")} role={error ? "alert" : undefined}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200", checked ? "bg-accent" : "bg-surface-3")}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-200", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

export function Range({ value, min, max, step, onChange, label, format }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; format?: (v: number) => string }) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[13px] font-medium text-muted">
          {label}
        </label>
        <span className="font-mono text-xs tabular-nums text-subtle">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill" as string]: `${fill}%` }}
      />
    </div>
  );
}

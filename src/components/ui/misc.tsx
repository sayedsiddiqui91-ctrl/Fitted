"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "success" | "warning" | "danger"; className?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-muted border-border",
    accent: "bg-accent-soft text-accent-soft-fg border-transparent",
    success: "bg-success-soft text-success border-transparent",
    warning: "bg-warning-soft text-warning border-transparent",
    danger: "bg-danger-soft text-danger border-transparent",
  };
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4", tones[tone], className)}>{children}</span>;
}

export function Segmented<T extends string>({ value, onChange, options, label, size = "md", className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: ReactNode }[]; label: string; size?: "sm" | "md"; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-[10px] border border-border bg-surface-2 p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              active ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {active && <span className="absolute inset-0 rounded-lg bg-surface shadow-sm ring-1 ring-border" />}
            <span className="relative flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function scoreTone(n: number) {
  if (n >= 80) return { color: "var(--success)", label: "Strong match" };
  if (n >= 60) return { color: "var(--accent)", label: "Good match" };
  if (n >= 40) return { color: "var(--warning)", label: "Partial match" };
  return { color: "var(--danger)", label: "Low match" };
}

/** Animated circular score (counts up once). */
export function ScoreRing({ value, size = 132, stroke = 10, label, sublabel }: { value: number; size?: number; stroke?: number; label?: string; sublabel?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(value);
      return;
    }
    // Count up over ~1.1s. A score is a fact, not decoration: if animation frames are throttled (a
    // background tab, a busy phone) the timeout below still puts the real number on screen.
    const from = 0;
    const start = performance.now();
    const DURATION = 1100;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const settle = window.setTimeout(() => setShown(value), 1400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
  }, [value]);
  const tone = scoreTone(value);
  const display = shown;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label ?? "Score"}: ${value} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone.color} strokeWidth={stroke} strokeLinecap="round" style={{ strokeDasharray: `${(display / 100) * c} ${c}` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-semibold tabular-nums tracking-tight" style={{ fontSize: size * 0.27 }}>
          {display}
        </span>
        {sublabel && <span className="text-[11px] text-subtle">{sublabel}</span>}
      </div>
    </div>
  );
}

export function Bar({ value, label, note }: { value: number; label: string; note?: string }) {
  const tone = scoreTone(value);
  // Grow from zero on the first paint after mount, in CSS
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setGrown(true), 20);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums">{note ?? `${value}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ background: tone.color, width: `${grown ? value : 0}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong/70 px-6 py-12 text-center", className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg [&>svg]:size-6">{icon}</div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-subtle">{children}</kbd>;
}

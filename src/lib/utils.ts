import { twMerge } from "tailwind-merge";

/** Joins class names and resolves Tailwind conflicts (last one wins), so a caller's `hidden` or `w-32`
    reliably overrides a component's own `inline-flex` / `w-full` regardless of CSS order. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(" "));
}

export function uid(prefix = ""): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return prefix ? `${prefix}_${rand}` : rand;
}

export function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function relativeTime(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const today = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  const diffMin = Math.round((now - ts) / 60_000);
  if (days === 0) {
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    return "Today";
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function isNonEmpty(s: string | undefined | null): s is string {
  return !!s && s.trim().length > 0;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Human-friendly error message; never leaks stack traces. */
export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err && typeof err === "object" && "userMessage" in err && typeof (err as { userMessage: unknown }).userMessage === "string") {
    return (err as { userMessage: string }).userMessage;
  }
  return fallback;
}

export class UserFacingError extends Error {
  userMessage: string;
  constructor(userMessage: string) {
    super(userMessage);
    this.userMessage = userMessage;
  }
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Fades a block in when it scrolls into view. Plain CSS + one observer — no animation library on the
    landing page, which is the first thing a visitor's phone has to download and run. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "-60px" },
    );
    io.observe(el);
    // Content must never be stuck invisible because an observer didn't fire (a restored tab, an
    // unusual browser, a page that never got laid out). After a moment, show it regardless.
    const failsafe = window.setTimeout(() => setShown(true), 1500);
    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, [shown]);

  return (
    <div ref={ref} className={cn("reveal", shown && "is-in", className)} style={delay ? ({ ["--reveal-delay" as string]: `${delay}s` } as React.CSSProperties) : undefined}>
      {children}
    </div>
  );
}

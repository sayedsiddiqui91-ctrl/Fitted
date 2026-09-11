"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Staged progress for AI work: shows meaningful steps instead of a blank spinner. */
export function StagedProgress({ title, steps, done = false }: { title: string; steps: string[]; done?: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), 420);
    return () => clearInterval(t);
  }, [steps.length]);
  const current = done ? steps.length : i;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-md" role="status" aria-live="polite">
      <p className="mb-5 text-[15px] font-semibold">{title}</p>
      <ol className="flex flex-col gap-3.5">
        {steps.map((s, k) => (
          <li key={s} className={cn("flex items-center gap-3 text-sm transition-colors duration-300", k <= current ? "text-fg" : "text-subtle")}>
            <span className="flex size-5 items-center justify-center">
              {k < current ? (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex size-5 items-center justify-center rounded-full bg-success-soft">
                  <Check className="size-3.5 text-success" aria-hidden />
                </motion.span>
              ) : k === current ? (
                <Loader2 className="size-4 animate-spin text-accent" aria-hidden />
              ) : (
                <span className="size-1.5 rounded-full bg-border-strong" />
              )}
            </span>
            {s}
          </li>
        ))}
      </ol>
    </motion.div>
  );
}

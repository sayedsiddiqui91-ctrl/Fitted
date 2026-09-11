"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Copy, FilePlus2, LayoutTemplate, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { mode: "scratch", icon: FilePlus2, title: "Build from scratch", text: "Create a new CV section by section with live preview.", cta: "Create CV" },
  { mode: "import", icon: Upload, title: "Import existing CV", text: "Upload a PDF, DOCX or TXT. We'll fill in the builder for you.", cta: "Import CV" },
  { mode: "template", icon: LayoutTemplate, title: "Start with a template", text: "Pick a professional, ATS-friendly design first.", cta: "Choose template" },
] as const;

export function StartOptions({ showCopy = false, compact = false }: { showCopy?: boolean; compact?: boolean }) {
  const opts = showCopy ? [...OPTIONS, { mode: "copy", icon: Copy, title: "Reuse a saved CV", text: "Start a new version from one of your CVs. The original stays unchanged.", cta: "Pick a CV" } as const] : OPTIONS;
  return (
    <div className={cn("grid gap-3 sm:gap-4", opts.length === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3")}>
      {opts.map((o, i) => (
        <motion.div key={o.mode} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
          <Link
            href={`/app/new?mode=${o.mode}`}
            className={cn(
              "group flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md",
              compact ? "sm:p-5" : "sm:p-6",
            )}
          >
            <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg transition-transform duration-200 group-hover:scale-105">
              <o.icon className="size-5" aria-hidden />
            </span>
            <span className="text-[15px] font-semibold">{o.title}</span>
            <span className="mt-1 flex-1 text-sm leading-relaxed text-muted">{o.text}</span>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
              {o.cta}
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

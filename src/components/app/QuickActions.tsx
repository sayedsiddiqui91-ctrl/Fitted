"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ClipboardCheck, FilePen, FilePlus2, Sparkles, Upload } from "lucide-react";

const ACTIONS = [
  { href: "/app/new", icon: FilePlus2, title: "Create New CV", text: "Build from scratch or a template" },
  { href: "/app/new?mode=import", icon: Upload, title: "Import Existing CV", text: "Upload PDF, DOCX or TXT" },
  { href: "/app/new?mode=import&review=1", icon: ClipboardCheck, title: "Review My CV", text: "Get a score + smart fixes" },
  { href: "/app/pdf", icon: FilePen, title: "Edit PDF", text: "Quick changes to an existing PDF" },
  { href: "/app/optimize", icon: Sparkles, title: "Optimize for Job", text: "Tailor a CV to an opportunity" },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {ACTIONS.map((a, i) => (
        <motion.div key={a.href} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
          <Link href={a.href} className="group flex h-full items-start gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md sm:p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg transition-transform group-hover:scale-105">
              <a.icon className="size-[18px]" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{a.title}</span>
              <span className="mt-0.5 block text-xs leading-snug text-subtle">{a.text}</span>
            </span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

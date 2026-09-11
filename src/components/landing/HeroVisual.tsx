"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { CheckCircle2, Circle, ShieldCheck, XCircle } from "lucide-react";
import { sampleContent, DEFAULT_DESIGN, DEFAULT_ORDER, TEMPLATE_DESIGN_DEFAULTS } from "@/lib/cv/defaults";
import { TEMPLATE_DEFS } from "@/lib/cv/templates";
import { CVThumbnail } from "@/components/cv/CVPreview";
import { ScoreRing } from "@/components/ui/misc";

const ease = [0.22, 1, 0.36, 1] as const;

/** Animated product preview built from real app components (no screenshots). */
export function HeroVisual() {
  const doc = useMemo(() => ({ content: sampleContent(), layout: { order: DEFAULT_ORDER, hidden: [], titles: {} }, design: { ...DEFAULT_DESIGN } }), []);
  return (
    <div className="relative mx-auto h-[440px] w-full max-w-[560px] sm:h-[500px]" aria-hidden>
      <motion.div
        initial={{ opacity: 0, y: 30, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: -2 }}
        transition={{ duration: 0.8, ease }}
        className="absolute left-1/2 top-2 -translate-x-[62%] overflow-hidden rounded-md shadow-paper ring-1 ring-black/5 sm:-translate-x-[70%]"
      >
        <CVThumbnail doc={doc} width={300} />
      </motion.div>

      {/* Score card */}
      <motion.div initial={{ opacity: 0, x: 30, y: 10 }} animate={{ opacity: 1, x: 0, y: 0 }} transition={{ duration: 0.7, delay: 0.35, ease }} className="absolute right-0 top-6 w-52 rounded-2xl border border-border bg-surface/95 p-4 shadow-lg backdrop-blur sm:right-2">
        <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
          <p className="text-xs font-medium text-muted">Job Match Score</p>
          <div className="mt-2 flex items-center gap-3">
            <ScoreRing value={86} size={68} stroke={7} label="Job match" />
            <div className="text-xs">
              <p className="text-subtle line-through">64</p>
              <p className="font-semibold text-success">+22 after review</p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Keywords card */}
      <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.55, ease }} className="absolute right-0 top-[188px] w-56 rounded-2xl border border-border bg-surface/95 p-4 shadow-lg backdrop-blur sm:right-6">
        <p className="mb-2 text-xs font-medium text-muted">Keyword insights</p>
        {[
          { icon: CheckCircle2, c: "text-success", t: "Financial analysis" },
          { icon: CheckCircle2, c: "text-success", t: "Advanced Excel" },
          { icon: Circle, c: "text-warning", t: "Forecasting — ask first" },
          { icon: XCircle, c: "text-danger", t: "Power BI — not added" },
        ].map((k, i) => (
          <motion.p key={k.t} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 + i * 0.12, ease }} className="flex items-center gap-2 py-0.5 text-[13px]">
            <k.icon className={`size-3.5 ${k.c}`} /> {k.t}
          </motion.p>
        ))}
      </motion.div>

      {/* Before / after */}
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.8, ease }} className="absolute bottom-0 left-0 right-6 rounded-2xl border border-border bg-surface/95 p-4 shadow-lg backdrop-blur sm:left-4 sm:right-16">
        <motion.div animate={{ y: [0, 4, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-success">
            <ShieldCheck className="size-3.5" /> FACT · based on your CV
          </div>
          <p className="text-[13px] text-subtle line-through decoration-danger/50">Responsible for invoice processing and vendor payments for 120+ suppliers.</p>
          <p className="mt-1 text-[13px] font-medium">
            <span className="rounded bg-success-soft px-0.5 text-success">Managed</span> invoice processing and vendor payments for 120+ suppliers.
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}

export function TemplateStrip() {
  const content = useMemo(() => sampleContent(), []);
  const layout = { order: ["summary", "experience", "education", "skills", "certifications", "languages"], hidden: [], titles: {} };
  return (
    <div className="scroll-thin -mx-4 flex snap-x gap-5 overflow-x-auto px-4 pb-4 sm:mx-0">
      {TEMPLATE_DEFS.map((t, i) => (
        <motion.div key={t.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(i, 6) * 0.06, duration: 0.5, ease }} className="shrink-0 snap-start">
          <div className="overflow-hidden rounded-md shadow-md ring-1 ring-black/5 transition-transform duration-300 hover:-translate-y-1.5">
            <CVThumbnail doc={{ content, layout, design: { ...DEFAULT_DESIGN, ...TEMPLATE_DESIGN_DEFAULTS[t.id], template: t.id } }} width={180} />
          </div>
          <p className="mt-3 text-center text-sm font-medium">{t.name}</p>
          <p className="text-center text-xs text-subtle">{t.atsFriendly ? "ATS-friendly" : "Visual"}</p>
        </motion.div>
      ))}
    </div>
  );
}

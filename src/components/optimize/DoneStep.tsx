"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Briefcase, Check, FileDown, Mic, PenLine, RotateCcw } from "lucide-react";
import type { CVDoc } from "@/lib/cv/schema";
import { useStore } from "@/lib/store";
import { downloadPdf, pdfOutcomeMessage } from "@/lib/export/pdf";
import { Button } from "@/components/ui/Button";
import { scoreTone } from "@/components/ui/misc";

export function DoneStep({ version, original, scoreBefore, scoreAfter, onRestart }: { version: CVDoc; original: CVDoc; scoreBefore: number; scoreAfter: number; onRestart: () => void }) {
  const upsertApplication = useStore((s) => s.upsertApplication);
  const [tracked, setTracked] = useState(false);
  const [exporting, setExporting] = useState(false);
  const jt = version.jobTarget;

  return (
    <div className="mx-auto max-w-xl text-center">
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }} className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-success-soft">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15, type: "spring", stiffness: 400, damping: 15 }}>
          <Check className="size-8 text-success" strokeWidth={2.5} aria-hidden />
        </motion.span>
      </motion.div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your tailored CV is ready</h1>
      <p className="mt-2 text-muted">
        Saved as <b className="font-medium text-fg">“{version.name}”</b>. Your original “{original.name}” is unchanged.
      </p>

      <div className="mx-auto mt-6 flex max-w-xs items-center justify-center gap-6 rounded-2xl border border-border bg-surface p-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-subtle">Before</p>
          <p className="text-2xl font-semibold tabular-nums text-muted">{scoreBefore}</p>
        </div>
        <span className="text-subtle" aria-hidden>
          →
        </span>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-subtle">After</p>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: scoreTone(scoreAfter).color }}>
            {scoreAfter}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-subtle">Estimated job match score</p>

      <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
        <Link href={`/app/cv/${version.id}`}>
          <Button variant="primary" size="lg" className="w-full" icon={<PenLine className="size-4" />}>
            Open tailored CV
          </Button>
        </Link>
        <Button
          size="lg"
          className="w-full"
          loading={exporting}
          icon={<FileDown className="size-4" />}
          onClick={async () => {
            setExporting(true);
            const msg = pdfOutcomeMessage(await downloadPdf(version));
            setExporting(false);
            if (msg.tone === "success") toast.success(msg.title, { description: msg.description });
            else toast(msg.title, { description: msg.description, duration: 9000 });
          }}
        >
          Download PDF
        </Button>
        <Link href={`/app/cv/${version.id}/interview`}>
          <Button size="lg" className="w-full" icon={<Mic className="size-4" />}>
            Prepare me for this job
          </Button>
        </Link>
        <Button
          size="lg"
          className="w-full"
          disabled={tracked}
          icon={tracked ? <Check className="size-4" /> : <Briefcase className="size-4" />}
          onClick={() => {
            upsertApplication({ company: jt?.company || "Company", title: jt?.title || "Role", cvId: version.id, status: "saved" });
            setTracked(true);
            toast.success("Added to your applications", { action: { label: "View", onClick: () => (window.location.href = "/app/tracker") } });
          }}
        >
          {tracked ? "Tracking this application" : "Track this application"}
        </Button>
      </div>
      <Button variant="ghost" className="mt-6" icon={<RotateCcw className="size-4" />} onClick={onRestart}>
        Optimize for another job
      </Button>
    </div>
  );
}

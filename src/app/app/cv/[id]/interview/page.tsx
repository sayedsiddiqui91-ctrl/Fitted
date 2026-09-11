"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ChevronDown, Cpu, HelpCircle, Lightbulb, Mic, Printer, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useCV, useStore } from "@/lib/store";
import type { EngineKind, InterviewPrep, InterviewQuestion } from "@/lib/ai/types";
import { analyzeJob, interviewPrep, withMinDuration } from "@/lib/ai/client";
import { calculateJobMatch } from "@/lib/engine/match";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/misc";
import { StagedProgress } from "@/components/optimize/Progress";

const SECTIONS: { key: keyof Omit<InterviewPrep, "askThem">; title: string; desc: string }[] = [
  { key: "technical", title: "Technical & role questions", desc: "Based on the skills and responsibilities in the job" },
  { key: "experience", title: "Questions about your experience", desc: "Interviewers will dig into what's on your CV" },
  { key: "behavioral", title: "Behavioral questions", desc: "Answer with real examples using STAR" },
  { key: "gaps", title: "Questions about gaps", desc: "Requirements your CV doesn't show — be honest" },
];

export default function InterviewPage() {
  const { id } = useParams<{ id: string }>();
  const doc = useCV(id);
  const session = useStore((s) => (doc?.parentId ? s.sessions[doc.parentId] : undefined) ?? (id ? s.sessions[id] : undefined));
  const [prep, setPrep] = useState<InterviewPrep | null>(null);
  const [engine, setEngine] = useState<EngineKind>("local");
  const [loading, setLoading] = useState(false);
  const jobText = doc?.jobTarget?.description ?? session?.jobText ?? "";

  const generate = useCallback(async () => {
    if (!doc || !jobText) return;
    setLoading(true);
    try {
      const analysis = session?.analysis && session.jobText === jobText ? session.analysis : (await analyzeJob(jobText)).result;
      const match = calculateJobMatch(doc.content, doc.design, analysis);
      const r = await withMinDuration(interviewPrep(doc.content, analysis, match, jobText), 1500);
      setPrep(r.result);
      setEngine(r.engine);
    } finally {
      setLoading(false);
    }
  }, [doc, jobText, session]);

  useEffect(() => {
    if (!prep && jobText && !loading) void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobText]);

  if (!doc) return null;
  const title = doc.jobTarget?.title || session?.jobTitle || "this job";

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md print:hidden">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-3 sm:px-6">
          <Link href={`/app/cv/${doc.id}`} className="inline-flex h-10 min-w-0 items-center gap-2 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
            <ArrowLeft className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{doc.name}</span>
          </Link>
          {prep && (
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" icon={<Printer className="size-4" />} onClick={() => window.print()}>
                Print
              </Button>
              <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} onClick={generate} disabled={loading}>
                Regenerate
              </Button>
            </div>
          )}
        </div>
      </header>
      <main id="main" className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <span className="mb-3 inline-flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg print:hidden">
            <Mic className="size-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Prepare for {title}</h1>
          <p className="mt-2 text-muted">Likely questions based on the job description and your CV, with talking points drawn only from your real experience.</p>
        </div>

        {!jobText ? (
          <EmptyState
            icon={<HelpCircle />}
            title="No job description yet"
            description="Optimize this CV for a job first, then come back to prepare for the interview."
            action={
              <Link href={`/app/cv/${doc.id}/optimize`}>
                <Button variant="primary" icon={<Sparkles className="size-4" />}>
                  Optimize for a Job
                </Button>
              </Link>
            }
          />
        ) : loading || !prep ? (
          <div className="py-10">
            <StagedProgress title="Preparing your interview guide…" steps={["Reading the job description", "Matching it to your CV", "Writing likely questions", "Adding talking points from your experience"]} />
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <p className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              Talking points reference only what's on your CV. Never describe experience you don't have — interviewers probe for detail.
            </p>
            {SECTIONS.map((s) =>
              prep[s.key].length ? (
                <section key={s.key}>
                  <h2 className="text-[15px] font-semibold">{s.title}</h2>
                  <p className="mb-3 mt-0.5 text-sm text-subtle">{s.desc}</p>
                  <div className="flex flex-col gap-2">
                    {prep[s.key].map((q, i) => (
                      <QuestionItem key={i} q={q} index={i} />
                    ))}
                  </div>
                </section>
              ) : null,
            )}
            {prep.askThem.length > 0 && (
              <section>
                <h2 className="text-[15px] font-semibold">Questions to ask them</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {prep.askThem.map((q) => (
                    <li key={q} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
                      {q}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className="flex items-center gap-1.5 text-xs text-subtle">
              {engine === "claude" ? <Sparkles className="size-3" aria-hidden /> : <Cpu className="size-3" aria-hidden />}
              Generated {engine === "claude" ? "with Enhanced AI" : "on-device"}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function QuestionItem({ q, index }: { q: InterviewQuestion; index: number }) {
  const [open, setOpen] = useState(index === 0);
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }} className="rounded-xl border border-border bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
        <span className="min-w-0 flex-1 text-sm font-medium">{q.question}</span>
        <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-subtle transition-transform print:hidden", open && "rotate-180")} aria-hidden />
      </button>
      <div className={cn("border-t border-border px-4 py-3.5 print:block", open ? "block" : "hidden")}>
        {q.why && <p className="mb-2.5 text-xs text-subtle">Why they'll ask: {q.why}</p>}
        <ul className="flex flex-col gap-1.5">
          {q.talkingPoints.map((t) => (
            <li key={t} className="flex items-start gap-2 text-[13px] text-muted">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

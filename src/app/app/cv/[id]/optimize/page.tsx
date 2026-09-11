"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Check, X } from "lucide-react";
import { useCV, useStore } from "@/lib/store";
import type { CVDoc } from "@/lib/cv/schema";
import type { Change, OptimizeMode, OptimizeSession, Question } from "@/lib/ai/types";
import { analyzeJob, optimizeCV, withMinDuration } from "@/lib/ai/client";
import { calculateJobMatch } from "@/lib/engine/match";
import { applyAnswer, guardPlan } from "@/lib/engine/optimize";
import { applyChanges } from "@/lib/engine/applyChanges";
import { clone, cn } from "@/lib/utils";
import { Button, IconButton } from "@/components/ui/Button";
import { JobStep, validateJob } from "@/components/optimize/JobStep";
import { AnalysisStep } from "@/components/optimize/AnalysisStep";
import { ReviewStep } from "@/components/optimize/ReviewStep";
import { DoneStep } from "@/components/optimize/DoneStep";
import { StagedProgress } from "@/components/optimize/Progress";

const STEPS = [
  { key: "job", label: "Job" },
  { key: "analysis", label: "Match" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
] as const;

const ANALYZE_STEPS = ["Understanding the job", "Separating requirements from job details", "Understanding your CV", "Mapping requirements to evidence", "Scoring your match"];
const OPTIMIZE_STEPS = ["Finding strong, weak and missing areas", "Deciding which sections should change", "Drafting section-appropriate changes", "Validating every change (truth, relevance, fit)", "Preparing your review"];

export default function OptimizeRoute() {
  const { id } = useParams<{ id: string }>();
  const doc = useCV(id);
  if (!doc)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">We couldn't find this CV</h1>
        <Link href="/app">
          <Button variant="primary">Back to my CVs</Button>
        </Link>
      </div>
    );
  return <Optimize doc={doc} />;
}

function defaultVersionName(doc: CVDoc, title: string, company: string) {
  const base = doc.name.replace(/\s+—\s+.*$/, "");
  const target = [title, company && `at ${company}`].filter(Boolean).join(" ");
  return target ? `${base} — ${target}` : `${base} — tailored`;
}

function Optimize({ doc }: { doc: CVDoc }) {
  const router = useRouter();
  const session = useStore((s) => s.sessions[doc.id]);
  const saveSession = useStore((s) => s.saveSession);
  const patchSession = useStore((s) => s.patchSession);
  const clearSession = useStore((s) => s.clearSession);
  const createCV = useStore((s) => s.createCV);
  const cvs = useStore((s) => s.cvs);
  const [busy, setBusy] = useState<null | "analyze" | "optimize">(null);
  const [saving, setSaving] = useState(false);

  const step = session?.step ?? "job";
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const analyze = async (text: string) => {
    if (validateJob(text).error) return;
    setBusy("analyze");
    try {
      const r = await withMinDuration(analyzeJob(text), 1800);
      if (r.fellBack) toast("Enhanced AI was unavailable, so we used the on-device analyzer.");
      const analysis = r.result;
      const match = calculateJobMatch(doc.content, doc.design, analysis);
      const s: OptimizeSession = {
        cvId: doc.id,
        jobText: text,
        jobTitle: analysis.jobTitle,
        company: analysis.company,
        analysis,
        match,
        mode: session?.mode ?? "balanced",
        plan: null,
        step: "analysis",
        versionName: defaultVersionName(doc, analysis.jobTitle, analysis.company),
        engine: r.engine,
        updatedAt: Date.now(),
      };
      saveSession(s);
    } catch {
      toast.error("We couldn't analyze this job description", { description: "Please try again. If it keeps happening, try pasting less text." });
    } finally {
      setBusy(null);
    }
  };

  const optimize = async () => {
    if (!session?.analysis || !session.match) return;
    setBusy("optimize");
    try {
      const r = await withMinDuration(optimizeCV(doc, session.analysis, session.match, session.mode, session.jobText), 1700);
      if (r.fellBack) toast("Enhanced AI was unavailable, so we used the on-device optimizer.");
      patchSession(doc.id, { plan: r.result, step: "review" });
      window.scrollTo({ top: 0 });
    } catch {
      toast.error("Optimization failed", { description: "Nothing was changed. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  const plan = session?.plan ?? null;
  const optimized = useMemo(() => (plan ? applyChanges(doc.content, doc.layout, plan.changes) : null), [plan, doc.content, doc.layout]);
  const scoreAfter = useMemo(() => {
    if (!optimized || !session?.analysis) return session?.match?.overall ?? 0;
    return calculateJobMatch(optimized.content, doc.design, session.analysis).overall;
  }, [optimized, session?.analysis, session?.match, doc.design]);

  const setChanges = (changes: Change[]) => plan && patchSession(doc.id, { plan: { ...plan, changes } });
  const patchChange = (id: string, p: Partial<Change>) => plan && setChanges(plan.changes.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const editChange = (id: string, after: string) => {
    if (!plan || !session?.analysis) return;
    const edited = plan.changes.map((c) => (c.id === id ? { ...c, after, category: c.category === "blocked" ? ("safe" as const) : c.category, warning: undefined, status: "accepted" as const } : c));
    const guarded = guardPlan({ ...plan, changes: edited.map((c) => (c.id === id && c.basis === "user" ? { ...c, basis: "fact" as const } : c)) }, doc.content, session.analysis);
    patchSession(doc.id, { plan: guarded });
    const ch = guarded.changes.find((c) => c.id === id);
    if (ch?.category === "blocked") toast.warning("Check your edit", { description: ch.warning });
  };
  const answer = (q: Question) => {
    if (!plan || !session?.analysis) return;
    const next = applyAnswer(plan, q, doc.content);
    // auto-accept changes created from the user's own answers
    const changes = next.changes.map((c) => (c.basis === "user" && c.status === "pending" ? { ...c, status: "accepted" as const } : c));
    patchSession(doc.id, { plan: guardPlan({ ...next, changes }, doc.content, session.analysis) });
  };

  const save = () => {
    if (!plan || !optimized || !session || saving) return;
    // Idempotent: never create a second copy if this session already saved one
    if (session.createdVersionId && cvs[session.createdVersionId]) {
      patchSession(doc.id, { step: "done" });
      return;
    }
    setSaving(true);
    const now = Date.now();
    const newId = createCV({
      name: session.versionName.trim() || defaultVersionName(doc, session.jobTitle, session.company),
      parentId: doc.id,
      content: clone(optimized.content),
      layout: clone(optimized.layout),
      design: clone(doc.design),
      jobTarget: { title: session.jobTitle, company: session.company, description: session.jobText, score: scoreAfter, scoreBefore: session.match?.overall, optimizedAt: now },
    });
    patchSession(doc.id, { step: "done", createdVersionId: newId, scoreAfter });
    setSaving(false);
    window.scrollTo({ top: 0 });
  };

  const restart = () => {
    clearSession(doc.id);
    window.scrollTo({ top: 0 });
  };

  const initialJob = session?.jobText ?? doc.jobTarget?.description ?? "";
  const version = session?.createdVersionId ? cvs[session.createdVersionId] : undefined;

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-3 sm:px-6">
          <Link href={`/app/cv/${doc.id}`} className="inline-flex h-10 min-w-0 items-center gap-2 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
            <ArrowLeft className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{doc.name}</span>
          </Link>
          <nav aria-label="Progress" className="mx-auto hidden items-center gap-1 sm:flex">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1">
                <span className={cn("flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium", i === stepIndex ? "bg-accent text-accent-fg" : i < stepIndex ? "text-success" : "text-subtle")} aria-current={i === stepIndex ? "step" : undefined}>
                  {i < stepIndex ? <Check className="size-3.5" aria-hidden /> : <span className="tabular-nums">{i + 1}</span>}
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="h-px w-5 bg-border" aria-hidden />}
              </div>
            ))}
          </nav>
          <span className="ml-auto text-xs text-subtle sm:hidden">
            Step {stepIndex + 1} of {STEPS.length}
          </span>
          <IconButton label="Close optimizer" onClick={() => router.push(`/app/cv/${doc.id}`)}>
            <X className="size-4" />
          </IconButton>
        </div>
      </header>

      <main id="main" className="px-4 py-8 sm:px-6 sm:py-10">
        {/* Enter-only transitions: a step change must never wait on an exit animation */}
        <>
          {busy ? (
            <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[50dvh] items-center justify-center">
              <StagedProgress title={busy === "analyze" ? "Analyzing job description…" : "Optimizing your CV…"} steps={busy === "analyze" ? ANALYZE_STEPS : OPTIMIZE_STEPS} />
            </motion.div>
          ) : (
            <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
              {step === "job" && <JobStep doc={doc} initial={initialJob} onAnalyze={analyze} />}
              {step === "analysis" && session?.analysis && session.match && (
                <AnalysisStep
                  analysis={session.analysis}
                  match={session.match}
                  engine={session.engine}
                  mode={session.mode}
                  setMode={(m: OptimizeMode) => patchSession(doc.id, { mode: m })}
                  versionName={session.versionName}
                  setVersionName={(v) => patchSession(doc.id, { versionName: v })}
                  onOptimize={optimize}
                  onEditJob={() => patchSession(doc.id, { step: "job" })}
                />
              )}
              {step === "review" && plan && optimized && session?.match && (
                <ReviewStep
                  doc={doc}
                  plan={plan}
                  scoreBefore={session.match.overall}
                  scoreAfter={scoreAfter}
                  optimizedDoc={{ ...optimized, design: doc.design }}
                  onPatchChange={patchChange}
                  onEditChange={editChange}
                  onAnswer={answer}
                  onAcceptAllSafe={() => setChanges(plan.changes.map((c) => (c.status === "pending" && c.category === "safe" ? { ...c, status: "accepted" } : c)))}
                  onSave={save}
                  onBack={() => patchSession(doc.id, { step: "analysis" })}
                  saving={saving}
                />
              )}
              {step === "done" && version && session?.match && <DoneStep version={version} original={doc} scoreBefore={session.match.overall} scoreAfter={session.scoreAfter ?? scoreAfter} onRestart={restart} />}
              {step === "done" && !version && (
                <div className="mx-auto max-w-md text-center">
                  <p className="text-muted">The tailored version was deleted.</p>
                  <Button className="mt-4" onClick={restart}>
                    Start again
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </>
      </main>
    </div>
  );
}

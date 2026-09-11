"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, CircleDashed, ClipboardCheck, Cpu, Hand, Loader2, RefreshCw, ScanText, Sparkles, Wand2, XCircle } from "lucide-react";
import { atsReadBack } from "@/lib/ats/readBack";
import type { ReadBackResult } from "@/lib/engine/atsCheck";
import { templateMeta } from "@/lib/cv/meta";
import type { CVDoc } from "@/lib/cv/schema";
import type { EngineKind, ReviewItem, ReviewResult } from "@/lib/ai/types";
import { reviewMyCV, withMinDuration } from "@/lib/ai/client";
import { applyAutoFixes, planAutoFixes, scoreWithFixes } from "@/lib/engine/autoFix";
import { Sheet } from "@/components/ui/Sheet";
import { Bar, ScoreRing } from "@/components/ui/misc";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { Update } from "./SectionEditors";

const STEPS = ["Checking clarity and tone", "Reviewing bullet quality", "Checking ATS compatibility", "Scoring your CV"];

export function ReviewSheet({
  open,
  onOpenChange,
  doc,
  pages,
  onJump,
  update,
  undoHint = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  doc: CVDoc;
  pages: number;
  onJump: (section: string) => void;
  /** When provided, "Fix it for me" can apply smart fixes (with the user's permission) */
  update?: Update;
  /** Whether Ctrl+Z can undo applied fixes here (true in the editor) */
  undoHint?: boolean;
}) {
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [engine, setEngine] = useState<EngineKind>("local");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [fixMode, setFixMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rerun, setRerun] = useState(false);
  const [ats, setAts] = useState<ReadBackResult | null>(null);
  const [atsBusy, setAtsBusy] = useState(false);

  // ATS read-back test: runs with every review (and again after fixes are applied)
  useEffect(() => {
    if (!open || !result) return;
    let cancelled = false;
    setAtsBusy(true);
    atsReadBack(doc)
      .then((r) => !cancelled && setAts(r))
      .catch(() => !cancelled && setAts(null))
      .finally(() => !cancelled && setAtsBusy(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const run = async () => {
    setLoading(true);
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 350);
    try {
      const r = await withMinDuration(reviewMyCV(doc.content, doc.design, pages), 1300);
      setResult(r.result);
      setEngine(r.engine);
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setFixMode(false);
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Re-score after fixes were applied (runs once the updated CV has arrived)
  useEffect(() => {
    if (!rerun) return;
    setRerun(false);
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.content]);

  const plan = useMemo(() => (update && result ? planAutoFixes(doc.content, doc.design, pages) : null), [update, result, doc.content, doc.design, pages]);
  useEffect(() => {
    if (plan) setSelected(new Set(plan.fixes.filter((f) => !f.optional).map((f) => f.id)));
  }, [plan]);
  const chosen = plan ? plan.fixes.filter((f) => selected.has(f.id)) : [];
  const estimate = useMemo(() => (plan ? scoreWithFixes(doc.content, doc.design, pages, chosen) : 0), [plan, chosen, doc.content, doc.design, pages]);

  const applyFixes = () => {
    if (!update || !chosen.length) return;
    update((d) => void (d.content = applyAutoFixes(d.content, chosen)));
    toast.success(`Applied ${chosen.length} fix${chosen.length === 1 ? "" : "es"}`, { description: undoHint ? "Undo any time with Ctrl+Z." : "You can still edit everything before saving." });
    setFixMode(false);
    setRerun(true);
  };

  const groups: { title: string; sev: ReviewItem["severity"] }[] = [
    { title: "Fix these", sev: "issue" },
    { title: "Improvements", sev: "warn" },
    { title: "What's working", sev: "good" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Review My CV" description="An independent quality check — no job description needed" icon={<ClipboardCheck />} width="sm:max-w-lg">
      {loading || !result ? (
        <div className="p-6" aria-live="polite">
          <p className="mb-4 text-sm font-medium">Reviewing your CV…</p>
          <ol className="flex flex-col gap-3">
            {STEPS.map((s, i) => (
              <li key={s} className={cn("flex items-center gap-3 text-sm", i <= step ? "text-fg" : "text-subtle")}>
                {i < step ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : i === step ? <Loader2 className="size-4 animate-spin text-accent" aria-hidden /> : <span className="mx-1.5 size-1.5 rounded-full bg-border-strong" />}
                {s}
              </li>
            ))}
          </ol>
        </div>
      ) : fixMode && plan ? (
        /* ── Smart fixes: preview, choose, apply ── */
        <div className="flex flex-col p-5 pb-28">
          <button type="button" onClick={() => setFixMode(false)} className="mb-3 inline-flex items-center gap-1 self-start text-sm text-muted hover:text-fg">
            <ArrowLeft className="size-4" aria-hidden /> Back to review
          </button>
          <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Wand2 className="size-5 text-accent" aria-hidden /> Smart fixes
          </h3>
          <p className="mt-1 text-sm text-muted">
            Choose what to apply. Estimated score <span className="font-semibold text-fg">{plan.scoreBefore}</span> → <span className="font-semibold text-success">{estimate}</span>. Only safe changes — wording, tense, spelling and consistency. Nothing is invented.
          </p>
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-muted">
            <Hand className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>You can also make these changes yourself. For the most hand-crafted feel, we recommend editing manually in the main editor — use these as suggestions and adjust the wording so it sounds like you.</span>
          </p>
          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="text-subtle">
              {chosen.length} of {plan.fixes.length} selected
            </span>
            <span className="flex gap-3">
              <button type="button" className="font-medium text-accent hover:underline" onClick={() => setSelected(new Set(plan.fixes.map((f) => f.id)))}>
                Select all
              </button>
              <button type="button" className="font-medium text-muted hover:underline" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </span>
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {plan.fixes.map((f) => {
              const on = selected.has(f.id);
              return (
                <li key={f.id}>
                  <label className={cn("flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors", on ? "border-accent/50 bg-accent-soft/30" : "border-border bg-surface hover:bg-surface-2")}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setSelected((s) => {
                          const next = new Set(s);
                          if (next.has(f.id)) next.delete(f.id);
                          else next.add(f.id);
                          return next;
                        })
                      }
                      className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 text-[13px] font-semibold">
                        {f.where}
                        {f.optional && <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning">Bigger change — review it</span>}
                      </span>
                      <span className="mt-0.5 block text-xs text-subtle">{f.reason}</span>
                      <span className="mt-2 block text-[13px] leading-relaxed text-muted line-through decoration-danger/50 line-clamp-3">{f.before}</span>
                      <span className="mt-1 block text-[13px] leading-relaxed text-fg">{f.after}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="fixed inset-x-0 bottom-0 flex gap-2 border-t border-border bg-surface/95 p-4 backdrop-blur-md sm:absolute">
            <Button variant="ghost" onClick={() => setFixMode(false)}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-1" icon={<Wand2 className="size-4" />} disabled={!chosen.length} onClick={applyFixes}>
              Apply {chosen.length} fix{chosen.length === 1 ? "" : "es"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-5">
          <div className="flex items-center gap-5 rounded-2xl border border-border bg-surface-2/50 p-4">
            <ScoreRing value={result.score} size={104} stroke={9} label="CV quality score" sublabel="/ 100" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">CV quality score</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {result.items.filter((i) => i.severity === "issue").length} to fix · {result.items.filter((i) => i.severity === "warn").length} to improve · {result.items.filter((i) => i.severity === "good").length} strengths
              </p>
              <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-subtle">
                {engine === "claude" ? <Sparkles className="size-3" aria-hidden /> : <Cpu className="size-3" aria-hidden />}
                {engine === "claude" ? "Reviewed with Enhanced AI" : "Reviewed on-device"}
              </p>
            </div>
          </div>

          {plan && plan.fixes.length > 0 && (
            <div className="mt-4 rounded-2xl border border-accent/30 bg-accent-soft/40 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Wand2 className="size-4 text-accent" aria-hidden /> {plan.fixes.length} smart fix{plan.fixes.length === 1 ? "" : "es"} available
              </p>
              <p className="mt-1 text-[13px] text-muted">
                Estimated score {plan.scoreBefore} → <span className="font-semibold text-success">{plan.scoreAfter}</span>. You'll see every change before anything is applied. Items that need your own information (like real numbers) stay in the list below.
              </p>
              <Button className="mt-3" variant="primary" size="sm" icon={<Wand2 className="size-4" />} onClick={() => setFixMode(true)}>
                Fix it for me
              </Button>
            </div>
          )}
          {plan && plan.fixes.length === 0 && (
            <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-muted">No automatic fixes needed — anything left below needs your own input.</p>
          )}

          {/* ── ATS read-back test: a real test of the file's layout ── */}
          <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <ScanText className="size-4 text-accent" aria-hidden /> ATS read-back test
                </p>
                <p className="mt-1 text-[13px] text-muted">We laid your CV out exactly as it prints and read it back line by line, the way a basic applicant tracking system does.</p>
              </div>
              {ats && (
                <span className={cn("shrink-0 rounded-lg px-2 py-1 text-xs font-semibold", ats.ok === ats.total ? "bg-success-soft text-success" : ats.ok >= ats.total * 0.75 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger")}>
                  {ats.ok}/{ats.total}
                </span>
              )}
            </div>
            {atsBusy && !ats ? (
              <p className="mt-3 flex items-center gap-2 text-[13px] text-subtle">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Reading your CV…
              </p>
            ) : ats ? (
              <>
                <p className="mt-3 text-sm font-medium">
                  {ats.ok === ats.total
                    ? "A basic ATS read every key detail correctly."
                    : `${ats.ok} of ${ats.total} details read correctly${ats.partial ? ` (${ats.partial} partly)` : ""} — check the flagged ones.`}
                </p>
                {ats.ok < ats.total && !templateMeta(doc.design.template).atsFriendly && (
                  <p className="mt-1 text-[13px] text-warning">Two-column templates are often read out of order. For online applications, switch to an ATS-friendly template in Design.</p>
                )}
                <ul className="mt-2 flex flex-col gap-1.5">
                  {ats.checks.map((c) => (
                    <li key={c.label} className="flex items-start gap-2 text-[13px]">
                      {c.status === "ok" ? (
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-label="Read correctly" />
                      ) : c.status === "partial" ? (
                        <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-warning" aria-label="Partly read" />
                      ) : (
                        <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-label="Not read" />
                      )}
                      <span className="min-w-0">
                        <span className="font-medium">{c.label}</span> <span className="text-muted">— {c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-accent">See what a basic ATS reads</summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-muted">{ats.text}</pre>
                </details>
              </>
            ) : (
              <p className="mt-3 text-[13px] text-subtle">The read-back test couldn't run in this browser.</p>
            )}
            <details className="mt-3 text-[13px] text-muted">
              <summary className="cursor-pointer text-xs font-medium text-accent">What does the ATS score mean?</summary>
              <p className="mt-2 leading-relaxed">
                The <span className="font-medium text-fg">ATS formatting</span> score is a checklist: contact details present, an ATS-friendly single-column template with real text, readable font size and
                margins, dates on every job, and a skills section. 100 means every check passed — it is <span className="font-medium text-fg">not</span> a score from a real ATS. There is no universal ATS
                score: every employer's system (Workday, Greenhouse, Taleo, Lever…) reads CVs a little differently, and many also rank candidates by keywords, which Job Match estimates. The read-back
                test above is a real test of your file's layout with a basic parser — if it reads everything correctly, your format is very unlikely to be the problem.
              </p>
            </details>
          </div>

          {result.categories.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {result.categories.map((c) => (
                <Bar key={c.name} label={c.name === "ATS" ? "ATS formatting (checklist)" : c.name} value={c.score} note={`${c.score}`} />
              ))}
            </div>
          )}

          {groups.map((g) => {
            const items = result.items.filter((i) => i.severity === g.sev);
            if (!items.length) return null;
            return (
              <div key={g.sev} className="mt-6">
                <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-subtle">{g.title}</h3>
                <ul className="flex flex-col gap-2">
                  {items.map((it, i) => (
                    <motion.li key={it.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="rounded-xl border border-border bg-surface p-3.5">
                      <div className="flex gap-3">
                        {it.severity === "good" ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Strength" />
                        ) : it.severity === "issue" ? (
                          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Issue" />
                        ) : (
                          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Improvement" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{it.title}</p>
                          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{it.detail}</p>
                          {it.examples && it.examples.length > 0 && (
                            <ul className="mt-2 flex flex-col gap-1">
                              {it.examples.slice(0, 3).map((ex) => (
                                <li key={ex} className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">
                                  {ex}
                                </li>
                              ))}
                            </ul>
                          )}
                          {it.section && it.severity !== "good" && (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenChange(false);
                                onJump(it.section!);
                              }}
                              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                            >
                              Go to {it.section === "personal" ? "personal info" : it.section} <ArrowRight className="size-3" aria-hidden />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              </div>
            );
          })}
          <Button variant="ghost" className="mt-6" icon={<RefreshCw className="size-4" />} onClick={run}>
            Run again
          </Button>
        </div>
      )}
    </Sheet>
  );
}

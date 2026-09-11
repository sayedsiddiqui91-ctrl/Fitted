"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, Cpu, Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { CVDoc } from "@/lib/cv/schema";
import type { EngineKind, ReviewItem, ReviewResult } from "@/lib/ai/types";
import { reviewMyCV, withMinDuration } from "@/lib/ai/client";
import { Sheet } from "@/components/ui/Sheet";
import { Bar, ScoreRing } from "@/components/ui/misc";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const STEPS = ["Checking clarity and tone", "Reviewing bullet quality", "Checking ATS compatibility", "Scoring your CV"];

export function ReviewSheet({ open, onOpenChange, doc, pages, onJump }: { open: boolean; onOpenChange: (o: boolean) => void; doc: CVDoc; pages: number; onJump: (section: string) => void }) {
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [engine, setEngine] = useState<EngineKind>("local");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);

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
    if (open) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

          {result.categories.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {result.categories.map((c) => (
                <Bar key={c.name} label={c.name} value={c.score} note={`${c.score}`} />
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
                    <motion.li
                      key={it.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="rounded-xl border border-border bg-surface p-3.5"
                    >
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

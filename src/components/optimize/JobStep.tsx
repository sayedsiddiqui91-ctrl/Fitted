"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ClipboardPaste, FileSearch, Lock } from "lucide-react";
import { SAMPLE_JOB } from "@/lib/cv/defaults";
import type { CVDoc } from "@/lib/cv/schema";
import { Button } from "@/components/ui/Button";

export const JOB_MIN = 150;
export const JOB_MAX = 30_000;

export function validateJob(text: string): { error?: string; warning?: string } {
  const t = text.trim();
  if (!t) return { error: "Paste a job description first." };
  if (t.length < 80) return { error: "This is too short to analyze. Paste the full job description, including responsibilities and requirements." };
  if (t.length > JOB_MAX) return { error: `This is very long (${t.length.toLocaleString()} characters). Please paste just the job description — up to ${JOB_MAX.toLocaleString()} characters.` };
  if (t.length < JOB_MIN) return { warning: "This looks short. For the most accurate match, include the responsibilities and requirements." };
  return {};
}

export function JobStep({ doc, initial, onAnalyze }: { doc: CVDoc; initial: string; onAnalyze: (text: string) => void }) {
  const [text, setText] = useState(initial);
  const [touched, setTouched] = useState(false);
  const v = validateJob(text);
  const cvEmpty = !doc.content.experience.length && !doc.content.skills.length && !doc.content.summary.trim();

  const submit = () => {
    setTouched(true);
    if (v.error) return;
    onAnalyze(text.trim());
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Optimize for a Job</h1>
        <p className="mt-2 text-[15px] text-muted">Paste a job description to see how well your CV matches — then get honest, reviewable suggestions.</p>
      </div>

      {cvEmpty && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-muted">
            <b className="text-fg">Your CV is mostly empty.</b> Add your experience and skills first for a meaningful match.{" "}
            <Link href={`/app/cv/${doc.id}`} className="font-medium text-accent hover:underline">
              Open editor
            </Link>
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface shadow-sm focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
        <label htmlFor="jd" className="sr-only">
          Job description
        </label>
        <textarea
          id="jd"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the job description here…&#10;&#10;Works with LinkedIn posts, job ads, internship and graduate program descriptions, or company career pages."
          className="scroll-thin block min-h-[300px] w-full resize-y rounded-t-2xl bg-transparent px-5 py-4 text-[15px] leading-relaxed placeholder:text-subtle focus:outline-none sm:min-h-[360px] sm:text-sm"
          aria-describedby="jd-help"
          aria-invalid={touched && !!v.error}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={async () => {
                try {
                  const t = await navigator.clipboard.readText();
                  if (t) setText(t);
                } catch {
                  /* clipboard permission denied — user can paste manually */
                }
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-fg"
            >
              <ClipboardPaste className="size-4" aria-hidden /> Paste
            </button>
            <button type="button" onClick={() => setText(SAMPLE_JOB)} className="inline-flex h-8 items-center rounded-lg px-2 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-fg">
              Try a sample job
            </button>
          </div>
          <span className={`text-xs tabular-nums ${text.length > JOB_MAX ? "text-danger" : "text-subtle"}`}>
            {text.length.toLocaleString()} / {JOB_MAX.toLocaleString()}
          </span>
        </div>
      </div>
      <p id="jd-help" className={`mt-2 min-h-5 text-sm ${touched && v.error ? "text-danger" : "text-warning"}`} role={touched && v.error ? "alert" : undefined}>
        {touched && v.error ? v.error : text.trim().length > 0 ? v.warning : ""}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button variant="primary" size="lg" icon={<FileSearch className="size-4" />} onClick={submit}>
          Analyze Job
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-subtle">
          <Lock className="size-3.5" aria-hidden /> Your original CV is never changed.
        </p>
      </div>
    </div>
  );
}

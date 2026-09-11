"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Briefcase, Building2, CheckCircle2, ChevronDown, Circle, Cpu, EyeOff, GraduationCap, Info, Pencil, Sparkles, Triangle, Wand2, XCircle } from "lucide-react";
import type { EngineKind, JobAnalysis, KeywordHit, MatchResult, OptimizeMode, RequirementEvidence } from "@/lib/ai/types";
import { cn } from "@/lib/utils";
import { Bar, Badge, ScoreRing, Segmented, scoreTone } from "@/components/ui/misc";
import { Button, Tip } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

export const MODE_COPY: Record<OptimizeMode, string> = {
  conservative: "Only obvious fixes: weak openers, tense and clarity. Minimal rewording.",
  balanced: "Improves wording, relevance and emphasis while keeping your original meaning.",
  aggressive: "Maximizes relevance using all the truthful information in your CV.",
};

export function ScoreExplainer() {
  return (
    <Tip content="An estimate of how well your CV matches this job, combining required and preferred skills, experience, responsibilities, education, certifications, industry, keywords, CV structure and ATS formatting checks (a checklist — not a score from any real ATS). It is not the score of any specific applicant tracking system; run Review My CV for an ATS read-back test of your file.">
      <button type="button" className="inline-flex items-center gap-1 text-xs text-subtle hover:text-fg" aria-label="How the score works">
        <Info className="size-3.5" aria-hidden /> Estimated
      </button>
    </Tip>
  );
}

function Chips({ items, tone }: { items: string[]; tone?: "neutral" | "accent" }) {
  if (!items.length) return <p className="text-sm text-subtle">None detected</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <Badge key={s} tone={tone} className="px-2 py-1 text-xs">
          {s}
        </Badge>
      ))}
    </div>
  );
}

const STATUS = {
  matched: { icon: CheckCircle2, color: "text-success", label: "Strong matches", mark: "✓" },
  partial: { icon: Triangle, color: "text-warning", label: "Partial matches", mark: "△" },
  missing: { icon: Circle, color: "text-subtle", label: "Missing", mark: "○" },
} as const;

function RequirementColumn({ status, items }: { status: keyof typeof STATUS; items: RequirementEvidence[] }) {
  const s = STATUS[status];
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <s.icon className={cn("size-4", s.color)} aria-hidden /> {s.label}
        <span className="text-xs font-normal text-subtle">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-subtle">—</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((r) => (
            <li key={r.requirement} className="text-sm">
              <p className="flex items-start gap-2">
                <span className={cn("mt-px", s.color)} aria-hidden>
                  {s.mark}
                </span>
                <span className="min-w-0">
                  <span className="font-medium">{r.requirement}</span>
                  {r.importance === "preferred" && <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-subtle">preferred</span>}
                  <span className="block text-xs text-muted">{r.reason}</span>
                  {r.evidence && <span className="mt-0.5 block text-xs italic text-subtle">“{r.evidence}”</span>}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function KeywordColumn({ title, desc, items, kind }: { title: string; desc: string; items: KeywordHit[]; kind: "have" | "can" | "no" }) {
  const Icon = kind === "have" ? CheckCircle2 : kind === "can" ? Circle : XCircle;
  const color = kind === "have" ? "text-success" : kind === "can" ? "text-warning" : "text-danger";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mb-3 mt-0.5 text-xs text-subtle">{desc}</p>
      {items.length === 0 ? (
        <p className="text-sm text-subtle">—</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.slice(0, 14).map((k) => (
            <li key={k.term} className="flex items-start gap-2 text-sm">
              <Icon className={cn("mt-0.5 size-4 shrink-0", color)} aria-hidden />
              <span className="min-w-0">
                {k.term}
                {k.importance === "required" && <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-subtle">required</span>}
                {kind === "can" && k.related && k.related.length > 0 && <span className="block text-xs text-subtle">Related: {k.related.join(", ")}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function explainScore(match: MatchResult, dims: [string, number | null][]): string {
  const reqs = (match.requirements ?? []).filter((r) => r.kind !== "responsibility");
  const counts = { matched: reqs.filter((r) => r.status === "matched").length, partial: reqs.filter((r) => r.status === "partial").length, missing: reqs.filter((r) => r.status === "missing").length };
  const active = dims.filter((d): d is [string, number] => d[1] != null).sort((a, b) => b[1] - a[1]);
  const top = active[0];
  const low = active[active.length - 1];
  const parts = [
    reqs.length ? `Based on ${reqs.length} requirements: ${counts.matched} matched, ${counts.partial} partial, ${counts.missing} missing.` : "",
    top ? `Strongest: ${top[0].toLowerCase()} (${top[1]}%).` : "",
    low && low !== top ? `Weakest: ${low[0].toLowerCase()} (${low[1]}%).` : "",
    counts.missing ? "Missing requirements are never added for you — only if you confirm you have them." : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export function AnalysisStep({
  analysis,
  match,
  engine,
  mode,
  setMode,
  versionName,
  setVersionName,
  onOptimize,
  onEditJob,
}: {
  analysis: JobAnalysis;
  match: MatchResult;
  engine: EngineKind;
  mode: OptimizeMode;
  setMode: (m: OptimizeMode) => void;
  versionName: string;
  setVersionName: (v: string) => void;
  onOptimize: () => void;
  onEditJob: () => void;
}) {
  const [showFull, setShowFull] = useState(false);
  const tone = scoreTone(match.overall);
  const b = match.breakdown;
  const dims: [string, number | null][] = [
    ["Required skills", b.required ?? b.skills],
    ["Preferred skills", b.preferred ?? null],
    ["Experience relevance", b.experience],
    ["Responsibility alignment", b.responsibilities ?? null],
    ["Education", match.educationApplicable ? b.education : null],
    ["Certifications", b.certifications ?? null],
    ["Industry relevance", b.industry ?? null],
    ["Keyword coverage", b.keyword],
    ["CV structure", b.structure ?? null],
    ["ATS formatting checks", b.formatting],
  ];
  const reqs = (match.requirements ?? []).filter((r) => r.kind !== "responsibility");
  const resps = (match.requirements ?? []).filter((r) => r.kind === "responsibility");
  const meta: [string, string | null][] = [
    ["Location", analysis.location ?? null],
    ["Employment type", analysis.employmentType ?? null],
    ["Work arrangement", analysis.workArrangement ?? null],
    ["Salary", analysis.salary ?? null],
    ["How to apply", analysis.applicationInstructions?.[0] ?? null],
  ];
  const hasMeta = meta.some(([, v]) => v) || !!analysis.companyDescription;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[340px_1fr]">
      {/* Score */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Estimated Job Match</h2>
            <ScoreExplainer />
          </div>
          <div className="my-4 flex flex-col items-center">
            <ScoreRing value={match.overall} label="Estimated job match" sublabel="%" />
            <p className="mt-2 text-sm font-medium" style={{ color: tone.color }}>
              {tone.label}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {dims.map(([label, v]) => (
              <Bar key={label} label={label} value={v ?? 0} note={v == null ? "Not specified" : undefined} />
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">{explainScore(match, dims)}</p>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-subtle">
            {engine === "claude" ? <Sparkles className="size-3" aria-hidden /> : <Cpu className="size-3" aria-hidden />}
            Job analyzed {engine === "claude" ? "with Enhanced AI" : "on-device"} · score calculated consistently on-device
          </p>
        </motion.div>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        {/* Job summary */}
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-subtle">Target role</p>
              <h2 className="text-lg font-semibold tracking-tight">{analysis.jobTitle || "Untitled role"}</h2>
              {analysis.company && (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                  <Building2 className="size-3.5" aria-hidden /> {analysis.company}
                </p>
              )}
            </div>
            <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={onEditJob}>
              Edit job description
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {analysis.seniority !== "Unspecified" && <Badge tone="accent">{analysis.seniority}</Badge>}
            {analysis.jobFunction && analysis.jobFunction !== "General" && <Badge>{analysis.jobFunction}</Badge>}
            {analysis.industry && analysis.industry !== "General" && <Badge>{analysis.industry}</Badge>}
            {analysis.yearsExperience != null && <Badge>{analysis.yearsExperience}+ years</Badge>}
            {analysis.degreeLevel !== "none" && (
              <Badge>
                <GraduationCap className="size-3" aria-hidden /> {analysis.degreeLevel === "phd" ? "PhD" : `${analysis.degreeLevel[0].toUpperCase()}${analysis.degreeLevel.slice(1)}'s`}
                {analysis.educationFields.length ? ` · ${analysis.educationFields.slice(0, 2).join(" / ")}` : ""}
              </Badge>
            )}
          </div>
        </section>

        {/* Requirement → evidence */}
        <section>
          <h3 className="mb-1 text-sm font-semibold">What the employer wants vs. what your CV shows</h3>
          <p className="mb-3 text-sm text-muted">Each requirement is checked against evidence in your CV.</p>
          <div className="grid gap-3 md:grid-cols-3">
            <RequirementColumn status="matched" items={reqs.filter((r) => r.status === "matched")} />
            <RequirementColumn status="partial" items={reqs.filter((r) => r.status === "partial")} />
            <RequirementColumn status="missing" items={reqs.filter((r) => r.status === "missing")} />
          </div>
        </section>

        {resps.length > 0 && (
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Briefcase className="size-4 text-accent" aria-hidden /> Responsibilities vs. your experience
            </h3>
            <ul className="flex flex-col divide-y divide-border">
              {resps.map((r) => (
                <li key={r.requirement} className="flex items-start gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                  <span className={cn("mt-0.5 w-16 shrink-0 text-xs font-medium", STATUS[r.status].color)}>{r.status === "matched" ? "✓ Match" : r.status === "partial" ? "△ Partial" : "○ Gap"}</span>
                  <span className="min-w-0">
                    <span>{r.requirement}</span>
                    {r.evidence && <span className="mt-0.5 block text-xs italic text-subtle">Closest in your CV: “{r.evidence}”</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Keyword insights */}
        <section>
          <h3 className="mb-1 text-sm font-semibold">Keyword insights</h3>
          <p className="mb-3 text-sm text-muted">We only suggest keywords your CV can honestly support.</p>
          <div className="grid gap-3 md:grid-cols-3">
            <KeywordColumn kind="have" title="Keywords you already have" desc="Found in your CV" items={match.keywords.have} />
            <KeywordColumn kind="can" title="Could be naturally incorporated" desc="Related experience exists — we'll ask you first" items={match.keywords.canAdd} />
            <KeywordColumn kind="no" title="Don't add unless you have experience" desc="Your CV doesn't show these" items={match.keywords.doNotAdd} />
          </div>
        </section>

        {/* Job metadata — understood, but kept out of the CV */}
        {hasMeta && (
          <section className="rounded-2xl border border-dashed border-border-strong/70 bg-surface-2/40 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <EyeOff className="size-4 text-subtle" aria-hidden /> Job details — kept out of your CV
            </h3>
            <p className="mb-3 mt-1 text-xs text-muted">Useful for your application, but they don't belong in CV content, so the optimizer never inserts them.</p>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {meta
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-xs text-subtle">{k}</dt>
                    <dd className="truncate" title={v ?? ""}>
                      {v}
                    </dd>
                  </div>
                ))}
              {analysis.companyDescription && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-subtle">About the company</dt>
                  <dd className="line-clamp-2 text-muted">{analysis.companyDescription}</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {/* Full job analysis */}
        <section className="rounded-2xl border border-border bg-surface shadow-sm">
          <button type="button" onClick={() => setShowFull((s) => !s)} aria-expanded={showFull} className="flex w-full items-center justify-between px-5 py-4 text-left">
            <span className="text-sm font-semibold">Full job analysis</span>
            <ChevronDown className={cn("size-4 text-subtle transition-transform", showFull && "rotate-180")} aria-hidden />
          </button>
          {showFull && (
            <div className="grid gap-5 border-t border-border px-5 py-5 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Required skills</p>
                <Chips items={analysis.requiredSkills} tone="accent" />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Preferred skills</p>
                <Chips items={analysis.preferredSkills} />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Soft skills</p>
                <Chips items={analysis.softSkills} />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Keywords</p>
                <Chips items={analysis.keywords} />
              </div>
              <div className="md:col-span-2">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Qualifications</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                  {analysis.qualifications.length ? analysis.qualifications.map((r) => <li key={r}>{r}</li>) : <li>None detected</li>}
                </ul>
              </div>
            </div>
          )}
        </section>

        {/* Optimize CTA */}
        <section className="rounded-2xl border border-accent/25 bg-gradient-to-b from-accent-soft/60 to-surface p-5 shadow-sm">
          <h3 className="text-[15px] font-semibold">Optimize your CV for this job</h3>
          <p className="mt-1 text-sm text-muted">We'll only change sections that genuinely need it. You'll review every change before anything is saved. Nothing will be invented.</p>
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <p className="mb-2 text-[13px] font-medium text-muted">Optimization mode</p>
              <Segmented
                label="Optimization mode"
                value={mode}
                onChange={setMode}
                className="w-full sm:w-auto"
                options={[
                  { value: "conservative", label: "Conservative" },
                  { value: "balanced", label: "Balanced" },
                  { value: "aggressive", label: "Aggressive" },
                ]}
              />
              <p className="mt-2 text-xs text-subtle">{MODE_COPY[mode]}</p>
            </div>
            <Field label="Save the result as" hint="A new version is created — your original CV stays unchanged.">
              {(p) => <Input {...p} value={versionName} onChange={(e) => setVersionName(e.target.value)} maxLength={90} />}
            </Field>
            <div>
              <Button variant="primary" size="lg" icon={<Wand2 className="size-4" />} onClick={onOptimize}>
                Optimize My CV
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, CheckCheck, Columns2, HelpCircle, Pencil, RotateCcw, ShieldAlert, ShieldCheck, Undo2, X, XCircle } from "lucide-react";
import type { CVDoc } from "@/lib/cv/schema";
import type { Change, OptimizationPlan, Question } from "@/lib/ai/types";
import { diffWords } from "@/lib/engine/diff";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Badge, scoreTone } from "@/components/ui/misc";
import { CVPreview } from "@/components/cv/CVPreview";
import { ScoreExplainer } from "./AnalysisStep";

/* ───────── Diff rendering ───────── */
function DiffText({ before, after, side }: { before: string; after: string; side: "before" | "after" }) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
  return (
    <p className="text-sm leading-relaxed">
      {parts.map((p, i) =>
        p.type === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.type === "del" && side === "before" ? (
          <del key={i} className="rounded-sm bg-danger-soft text-danger decoration-danger/50">
            {p.text}
          </del>
        ) : p.type === "add" && side === "after" ? (
          <ins key={i} className="rounded-sm bg-success-soft text-success no-underline">
            {p.text}
          </ins>
        ) : null,
      )}
    </p>
  );
}

const CATEGORY = {
  safe: { label: "Safe to add", tone: "success" as const, icon: ShieldCheck },
  clarify: { label: "Needs your confirmation", tone: "warning" as const, icon: HelpCircle },
  blocked: { label: "Not added — not in your CV", tone: "danger" as const, icon: ShieldAlert },
};
const BASIS = { fact: "FACT", user: "YOUR INPUT", inference: "INFERENCE" };

function ChangeCard({ change, onPatch, onEdit }: { change: Change; onPatch: (p: Partial<Change>) => void; onEdit: (after: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(change.after);
  const cat = CATEGORY[change.category];
  const isList = !!change.afterList;
  const isAdd = change.kind === "add-skill" || change.kind === "add-bullet";
  const accepted = change.status === "accepted";
  const rejected = change.status === "rejected";

  return (
    <motion.div layout="position" className={cn("rounded-2xl border bg-surface p-4 shadow-sm transition-colors sm:p-5", accepted ? "border-success/40" : rejected ? "border-border opacity-75" : "border-border")}>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[13px] font-semibold">{change.label}</span>
        <Badge tone={cat.tone}>
          <cat.icon className="size-3" aria-hidden /> {cat.label}
        </Badge>
        <Badge>{BASIS[change.basis]}</Badge>
        {accepted && (
          <Badge tone="success">
            <Check className="size-3" aria-hidden /> Accepted
          </Badge>
        )}
        {rejected && <Badge>Kept original</Badge>}
      </div>

      {isList ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">Before</p>
            <ol className="flex flex-col gap-1">
              {change.beforeList!.map((x, i) => (
                <li key={i} className="flex gap-2 rounded-md bg-surface-2 px-2 py-1 text-[13px] text-muted">
                  <span className="tabular-nums text-subtle">{i + 1}.</span>
                  <span className="line-clamp-2">{x}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">Optimized</p>
            <ol className="flex flex-col gap-1">
              {change.afterList!.map((x, i) => {
                const was = change.beforeList!.indexOf(x);
                return (
                  <li key={i} className={cn("flex gap-2 rounded-md px-2 py-1 text-[13px]", was !== i ? "bg-success-soft text-fg" : "bg-surface-2 text-muted")}>
                    <span className="tabular-nums text-subtle">{i + 1}.</span>
                    <span className="line-clamp-2 flex-1">{x}</span>
                    {was > i && <span className="text-[10px] font-medium text-success">↑{was - i}</span>}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      ) : isAdd ? (
        <div className="rounded-xl border border-success/25 bg-success-soft/60 px-3 py-2.5">
          <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-subtle">{change.kind === "add-skill" ? "Add to skills" : "New bullet"}</p>
          <p className="text-sm">{change.after}</p>
        </div>
      ) : editing ? (
        <div className="flex flex-col gap-2">
          <Textarea aria-label="Edit suggestion" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} autoFocus />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                onEdit(draft);
                setEditing(false);
              }}
            >
              Save edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(change.original)}>
              Reset to suggestion
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-surface-2/70 px-3 py-2.5">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-subtle">Original</p>
            {change.before ? <DiffText before={change.before} after={change.after} side="before" /> : <p className="text-sm italic text-subtle">Empty</p>}
          </div>
          <div className="rounded-xl border border-success/20 bg-success-soft/40 px-3 py-2.5">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-subtle">Optimized</p>
            <DiffText before={change.before} after={change.after} side="after" />
          </div>
        </div>
      )}

      {change.warning && (
        <p className={cn("mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]", change.category === "blocked" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{change.warning}</span>
        </p>
      )}
      {change.reasons.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {change.reasons.map((r) => (
            <li key={r} className="flex items-center gap-1.5 text-xs text-muted">
              <span className="size-1 rounded-full bg-accent" aria-hidden /> {r}
            </li>
          ))}
        </ul>
      )}

      {!editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          {accepted ? (
            <Button size="sm" icon={<Undo2 className="size-3.5" />} onClick={() => onPatch({ status: "rejected" })}>
              Restore original
            </Button>
          ) : (
            <>
              <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} disabled={change.category === "blocked"} onClick={() => onPatch({ status: "accepted" })}>
                {rejected ? "Use suggestion" : "Accept"}
              </Button>
              {!rejected && (
                <Button size="sm" icon={<X className="size-3.5" />} onClick={() => onPatch({ status: "rejected" })}>
                  Reject
                </Button>
              )}
            </>
          )}
          {!isList && !isAdd && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Pencil className="size-3.5" />}
              onClick={() => {
                setDraft(change.after);
                setEditing(true);
              }}
            >
              Edit
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}

/* ───────── Smart questions ───────── */
function QuestionCard({ q, doc, onAnswer }: { q: Question; doc: CVDoc; onAnswer: (q: Question) => void }) {
  const [answer, setAnswer] = useState(q.answer ?? "");
  const [detail, setDetail] = useState(q.detail ?? "");
  const [itemId, setItemId] = useState(q.detailItemId ?? doc.content.experience[0]?.id ?? "");
  const answered = !!q.answer;
  const [editing, setEditing] = useState(!answered);

  if (answered && !editing) {
    const label = q.options.find((o) => o.value === q.answer)?.label ?? q.answer;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3">
        <p className="min-w-0 flex-1 text-sm">
          <span className="text-muted">{q.prompt}</span> <b className="font-medium">{q.detail && q.kind === "metric" ? q.detail : label}</b>
        </p>
        <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setEditing(true)}>
          Change answer
        </Button>
      </div>
    );
  }

  const submit = (a: string, d = detail) => {
    onAnswer({ ...q, answer: a, detail: d, detailItemId: itemId });
    setEditing(false);
  };

  return (
    <div className="rounded-2xl border border-warning/30 bg-surface p-4 shadow-sm sm:p-5">
      <p className="text-sm font-semibold">{q.prompt}</p>
      {q.context && <p className="mt-1 text-[13px] leading-relaxed text-muted">{q.kind === "metric" ? <>From your CV: “{q.context}”</> : q.context}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label={q.prompt}>
        {q.options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={answer === o.value}
            onClick={() => {
              setAnswer(o.value);
              if (q.kind === "metric" || o.value !== "yes") submit(o.value, q.kind === "metric" ? "" : detail);
            }}
            className={cn("h-9 rounded-lg border px-3 text-sm font-medium transition-colors", answer === o.value ? "border-accent bg-accent-soft text-accent-soft-fg" : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg")}
          >
            {o.label}
          </button>
        ))}
      </div>
      {q.kind === "metric" && (
        <form
          className="mt-3 flex max-w-sm gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (detail.trim()) submit("exact", detail.trim());
          }}
        >
          <Input aria-label="Exact value" placeholder="Or type an exact value, e.g. 150" value={detail} onChange={(e) => setDetail(e.target.value)} className="h-9" />
          <Button size="sm" type="submit" disabled={!detail.trim()} className="h-9">
            Use
          </Button>
        </form>
      )}
      {q.kind === "skill" && answer === "yes" && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-surface-2/60 p-3">
          <label className="text-[13px] font-medium text-muted" htmlFor={`d-${q.id}`}>
            Briefly describe it (optional) — we'll only use what you write
          </label>
          <Textarea id={`d-${q.id}`} rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="e.g. Built a 3-statement forecast model in Excel for the annual budget" />
          {detail.trim() && doc.content.experience.length > 0 && (
            <div className="max-w-sm">
              <label className="mb-1 block text-[13px] font-medium text-muted" htmlFor={`r-${q.id}`}>
                Add it to
              </label>
              <Select id={`r-${q.id}`} value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {doc.content.experience.map((e) => (
                  <option key={e.id} value={e.id}>
                    {[e.role, e.company].filter(Boolean).join(" · ") || "Untitled role"}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Button size="sm" variant="primary" onClick={() => submit("yes")}>
              {detail.trim() ? "Add to my CV" : "Add as a skill only"}
            </Button>
          </div>
        </div>
      )}
      {q.kind === "skill" && answer === "unsure" && <p className="mt-3 text-[13px] text-muted">No problem — we won't add it. Only include skills you can confidently discuss in an interview.</p>}
    </div>
  );
}

/* ───────── Review step ───────── */
const FILTERS = [
  { key: "all", label: "All" },
  { key: "summary", label: "Summary" },
  { key: "experience", label: "Experience" },
  { key: "skills", label: "Skills" },
  { key: "structure", label: "Structure" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function filterOf(c: Change): FilterKey {
  if (c.kind === "summary") return "summary";
  if (c.kind === "skills" || c.kind === "add-skill") return "skills";
  if (c.kind === "section-order" || c.kind === "item-order") return "structure";
  return "experience";
}

export function ReviewStep({
  doc,
  plan,
  scoreBefore,
  scoreAfter,
  optimizedDoc,
  onPatchChange,
  onEditChange,
  onAnswer,
  onAcceptAllSafe,
  onSave,
  onBack,
  saving,
}: {
  doc: CVDoc;
  plan: OptimizationPlan;
  scoreBefore: number;
  scoreAfter: number;
  optimizedDoc: Pick<CVDoc, "content" | "layout" | "design">;
  onPatchChange: (id: string, p: Partial<Change>) => void;
  onEditChange: (id: string, after: string) => void;
  onAnswer: (q: Question) => void;
  onAcceptAllSafe: () => void;
  onSave: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [compare, setCompare] = useState(false);
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: plan.changes.length, summary: 0, experience: 0, skills: 0, structure: 0 };
    for (const ch of plan.changes) c[filterOf(ch)]++;
    return c;
  }, [plan.changes]);
  const shown = plan.changes.filter((c) => filter === "all" || filterOf(c) === filter);
  const accepted = plan.changes.filter((c) => c.status === "accepted").length;
  const pendingSafe = plan.changes.filter((c) => c.status === "pending" && c.category === "safe").length;
  const unanswered = plan.questions.filter((q) => !q.answer).length;
  const delta = scoreAfter - scoreBefore;

  return (
    <div className="mx-auto max-w-4xl pb-28">
      {/* Score header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-wide text-subtle">Before</p>
            <p className="text-2xl font-semibold tabular-nums text-muted">{scoreBefore}</p>
          </div>
          <ArrowRight className="size-5 text-subtle" aria-hidden />
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-wide text-subtle">With accepted changes</p>
            <motion.p key={scoreAfter} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="text-2xl font-semibold tabular-nums" style={{ color: scoreTone(scoreAfter).color }}>
              {scoreAfter}
              {delta !== 0 && <span className="ml-1.5 align-middle text-sm font-medium text-success">{delta > 0 ? `+${delta}` : delta}</span>}
            </motion.p>
          </div>
          <ScoreExplainer />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Columns2 className="size-4" />} onClick={() => setCompare(true)}>
            Compare full CV
          </Button>
          <Button size="sm" variant="accent-soft" icon={<CheckCheck className="size-4" />} disabled={!pendingSafe} onClick={onAcceptAllSafe}>
            Accept all safe changes{pendingSafe ? ` (${pendingSafe})` : ""}
          </Button>
        </div>
      </div>

      {/* Questions */}
      {plan.questions.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold">A few quick questions {unanswered > 0 && <Badge tone="warning">{unanswered} open</Badge>}</h2>
          <p className="mb-3 mt-1 text-sm text-muted">Your answers let us strengthen your CV without guessing. Skip any you're unsure about.</p>
          <div className="flex flex-col gap-3">
            {plan.questions.map((q) => (
              <QuestionCard key={q.id} q={q} doc={doc} onAnswer={onAnswer} />
            ))}
          </div>
        </section>
      )}

      {/* Changes */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">Suggested changes</h2>
            <p className="mt-1 text-sm text-muted">{accepted} of {plan.changes.length} accepted. Review each one — you're in control.</p>
          </div>
        </div>
        <div className="scroll-thin -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter changes">
          {FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0).map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn("h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium transition-colors", filter === f.key ? "border-fg bg-fg text-bg" : "border-border bg-surface text-muted hover:text-fg")}
            >
              {f.label} <span className="ml-0.5 tabular-nums opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        {plan.changes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">Your CV already reads well for this job — no text changes needed. Answer the questions above if you'd like to add more detail.</div>
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {shown.map((c) => (
                <ChangeCard key={c.id} change={c} onPatch={(p) => onPatchChange(c.id, p)} onEdit={(a) => onEditChange(c.id, a)} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Not added */}
      {plan.doNotAdd.length > 0 && (
        <section className="mt-8 rounded-2xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <XCircle className="size-4 text-danger" aria-hidden /> Not added to your CV
          </h2>
          <p className="mb-3 mt-1 text-sm text-muted">The job mentions these, but your CV doesn't show them — so we didn't add them. If you genuinely have this experience, add it yourself in your own words.</p>
          <div className="flex flex-wrap gap-1.5">
            {plan.doNotAdd.map((k) => (
              <Badge key={k.term} className="px-2 py-1 text-xs">
                × {k.term}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {/* Transparency: what the quality check filtered out */}
      {plan.rejected && plan.rejected.length > 0 && (
        <details className="mt-4 rounded-2xl border border-border bg-surface p-5">
          <summary className="cursor-pointer text-sm font-semibold">
            Quality check filtered {plan.rejected.length} suggestion{plan.rejected.length === 1 ? "" : "s"}
          </summary>
          <p className="mb-3 mt-1 text-xs text-muted">Every change must be true, relevant, belong in its section, read naturally and avoid keyword stuffing. These didn't pass:</p>
          <ul className="flex flex-col gap-2">
            {plan.rejected.map((r, i) => (
              <li key={i} className="rounded-lg bg-surface-2/70 px-3 py-2 text-[13px]">
                <span className="font-medium">{r.label}</span> — <span className="text-muted">{r.reason}</span>
                <span className="mt-0.5 block text-xs italic text-subtle line-clamp-2">“{r.text}”</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={onBack}>
            Back to analysis
          </Button>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">
              {accepted} change{accepted === 1 ? "" : "s"} accepted
            </span>
            <Button variant="primary" loading={saving} onClick={onSave} disabled={accepted === 0}>
              Save optimized version
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={compare} onOpenChange={setCompare} title="Compare full CV" description="Left: your original. Right: with the changes you've accepted." size="xl">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Original</p>
            <CVPreview doc={doc} showPlaceholders={false} />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Optimized</p>
            <CVPreview doc={optimizedDoc} showPlaceholders={false} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}

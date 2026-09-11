"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "motion/react";
import { FilePen, GitBranch, Lock, Plus, Sparkles } from "lucide-react";
import { QuickActions } from "@/components/app/QuickActions";
import { useStore } from "@/lib/store";
import type { CVDoc } from "@/lib/cv/schema";
import { templateMeta } from "@/lib/cv/meta";
import { relativeTime } from "@/lib/utils";
import { CVThumbnail } from "@/components/cv/CVPreview";
import { CVActionsMenu } from "@/components/app/CVActions";
import { StartOptions } from "@/components/app/StartOptions";
import { Button } from "@/components/ui/Button";
import { Badge, scoreTone } from "@/components/ui/misc";

export default function DashboardPage() {
  const cvs = useStore((s) => s.cvs);
  const { roots, versionsOf } = useMemo(() => {
    const all = Object.values(cvs).sort((a, b) => b.updatedAt - a.updatedAt);
    const ids = new Set(all.map((d) => d.id));
    const roots = all.filter((d) => !d.parentId || !ids.has(d.parentId));
    const versionsOf = (id: string) => all.filter((d) => d.parentId === id);
    return { roots, versionsOf };
  }, [cvs]);

  if (!roots.length) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8 sm:py-16">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8 max-w-xl">
          <Badge tone="accent" className="mb-4">
            <Sparkles className="size-3" aria-hidden /> Free forever · no sign-up
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Create your first CV</h1>
          <p className="mt-2 text-[15px] text-muted">How do you want to start? You can tailor it to any job afterwards.</p>
        </motion.div>
        <StartOptions />
        <p className="mt-5 text-sm text-muted">
          Already have a CV as a PDF?{" "}
          <Link href="/app/pdf" className="font-medium text-accent hover:underline">
            Edit it directly
          </Link>
        </p>
        <PdfList />
        <p className="mt-8 flex items-center gap-2 text-sm text-subtle">
          <Lock className="size-4" aria-hidden /> Your CVs are stored privately in this browser. We never sell or share your data.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">My CVs</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <Lock className="size-3.5" aria-hidden /> Saved privately in this browser
          </p>
        </div>
        <Link href="/app/new">
          <Button variant="primary" icon={<Plus className="size-4" />}>
            Create new CV
          </Button>
        </Link>
      </div>
      <div className="mb-8">
        <QuickActions />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {roots.map((doc, i) => (
          <motion.div key={doc.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            <CVCard doc={doc} versions={versionsOf(doc.id)} />
          </motion.div>
        ))}
        <Link
          href="/app/new"
          className="group flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong/80 text-muted transition-colors hover:border-accent/50 hover:bg-accent-soft/40 hover:text-accent"
        >
          <span className="mb-3 flex size-11 items-center justify-center rounded-xl border border-border bg-surface shadow-sm transition-transform group-hover:scale-105">
            <Plus className="size-5" aria-hidden />
          </span>
          <span className="text-sm font-medium">Create new CV</span>
          <span className="mt-1 text-xs text-subtle">From scratch, import or template</span>
        </Link>
      </div>
      <PdfList />
    </div>
  );
}

function PdfList() {
  const pdfs = useStore((s) => s.pdfs);
  const list = useMemo(() => Object.values(pdfs).sort((a, b) => b.updatedAt - a.updatedAt), [pdfs]);
  if (!list.length) return null;
  return (
    <section className="mt-10">
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
        <FilePen className="size-4 text-accent" aria-hidden /> Edited PDFs
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {list.map((p) => (
          <li key={p.id}>
            <Link href={`/app/pdf/${p.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 pl-4 transition-colors hover:border-accent/40">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="text-xs text-subtle">
                  {p.edits.length} change{p.edits.length === 1 ? "" : "s"} · {relativeTime(p.updatedAt)} · original kept
                </span>
              </span>
              {p.kind === "scanned" && <Badge tone="warning">Scanned</Badge>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CVCard({ doc, versions }: { doc: CVDoc; versions: CVDoc[] }) {
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-[box-shadow,border-color] duration-200 hover:border-border-strong hover:shadow-md">
      <Link href={`/app/cv/${doc.id}`} className="relative flex h-48 justify-center overflow-hidden bg-surface-2 pt-5" aria-label={`Open ${doc.name}`}>
        <div className="rounded-t-[3px] shadow-md ring-1 ring-black/5 transition-transform duration-300 group-hover:-translate-y-1">
          <CVThumbnail doc={doc} width={184} />
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/app/cv/${doc.id}`} className="block truncate text-[15px] font-semibold hover:text-accent">
              {doc.name}
            </Link>
            <p className="mt-0.5 text-xs text-subtle">Last edited: {relativeTime(doc.updatedAt)}</p>
          </div>
          <CVActionsMenu doc={doc} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge>{templateMeta(doc.design.template).name}</Badge>
          {templateMeta(doc.design.template).atsFriendly && <Badge tone="success">ATS-friendly</Badge>}
          {doc.jobTarget?.score != null && <ScoreBadge score={doc.jobTarget.score} />}
        </div>
        {versions.length > 0 && (
          <div className="rounded-xl border border-border bg-surface-2/60 p-1.5">
            <p className="flex items-center gap-1.5 px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-subtle">
              <GitBranch className="size-3" aria-hidden /> Tailored versions
            </p>
            <ul>
              {versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-surface">
                  <Link href={`/app/cv/${v.id}`} className="min-w-0 flex-1 truncate text-[13px] hover:text-accent">
                    {v.name}
                  </Link>
                  {v.jobTarget?.score != null && <ScoreBadge score={v.jobTarget.score} small />}
                  <CVActionsMenu doc={v} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-auto flex gap-2 pt-1">
          <Link href={`/app/cv/${doc.id}`} className="flex-1">
            <Button size="sm" className="w-full">
              Open
            </Button>
          </Link>
          <Link href={`/app/cv/${doc.id}/optimize`} className="flex-1">
            <Button size="sm" variant="accent-soft" className="w-full" icon={<Sparkles className="size-3.5" />}>
              Optimize for Job
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function ScoreBadge({ score, small }: { score: number; small?: boolean }) {
  const tone = scoreTone(score);
  return (
    <span className={`inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 font-medium tabular-nums ${small ? "text-[10px]" : "text-[11px]"}`} title="Estimated job match score">
      <span className="size-1.5 rounded-full" style={{ background: tone.color }} aria-hidden />
      {score} match
    </span>
  );
}

"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, FileText, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { relativeTime } from "@/lib/utils";
import { CVThumbnail } from "@/components/cv/CVPreview";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/misc";

export default function OptimizePickerPage() {
  const cvs = useStore((s) => s.cvs);
  const list = useMemo(() => Object.values(cvs).sort((a, b) => b.updatedAt - a.updatedAt), [cvs]);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="mb-8">
        <span className="mb-3 inline-flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Job Optimizer</h1>
        <p className="mt-1.5 max-w-xl text-muted">Choose the CV you want to tailor. We'll analyze the job, show your match, and suggest honest improvements — saved as a new version.</p>
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Create your first CV"
          description="You need a CV before you can tailor it to a job. Build one or import your existing CV."
          action={
            <Link href="/app/new">
              <Button variant="primary">Create CV</Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((d) => (
            <li key={d.id}>
              <Link href={`/app/cv/${d.id}/optimize`} className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-3 shadow-sm transition-[border-color,box-shadow] hover:border-accent/40 hover:shadow-md">
                <div className="h-[92px] overflow-hidden rounded-md ring-1 ring-black/5">
                  <CVThumbnail doc={d} width={66} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{d.name}</p>
                  <p className="mt-0.5 text-xs text-subtle">Edited {relativeTime(d.updatedAt)}</p>
                  {d.jobTarget && <p className="mt-1 truncate text-xs text-muted">Tailored for {d.jobTarget.title || "a job"}</p>}
                </div>
                <ArrowRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

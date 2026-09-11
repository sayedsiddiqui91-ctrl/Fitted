"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { DEFAULT_DESIGN, SAMPLE_JOB, sampleContent } from "@/lib/cv/defaults";

/** One-click demo: creates an example CV and opens the Job Optimizer with a sample job. */
export default function TryOptimizerPage() {
  const router = useRouter();
  const done = useRef(false);
  const createCV = useStore((s) => s.createCV);
  const saveSession = useStore((s) => s.saveSession);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const existing = Object.values(useStore.getState().cvs).find((d) => d.name === "Example CV (demo)" && !d.parentId);
    const id = existing?.id ?? createCV({ name: "Example CV (demo)", content: sampleContent(), design: { ...DEFAULT_DESIGN } });
    saveSession({ cvId: id, jobText: SAMPLE_JOB, jobTitle: "", company: "", analysis: null, match: null, mode: "balanced", plan: null, step: "job", versionName: "", engine: "local", updatedAt: Date.now() });
    router.replace(`/app/cv/${id}/optimize`);
  }, [createCV, saveSession, router]);

  return (
    <div className="flex min-h-[60dvh] items-center justify-center gap-2 text-sm text-muted" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden /> Setting up a demo with an example CV…
    </div>
  );
}

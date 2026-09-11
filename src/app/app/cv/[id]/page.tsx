"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { AssistantJobContext, AssistantSelection } from "@/lib/ai/types";
import { analyzeJobDescription } from "@/lib/engine/jobAnalysis";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ClipboardCheck,
  Cloud,
  Eye,
  FileDown,
  FileText,
  GitBranch,
  Loader2,
  MessageSquareText,
  Mic,
  MoreHorizontal,
  Palette,
  PenLine,
  Plus,
  Printer,
  Redo2,
  Sparkles,
  Target,
  Undo2,
  X,
} from "lucide-react";
import { familyOf, useCV, useStore } from "@/lib/store";
import type { CVDoc } from "@/lib/cv/schema";
import { templateMeta } from "@/lib/cv/meta";
import { downloadPdf, printCv } from "@/lib/export/pdf";
import { downloadDocx } from "@/lib/export/docx";
import { cn } from "@/lib/utils";
import { CVPreview } from "@/components/cv/CVPreview";
import { ContentPanel, type FocusRequest } from "@/components/editor/ContentPanel";
import { DesignPanel } from "@/components/editor/DesignPanel";
import { ReviewSheet } from "@/components/editor/ReviewSheet";
import { AssistantSheet } from "@/components/editor/AssistantSheet";
import type { AskTarget } from "@/components/editor/SectionEditors";
import { Button, IconButton, Tip } from "@/components/ui/Button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/Menu";
import { Badge, Segmented, scoreTone } from "@/components/ui/misc";
import { ThemeToggle } from "@/components/Brand";

export default function EditorRoute() {
  return (
    <Suspense>
      <Editor />
    </Suspense>
  );
}

function Editor() {
  const { id } = useParams<{ id: string }>();
  const doc = useCV(id);
  if (!doc) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <FileText className="size-10 text-subtle" aria-hidden />
        <h1 className="text-xl font-semibold">We couldn't find this CV</h1>
        <p className="max-w-sm text-sm text-muted">It may have been deleted, or it was created in a different browser. CVs are stored privately on the device where you made them.</p>
        <Link href="/app">
          <Button variant="primary">Back to my CVs</Button>
        </Link>
      </div>
    );
  }
  return <EditorInner doc={doc} />;
}

function EditorInner({ doc }: { doc: CVDoc }) {
  const router = useRouter();
  const params = useSearchParams();
  const updateCV = useStore((s) => s.updateCV);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => (s.historyTick, s.canUndo(doc.id)));
  const canRedo = useStore((s) => (s.historyTick, s.canRedo(doc.id)));
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  const update = useCallback((recipe: (d: CVDoc) => void) => updateCV(doc.id, recipe), [doc.id, updateCV]);
  const [tab, setTab] = useState<"content" | "design">("content");
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState<"fit" | "100">("fit");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [selection, setSelection] = useState<AssistantSelection>({ scope: "global", label: "Whole CV" });
  const sessions = useStore((s) => s.sessions);
  /* Job context for the assistant: the optimizer session for this CV (or its original), else the tailored version's saved job */
  const job = useMemo<AssistantJobContext | null>(() => {
    const sess = sessions[doc.id] ?? (doc.parentId ? sessions[doc.parentId] : undefined);
    let analysis = sess?.analysis && (!doc.jobTarget || sess.jobText === doc.jobTarget.description) ? sess.analysis : null;
    if (!analysis && doc.jobTarget?.description) analysis = analyzeJobDescription(doc.jobTarget.description);
    if (!analysis) return null;
    return { title: analysis.jobTitle || doc.jobTarget?.title || "", company: analysis.company || doc.jobTarget?.company || "", analysis, match: null };
  }, [sessions, doc.id, doc.parentId, doc.jobTarget]);
  const [focusReq, setFocusReq] = useState<FocusRequest | null>(null);
  const [welcome, setWelcome] = useState(params.get("welcome") === "1");
  const imported = params.get("imported") === "1";

  // Undo / redo shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo(doc.id);
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo(doc.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc.id, undo, redo]);

  const ask = useCallback((t: AskTarget) => {
    setSelection(t.bulletId ? { scope: "bullet", section: t.section, itemId: t.itemId, bulletId: t.bulletId, label: t.label } : { scope: "section", section: t.section, label: t.label });
    setAssistantOpen(true);
  }, []);

  const hasContent = doc.content.experience.length > 0 || doc.content.summary.trim().length > 0;
  const showOptimizeHint = hasContent && !settings.seenOptimizeHint && !doc.jobTarget;

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <TopBar doc={doc} canUndo={canUndo} canRedo={canRedo} onUndo={() => undo(doc.id)} onRedo={() => redo(doc.id)} onReview={() => setReviewOpen(true)} onAssistant={() => setAssistantOpen(true)} />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(400px,480px)_1fr] xl:grid-cols-[520px_1fr]">
        {/* ── Editing panel ── */}
        <section aria-label="Edit CV" className={cn("scroll-thin min-h-0 overflow-y-auto border-r border-border bg-bg pb-28 lg:block lg:pb-10", view === "edit" ? "block" : "hidden")}>
          <div className="sticky top-0 z-10 border-b border-border bg-bg/90 px-4 py-2.5 backdrop-blur-md sm:px-5">
            <Segmented
              label="Editor mode"
              value={tab}
              onChange={setTab}
              className="w-full"
              options={[
                { value: "content", label: "Content", icon: <PenLine className="size-3.5" aria-hidden /> },
                { value: "design", label: "Design", icon: <Palette className="size-3.5" aria-hidden /> },
              ]}
            />
          </div>
          <div className="flex flex-col gap-3 px-3 py-4 sm:px-5">
            {doc.jobTarget && <TailoredBanner doc={doc} />}
            <AnimatePresence>
              {welcome && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="flex items-start gap-3 rounded-2xl border border-accent/25 bg-accent-soft/60 p-4">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{imported ? "Your CV was imported" : "Your CV is ready to edit"}</p>
                    <p className="mt-0.5 text-muted">{imported ? "Review each section below — extraction isn't always perfect. The preview updates as you type." : "Fill in each section. Changes save automatically and the preview updates instantly."}</p>
                  </div>
                  <IconButton label="Dismiss" size="sm" onClick={() => setWelcome(false)}>
                    <X className="size-4" />
                  </IconButton>
                </motion.div>
              )}
            </AnimatePresence>
            {showOptimizeHint && !welcome && (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg">
                  <Target className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">Want to tailor this CV to a specific job?</p>
                  <p className="text-muted">Paste a job description and see how well you match.</p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => updateSettings({ seenOptimizeHint: true })}>
                    Later
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => router.push(`/app/cv/${doc.id}/optimize`)}>
                    Optimize for a Job
                  </Button>
                </div>
              </div>
            )}
            {tab === "content" ? <ContentPanel doc={doc} update={update} onAsk={ask} focus={focusReq} onFocusTarget={setSelection} /> : <DesignPanel doc={doc} update={update} />}
          </div>
        </section>

        {/* ── Live preview ── */}
        <section aria-label="CV preview" className={cn("scroll-thin min-h-0 overflow-y-auto bg-surface-2/70 pb-28 lg:block lg:pb-10", view === "preview" ? "block" : "hidden")}>
          <PreviewToolbar doc={doc} pages={pages} zoom={zoom} setZoom={setZoom} onDesign={() => setTab("design")} />
          <div className="px-3 pb-10 pt-2 sm:px-8">
            <div className={cn("mx-auto", zoom === "fit" ? "max-w-[860px]" : "")}>
              <CVPreview doc={doc} zoom={zoom === "fit" ? "fit" : 1} onPages={setPages} />
            </div>
          </div>
        </section>
      </div>

      {/* Mobile bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-surface/95 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          className="flex-1"
          options={[
            { value: "edit", label: "Edit", icon: <PenLine className="size-3.5" aria-hidden /> },
            { value: "preview", label: `Preview${pages > 1 ? ` · ${pages}p` : ""}`, icon: <Eye className="size-3.5" aria-hidden /> },
          ]}
        />
        <Button variant="primary" size="md" icon={<Sparkles className="size-4" />} onClick={() => router.push(`/app/cv/${doc.id}/optimize`)}>
          Optimize
        </Button>
      </div>

      <ReviewSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        doc={doc}
        pages={pages}
        onJump={(section) => {
          setTab("content");
          setView("edit");
          setFocusReq({ key: section, nonce: Date.now() });
        }}
      />
      <AssistantSheet open={assistantOpen} onOpenChange={setAssistantOpen} doc={doc} update={update} selection={selection} setSelection={setSelection} job={job} />
    </div>
  );
}

/* ───────────────────────── Top bar ───────────────────────── */
function TopBar({ doc, canUndo, canRedo, onUndo, onRedo, onReview, onAssistant }: { doc: CVDoc; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; onReview: () => void; onAssistant: () => void }) {
  const router = useRouter();
  const renameCV = useStore((s) => s.renameCV);
  const [name, setName] = useState(doc.name);
  const [lastName, setLastName] = useState(doc.name);
  if (doc.name !== lastName) {
    setLastName(doc.name);
    setName(doc.name);
  }
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setSaving(true);
    const t = setTimeout(() => setSaving(false), 650);
    return () => clearTimeout(t);
  }, [doc.updatedAt]);

  const exportPdf = async () => {
    setExporting(true);
    try {
      const mode = await downloadPdf(doc);
      if (mode === "download") toast.success("PDF downloaded", { description: "Free, no watermark. Good luck!" });
      else toast("Choose “Save as PDF” in the print dialog", { description: "Tip: turn off “Headers and footers”." });
    } catch {
      toast.error("We couldn't create the PDF", { description: "Try again, or use Print → Save as PDF." });
    } finally {
      setExporting(false);
    }
  };

  const exportDocx = async () => {
    const t = toast.loading("Creating Word document…");
    try {
      await downloadDocx(doc);
      toast.success("DOCX downloaded", { id: t, description: "Uses a clean single-column layout." });
    } catch {
      toast.error("We couldn't create the Word file. Please try again.", { id: t });
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-border bg-surface px-2 sm:gap-2 sm:px-3">
      <Link href="/app" aria-label="Back to my CVs" className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
        <ArrowLeft className="size-[18px]" />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() !== doc.name && renameCV(doc.id, name)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label="CV name"
          className="h-9 min-w-0 max-w-[min(320px,100%)] flex-1 truncate rounded-lg border border-transparent bg-transparent px-2 text-[15px] font-semibold hover:border-border focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15"
        />
        <VersionSwitcher doc={doc} />
        <span className="hidden items-center gap-1 whitespace-nowrap text-xs text-subtle md:inline-flex" aria-live="polite">
          {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Cloud className="size-3.5" aria-hidden />}
          {saving ? "Saving…" : "Saved"}
        </span>
      </div>

      <div className="hidden items-center sm:flex">
        <IconButton label="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo} size="sm">
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" onClick={onRedo} disabled={!canRedo} size="sm">
          <Redo2 className="size-4" />
        </IconButton>
      </div>
      <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
      <Button variant="ghost" size="sm" className="hidden md:inline-flex" icon={<MessageSquareText className="size-4" />} onClick={onAssistant}>
        Assistant
      </Button>
      <Button variant="ghost" size="sm" className="hidden md:inline-flex" icon={<ClipboardCheck className="size-4" />} onClick={onReview}>
        Review My CV
      </Button>
      <Button variant="accent-soft" size="sm" className="hidden lg:inline-flex" icon={<Sparkles className="size-4" />} onClick={() => router.push(`/app/cv/${doc.id}/optimize`)}>
        Optimize for a Job
      </Button>

      <div className="flex items-center">
        <Button variant="primary" size="sm" loading={exporting} icon={<FileDown className="size-4" />} onClick={exportPdf} className="rounded-r-none">
          <span className="hidden sm:inline">Download PDF</span>
          <span className="sm:hidden">PDF</span>
        </Button>
        <Menu
          trigger={
            <button type="button" aria-label="More export options" className="inline-flex h-8 items-center rounded-r-lg border-l border-white/20 bg-accent px-1.5 text-accent-fg hover:bg-accent-hover">
              <ChevronDown className="size-4" />
            </button>
          }
        >
          <MenuItem icon={<FileDown />} onSelect={exportPdf}>
            Download PDF
          </MenuItem>
          <MenuItem icon={<FileText />} onSelect={exportDocx}>
            Download DOCX
          </MenuItem>
          <MenuItem icon={<Printer />} onSelect={() => printCv(doc)}>
            Print
          </MenuItem>
        </Menu>
      </div>

      <Menu
        trigger={
          <IconButton label="More" size="sm" tooltip={false} className="md:hidden">
            <MoreHorizontal className="size-4" />
          </IconButton>
        }
      >
        <MenuItem icon={<Sparkles />} onSelect={() => router.push(`/app/cv/${doc.id}/optimize`)}>
          Optimize for a Job
        </MenuItem>
        <MenuItem icon={<ClipboardCheck />} onSelect={onReview}>
          Review My CV
        </MenuItem>
        <MenuItem icon={<MessageSquareText />} onSelect={onAssistant}>
          Assistant
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Undo2 />} onSelect={onUndo} disabled={!canUndo}>
          Undo
        </MenuItem>
        <MenuItem icon={<Redo2 />} onSelect={onRedo} disabled={!canRedo}>
          Redo
        </MenuItem>
      </Menu>
      <div className="hidden xl:block">
        <ThemeToggle />
      </div>
    </header>
  );
}

function VersionSwitcher({ doc }: { doc: CVDoc }) {
  const router = useRouter();
  const cvs = useStore((s) => s.cvs);
  const duplicateCV = useStore((s) => s.duplicateCV);
  const family = familyOf(cvs, doc.id);
  const isRoot = family[0]?.id === doc.id;
  return (
    <Menu
      align="start"
      trigger={
        <button type="button" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-2 text-xs font-medium text-muted hover:text-fg" aria-label="Switch version">
          <GitBranch className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">{isRoot ? "Original" : "Tailored version"}</span>
          {family.length > 1 && <span className="rounded bg-surface-3 px-1 tabular-nums">{family.length}</span>}
          <ChevronDown className="size-3" aria-hidden />
        </button>
      }
    >
      <MenuLabel>Versions of this CV</MenuLabel>
      {family.map((v, i) => (
        <MenuItem key={v.id} icon={v.id === doc.id ? <Check /> : <FileText />} onSelect={() => router.push(`/app/cv/${v.id}`)} hint={v.jobTarget?.score != null ? `${v.jobTarget.score}` : i === 0 ? "Original" : undefined}>
          <span className="block max-w-56 truncate">{v.name}</span>
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem
        icon={<Plus />}
        onSelect={() => {
          const id = duplicateCV(doc.id, { name: `${doc.name} — new version`, parentId: doc.id, jobTarget: null });
          if (id) {
            toast.success("New version created", { description: "The current version is unchanged." });
            router.push(`/app/cv/${id}`);
          }
        }}
      >
        New version from this
      </MenuItem>
      <MenuItem icon={<Sparkles />} onSelect={() => router.push(`/app/cv/${doc.id}/optimize`)}>
        Tailor a version for a job
      </MenuItem>
    </Menu>
  );
}

function TailoredBanner({ doc }: { doc: CVDoc }) {
  const jt = doc.jobTarget!;
  const tone = scoreTone(jt.score ?? 0);
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg">
          <Target className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-subtle">Tailored for</p>
          <p className="truncate text-sm font-semibold">{[jt.title, jt.company].filter(Boolean).join(" · ") || "a job"}</p>
          {jt.score != null && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <span className="size-2 rounded-full" style={{ background: tone.color }} aria-hidden />
              Estimated match {jt.scoreBefore != null ? `${jt.scoreBefore} → ` : ""}
              <b className="font-semibold text-fg">{jt.score}</b>
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/app/cv/${doc.id}/interview`}>
          <Button size="sm" icon={<Mic className="size-3.5" />}>
            Prepare me for this job
          </Button>
        </Link>
        <Link href={`/app/cv/${doc.id}/optimize`}>
          <Button size="sm" variant="ghost" icon={<Sparkles className="size-3.5" />}>
            Re-check match
          </Button>
        </Link>
      </div>
    </div>
  );
}

function PreviewToolbar({ doc, pages, zoom, setZoom, onDesign }: { doc: CVDoc; pages: number; zoom: "fit" | "100"; setZoom: (z: "fit" | "100") => void; onDesign: () => void }) {
  const over = pages > doc.design.targetPages;
  const tm = templateMeta(doc.design.template);
  return (
    <div className="sticky top-0 z-10 px-3 pt-3 sm:px-8">
      <div className="mx-auto flex max-w-[860px] flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface/90 px-3 py-2 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-2 text-xs">
          <Tip content={over ? `Your target is ${doc.design.targetPages} page${doc.design.targetPages > 1 ? "s" : ""}. Try trimming older roles, shortening bullets, or reducing spacing in Design.` : "Estimated page count based on your current content and design."}>
            <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium", over ? "bg-warning-soft text-warning" : "bg-success-soft text-success")} tabIndex={0}>
              {over ? <AlertTriangle className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
              {pages} page{pages > 1 ? "s" : ""}
              {over && <span className="font-normal">· target {doc.design.targetPages}</span>}
            </span>
          </Tip>
          <button type="button" onClick={onDesign} className="hidden rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-fg sm:inline-flex">
            {tm.name} · {doc.design.pageSize}
          </button>
          {tm.atsFriendly && <Badge tone="success" className="hidden sm:inline-flex">ATS-friendly</Badge>}
        </div>
        <Segmented size="sm" label="Zoom" value={zoom} onChange={setZoom} options={[{ value: "fit", label: "Fit" }, { value: "100", label: "100%" }]} />
      </div>
      {pages >= 3 && (
        <div role="status" className="mx-auto mt-2 flex max-w-[860px] items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-muted">
            <b className="font-semibold text-fg">Your CV is currently {pages} pages.</b> For most roles, consider reducing it to 1–2 pages — trim older roles to 1–2 bullets and remove less relevant items. Nothing is deleted automatically.
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Check, ClipboardPaste, FileUp, Loader2, ShieldCheck, Upload } from "lucide-react";
import { useStore } from "@/lib/store";
import { DEFAULT_DESIGN, defaultLayout, sampleContent, TEMPLATE_DESIGN_DEFAULTS } from "@/lib/cv/defaults";
import { TEMPLATES } from "@/lib/cv/meta";
import type { CVContent, Design, Layout, TemplateId } from "@/lib/cv/schema";
import type { ParsedSection } from "@/lib/engine/parseResume";
import { extractForImport, type ImportExtraction } from "@/lib/import/extract";
import { parseResume, withMinDuration } from "@/lib/ai/client";
import { cn, friendlyError, relativeTime } from "@/lib/utils";
import { StartOptions } from "@/components/app/StartOptions";
import { ImportReview } from "@/components/app/ImportReview";
import { CVThumbnail } from "@/components/cv/CVPreview";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Badge, Segmented } from "@/components/ui/misc";

export default function NewCVPage() {
  return (
    <Suspense>
      <NewCV />
    </Suspense>
  );
}

function designFor(template: TemplateId) {
  return { ...DEFAULT_DESIGN, ...TEMPLATE_DESIGN_DEFAULTS[template], template };
}

function NewCV() {
  const params = useSearchParams();
  const mode = params.get("mode") ?? "choose";
  const hasCVs = useStore((s) => Object.keys(s.cvs).length > 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
      {mode !== "choose" && (
        <Link href="/app/new" className="mb-6 inline-flex items-center gap-1.5 rounded-lg text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> All options
        </Link>
      )}
      <>
        <motion.div key={mode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
          {mode === "choose" && (
            <>
              <h1 className="text-3xl font-semibold tracking-tight">How do you want to start?</h1>
              <p className="mb-8 mt-2 text-muted">Everything stays editable. You can switch templates any time without losing content.</p>
              <StartOptions showCopy={hasCVs} />
            </>
          )}
          {mode === "scratch" && <Scratch />}
          {mode === "import" && <ImportFlow />}
          {mode === "template" && <TemplateGallery />}
          {mode === "copy" && <CopyExisting />}
        </motion.div>
      </>
    </div>
  );
}

function TemplateChips({ value, onChange }: { value: TemplateId; onChange: (t: TemplateId) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Template">
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn("h-9 rounded-lg border px-3 text-sm font-medium transition-colors", value === t.id ? "border-accent bg-accent-soft text-accent-soft-fg" : "border-border bg-surface text-muted hover:text-fg")}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}

function Scratch() {
  const router = useRouter();
  const createCV = useStore((s) => s.createCV);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<TemplateId>("modern");
  const create = () => {
    const id = createCV({ name: name.trim() || "My CV", design: designFor(template) });
    router.push(`/app/cv/${id}?welcome=1`);
  };
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">Build from scratch</h1>
      <p className="mb-8 mt-1.5 text-muted">Give your CV a name so you can find it later — for example the kind of role it's for.</p>
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <Field label="CV name" hint="Only you see this name.">
          {(p) => <Input {...p} autoFocus placeholder="e.g. Finance CV" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
        </Field>
        <div>
          <p className="mb-2 text-[13px] font-medium text-muted">Template</p>
          <TemplateChips value={template} onChange={setTemplate} />
        </div>
        <div>
          <Button type="submit" variant="primary" size="lg">
            Create CV
          </Button>
        </div>
      </form>
    </div>
  );
}

function TemplateGallery() {
  const router = useRouter();
  const createCV = useStore((s) => s.createCV);
  const sample = useMemo(() => sampleContent(), []);
  const [picked, setPicked] = useState<TemplateId | null>(null);
  const start = (withExample: boolean) => {
    if (!picked) return;
    const id = createCV({ name: withExample ? "Example CV" : "My CV", design: designFor(picked), ...(withExample ? { content: sampleContent() } : {}) });
    router.push(`/app/cv/${id}?welcome=1`);
  };
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a template</h1>
      <p className="mb-8 mt-1.5 text-muted">All templates use real, selectable text. Templates marked ATS-friendly are best for online applications.</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPicked(t.id)}
            aria-pressed={picked === t.id}
            className={cn("group rounded-2xl border bg-surface p-2.5 text-left transition-[border-color,box-shadow] duration-200", picked === t.id ? "border-accent shadow-md ring-3 ring-accent/15" : "border-border hover:border-border-strong hover:shadow-sm")}
          >
            <div className="flex justify-center overflow-hidden rounded-lg bg-surface-2 p-2">
              <div className="shadow-sm ring-1 ring-black/5">
                <CVThumbnail doc={{ content: sample, layout: { order: ["summary", "experience", "education", "skills", "certifications", "languages"], hidden: [], titles: {} }, design: designFor(t.id) }} width={150} />
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-1 px-1">
              <span className="text-sm font-semibold">{t.name}</span>
              {picked === t.id && <Check className="size-4 text-accent" aria-hidden />}
            </div>
            <p className="px-1 text-xs text-subtle">{t.bestFor}</p>
            <div className="mt-2 px-1">{t.atsFriendly ? <Badge tone="success">ATS-friendly</Badge> : <Badge>Visual</Badge>}</div>
          </button>
        ))}
      </div>
      <div className="sticky bottom-20 mt-8 flex flex-wrap gap-3 lg:bottom-4">
        <Button variant="primary" size="lg" disabled={!picked} onClick={() => start(false)}>
          Start with this template
        </Button>
        <Button size="lg" disabled={!picked} onClick={() => start(true)}>
          See it with example content
        </Button>
      </div>
    </div>
  );
}

function CopyExisting() {
  const router = useRouter();
  const cvs = useStore((s) => s.cvs);
  const duplicateCV = useStore((s) => s.duplicateCV);
  const list = Object.values(cvs).sort((a, b) => b.updatedAt - a.updatedAt);
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState("");
  const create = () => {
    if (!picked) return;
    const src = cvs[picked];
    const id = duplicateCV(picked, { name: name.trim() || `${src.name} — new version`, parentId: picked, jobTarget: null });
    if (id) {
      toast.success("New version created", { description: `“${src.name}” is unchanged.` });
      router.push(`/app/cv/${id}`);
    }
  };
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Reuse a saved CV</h1>
      <p className="mb-6 mt-1.5 text-muted">We'll make a new version. The original stays exactly as it is.</p>
      <ul className="mb-6 flex flex-col gap-2" role="radiogroup" aria-label="Choose a CV">
        {list.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              role="radio"
              aria-checked={picked === d.id}
              onClick={() => {
                setPicked(d.id);
                setName(`${d.name} — new version`);
              }}
              className={cn("flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors", picked === d.id ? "border-accent bg-accent-soft/60" : "border-border bg-surface hover:bg-surface-2")}
            >
              <span>
                <span className="block text-sm font-medium">{d.name}</span>
                <span className="text-xs text-subtle">Last edited {relativeTime(d.updatedAt)}</span>
              </span>
              {picked === d.id && <Check className="size-4 text-accent" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>
      {picked && (
        <div className="flex flex-col gap-4">
          <Field label="New version name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}</Field>
          <div>
            <Button variant="primary" size="lg" onClick={create}>
              Create new version
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Import ───────────────────────── */

type Stage = "idle" | "reading" | "structuring" | "review" | "error";
const STEPS = ["Reading your file", "Extracting text and design", "Finding sections", "Building your CV"];

function ImportFlow() {
  const router = useRouter();
  const reviewFirst = useSearchParams().get("review") === "1";
  const createCV = useStore((s) => s.createCV);
  const [tab, setTab] = useState<"file" | "paste">("file");
  const [stage, setStage] = useState<Stage>("idle");
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const [pasted, setPasted] = useState("");
  const [result, setResult] = useState<{
    content: CVContent;
    warnings: string[];
    fileName: string;
    layout: Layout;
    design: Design;
    designNote: string | null;
    sourceText: string;
    sections: ParsedSection[];
    originalPdf: Uint8Array | null;
  } | null>(null);
  const [stepNote, setStepNote] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const process = async (getData: () => Promise<ImportExtraction>, fileName: string) => {
    setError("");
    setStage("reading");
    setStep(0);
    setStepNote("");
    try {
      const data = await getData();
      setStep(1);
      await new Promise((r) => setTimeout(r, 250));
      setStep(2);
      setStage("structuring");
      const r = await withMinDuration(parseResume(data.text), 700);
      setStep(3);
      await new Promise((res) => setTimeout(res, 250));
      if (r.fellBack) toast("Enhanced AI was unavailable, so we used the on-device parser.");
      // Formatted CVs (PDF) keep their original look; plain text gets a clean default template
      setResult({
        content: r.result.content,
        warnings: [...data.warnings, ...r.result.warnings],
        fileName,
        layout: r.result.layout ?? defaultLayout(),
        design: data.design?.design ?? designFor("modern"),
        designNote: data.design?.summary ?? null,
        sourceText: data.text,
        sections: r.result.sections ?? [],
        originalPdf: data.bytes ?? null,
      });
      setStage("review");
    } catch (err) {
      setError(friendlyError(err, "We couldn't extract information from this file. Try another file, or paste the text instead."));
      setStage("error");
    }
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    void process(() => extractForImport(f, setStepNote), f.name.replace(/\.[^.]+$/, ""));
  };

  // Review step: fix extraction mistakes BEFORE the CV is saved
  if (stage === "review" && result) {
    const defaultName = result.content.personal.fullName ? `${result.content.personal.fullName.split(" ")[0]}'s CV` : result.fileName || "Imported CV";
    return (
      <ImportReview
        initial={result.content}
        initialLayout={result.layout}
        initialDesign={result.design}
        designNote={result.designNote}
        sourceText={result.sourceText}
        sections={result.sections}
        originalPdf={result.originalPdf ?? undefined}
        startWithReview={reviewFirst}
        warnings={result.warnings}
        defaultName={defaultName}
        source="a file"
        onCancel={() => setStage("idle")}
        onSave={(d) => {
          const id = createCV({ name: d.name, content: d.content, layout: d.layout, design: d.design });
          toast.success("CV saved", { description: "You can keep editing any time." });
          router.push(`/app/cv/${id}?imported=1`);
        }}
      />
    );
  }

  const busy = stage === "reading" || stage === "structuring";
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">{reviewFirst ? "Review my CV" : "Import your existing CV"}</h1>
      <p className="mb-6 mt-1.5 text-muted">
        {reviewFirst
          ? "Upload your CV (PDF, DOCX or TXT). You'll get a quality score, clear feedback and smart fixes you can apply with one click — your original stays untouched."
          : "Upload a PDF, DOCX or TXT file. We'll extract your details into the builder so you can edit everything."}
      </p>
      <Segmented
        label="Import method"
        value={tab}
        onChange={setTab}
        options={[
          { value: "file", label: "Upload file", icon: <Upload className="size-3.5" aria-hidden /> },
          { value: "paste", label: "Paste text", icon: <ClipboardPaste className="size-3.5" aria-hidden /> },
        ]}
        className="mb-5"
      />

      {busy ? (
        <div className="rounded-2xl border border-border bg-surface p-6" aria-live="polite">
          <p className="mb-4 text-sm font-medium">Importing your CV…</p>
          <ol className="flex flex-col gap-3">
            {STEPS.map((s, i) => (
              <li key={s} className={cn("flex items-center gap-3 text-sm transition-colors", i <= step ? "text-fg" : "text-subtle")}>
                <span className="flex size-5 items-center justify-center">
                  {i < step ? <Check className="size-4 text-success" aria-hidden /> : i === step ? <Loader2 className="size-4 animate-spin text-accent" aria-hidden /> : <span className="size-1.5 rounded-full bg-border-strong" />}
                </span>
                {s}
              </li>
            ))}
          </ol>
          {stepNote && <p className="mt-4 text-xs text-subtle">{stepNote}</p>}
        </div>
      ) : tab === "file" ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            onFile(e.dataTransfer.files?.[0]);
          }}
          className={cn("flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors", drag ? "border-accent bg-accent-soft/60" : "border-border-strong/70 bg-surface")}
        >
          <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg">
            <FileUp className="size-6" aria-hidden />
          </span>
          <p className="text-[15px] font-medium">Drag and drop your CV here</p>
          <p className="mt-1 text-sm text-subtle">PDF, DOCX or TXT · up to 10 MB</p>
          <Button variant="primary" className="mt-5" onClick={() => inputRef.current?.click()}>
            Choose file
          </Button>
          <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Upload CV file" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Paste your CV text" hint="Copy everything from your current CV and paste it here.">
            {(p) => <Textarea {...p} rows={12} autoGrow={false} className="min-h-72" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Jane Doe&#10;jane@email.com · +1 555 000 0000&#10;&#10;EXPERIENCE&#10;…" />}
          </Field>
          <div>
            <Button variant="primary" disabled={pasted.trim().length < 40} onClick={() => process(async () => ({ text: pasted, design: null, warnings: [] }), "Imported CV")}>
              Import text
            </Button>
          </div>
        </div>
      )}

      {stage === "error" && (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="font-medium text-danger">Import didn't work</p>
            <p className="mt-0.5 text-muted">{error}</p>
          </div>
        </div>
      )}
      <p className="mt-6 flex items-start gap-2 text-xs text-subtle">
        <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden />
        Files are read in your browser. We don't store your file. If Enhanced AI is on, the extracted text is sent securely to our AI provider to structure it, and is not used for anything else.
      </p>
    </div>
  );
}

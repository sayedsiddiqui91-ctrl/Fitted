"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, FilePen, FileText, Layers, Loader2, Trash2, Wand2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { openPdf, extractTextLayer } from "@/lib/pdf/load";
import { deletePdfData, saveOriginal } from "@/lib/pdf/storage";
import { cn, friendlyError, relativeTime, uid, UserFacingError } from "@/lib/utils";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/misc";

const MAX = 15 * 1024 * 1024;
const STEPS = ["Reading your PDF", "Checking for a text layer", "Preparing the editor"];

export default function PdfUploadPage() {
  const router = useRouter();
  const pdfs = useStore((s) => s.pdfs);
  const createPdfDoc = useStore((s) => s.createPdfDoc);
  const deletePdfDoc = useStore((s) => s.deletePdfDoc);
  const restorePdfDoc = useStore((s) => s.restorePdfDoc);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useMemo(() => Object.values(pdfs).sort((a, b) => b.updatedAt - a.updatedAt), [pdfs]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    try {
      if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") throw new UserFacingError("That file type isn't supported. Please upload a PDF. (To import a Word file, use Import Existing CV.)");
      if (f.size === 0) throw new UserFacingError("That file is empty. Please choose another PDF.");
      if (f.size > MAX) throw new UserFacingError("That PDF is larger than 15 MB. Please upload a smaller file.");
      setBusy(true);
      setStep(0);
      const bytes = new Uint8Array(await f.arrayBuffer());
      const pdf = await openPdf(bytes);
      setStep(1);
      const layer = await extractTextLayer(pdf);
      setStep(2);
      const id = uid("pdf");
      await saveOriginal(id, bytes);
      createPdfDoc({ id, name: f.name.replace(/\.pdf$/i, ""), fileName: f.name, pages: pdf.numPages, kind: layer.kind });
      router.push(`/app/pdf/${id}`);
    } catch (err) {
      setError(friendlyError(err, "We couldn't reliably extract this PDF. You can try another PDF or build your CV manually."));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-10">
      <span className="mb-3 inline-flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg">
        <FilePen className="size-5" aria-hidden />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Edit an existing PDF</h1>
      <p className="mt-1.5 max-w-2xl text-muted">Upload your CV as a PDF. Fix small things right on the page — or convert it into a fully editable CV. Your original file is always kept.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="size-4 text-accent" aria-hidden /> Quick PDF Edit
          </p>
          <p className="mt-1 text-[13px] text-muted">Click any line to change it — a phone number, a date, a typo. The rest of the page keeps its original design.</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Wand2 className="size-4 text-accent" aria-hidden /> Smart CV Edit
          </p>
          <p className="mt-1 text-[13px] text-muted">Turns the PDF into an editable CV in the builder. Best for bigger changes, new templates and job tailoring.</p>
        </div>
      </div>

      {busy ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-6" aria-live="polite">
          <ol className="flex flex-col gap-3">
            {STEPS.map((s, i) => (
              <li key={s} className={cn("flex items-center gap-3 text-sm", i <= step ? "text-fg" : "text-subtle")}>
                {i < step ? <Check className="size-4 text-success" aria-hidden /> : i === step ? <Loader2 className="size-4 animate-spin text-accent" aria-hidden /> : <span className="mx-1.5 size-1.5 rounded-full bg-border-strong" />}
                {s}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void onFile(e.dataTransfer.files?.[0]);
          }}
          className={cn("mt-6 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors", drag ? "border-accent bg-accent-soft/60" : "border-border-strong/70 bg-surface")}
        >
          <FileText className="mb-3 size-9 text-subtle" aria-hidden />
          <p className="text-[15px] font-medium">Drag and drop your CV PDF here</p>
          <p className="mt-1 text-sm text-subtle">Text-based and scanned PDFs · up to 15 MB</p>
          <Button variant="primary" className="mt-5" onClick={() => input.current?.click()}>
            Choose PDF
          </Button>
          <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Upload PDF" onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
      )}

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="text-muted">{error}</p>
            <Link href="/app/new?mode=scratch" className="mt-1 inline-block font-medium text-accent hover:underline">
              Build a CV manually instead
            </Link>
          </div>
        </div>
      )}

      {list.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-[15px] font-semibold">Your PDFs</h2>
          <ul className="flex flex-col gap-2">
            {list.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 pl-4">
                <FileText className="size-5 shrink-0 text-subtle" aria-hidden />
                <Link href={`/app/pdf/${p.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium hover:text-accent">{p.name}</span>
                  <span className="text-xs text-subtle">
                    {p.pages} page{p.pages === 1 ? "" : "s"} · {p.edits.length} edit{p.edits.length === 1 ? "" : "s"} · {relativeTime(p.updatedAt)}
                  </span>
                </Link>
                {p.kind === "scanned" && <Badge tone="warning">Scanned</Badge>}
                <IconButton
                  label={`Delete ${p.name}`}
                  size="sm"
                  onClick={() => {
                    const removed = deletePdfDoc(p.id);
                    if (!removed) return;
                    // bytes are removed after the undo window closes
                    const timer = setTimeout(() => void deletePdfData(p.id), 7000);
                    toast("PDF removed", { action: { label: "Undo", onClick: () => (clearTimeout(timer), restorePdfDoc(removed)) }, duration: 6500 });
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

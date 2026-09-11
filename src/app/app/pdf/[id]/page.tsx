"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, PageViewport } from "pdfjs-dist";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bold, FileDown, Italic, Loader2, MoreHorizontal, MousePointer2, RotateCcw, ScanText, Trash2, Type, Undo2, Wand2, X } from "lucide-react";
import { useStore, type PdfDoc } from "@/lib/store";
import { applyPdfEdits } from "@/lib/pdf/edit";
import { extractTextLayer, openPdf, renderPage, runRect, sampleColors } from "@/lib/pdf/load";
import { ocrPdf } from "@/lib/pdf/ocr";
import { analyzeRunsForImport } from "@/lib/import/pdfImport";
import { loadOcrRuns, loadOriginal, saveOcrRuns } from "@/lib/pdf/storage";
import type { PdfEdit, PdfTextRun, RGB } from "@/lib/pdf/types";
import { triggerDownload } from "@/lib/export/pdf";
import { parseResume, withMinDuration } from "@/lib/ai/client";
import { DEFAULT_DESIGN } from "@/lib/cv/defaults";
import type { CVContent } from "@/lib/cv/schema";
import { cn, friendlyError, slugify, uid } from "@/lib/utils";
import { Button, IconButton } from "@/components/ui/Button";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { Badge } from "@/components/ui/misc";
import { ImportReview } from "@/components/app/ImportReview";

const toHex = (c: RGB) => `#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
const fromHex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, size: number, family: PdfEdit["family"], bold: boolean) {
  if (typeof document === "undefined") return text.length * size * 0.5;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * size * 0.5;
  measureCtx.font = `${bold ? "bold " : ""}${size}px ${family === "serif" ? '"Times New Roman",Times,serif' : family === "mono" ? '"Courier New",monospace' : "Helvetica,Arial,sans-serif"}`;
  return measureCtx.measureText(text).width;
}

export default function PdfEditorRoute() {
  const { id } = useParams<{ id: string }>();
  const doc = useStore((s) => s.pdfs[id]);
  if (!doc)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">We couldn't find this PDF</h1>
        <p className="max-w-sm text-sm text-muted">It may have been removed, or it was uploaded in a different browser.</p>
        <Link href="/app/pdf">
          <Button variant="primary">Back to Edit PDF</Button>
        </Link>
      </div>
    );
  return <PdfEditor doc={doc} />;
}

function PdfEditor({ doc }: { doc: PdfDoc }) {
  const router = useRouter();
  const updatePdf = useStore((s) => s.updatePdfDoc);
  const createCV = useStore((s) => s.createCV);
  const [original, setOriginal] = useState<Uint8Array | null>(null);
  const [origPdf, setOrigPdf] = useState<PDFDocumentProxy | null>(null);
  const [viewPdf, setViewPdf] = useState<PDFDocumentProxy | null>(null);
  const [runs, setRuns] = useState<PdfTextRun[]>([]);
  const [pageWidth, setPageWidth] = useState(595);
  const [pageSizes, setPageSizes] = useState<{ w: number; h: number }[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<"select" | "add">("select");
  const [ocr, setOcr] = useState<{ p: number; label: string } | null>(null);
  const [smart, setSmart] = useState<{ content: CVContent; warnings: string[]; layout?: import("@/lib/cv/schema").Layout; design?: import("@/lib/cv/schema").Design; note?: string; sourceText?: string; sections?: import("@/lib/engine/parseResume").ParsedSection[] } | null>(null);
  const [smartBusy, setSmartBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const scanned = doc.kind === "scanned";

  /* Load the original (never modified) */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const bytes = await loadOriginal(doc.id);
        if (!bytes) throw Object.assign(new Error("missing"), { userMessage: "We couldn't find the original file for this PDF in this browser. Please upload it again." });
        const pdf = await openPdf(bytes);
        const layer = await extractTextLayer(pdf);
        let r = layer.runs;
        if (scanned && doc.ocrDone) r = (await loadOcrRuns(doc.id)) ?? [];
        if (cancelled) return;
        setOriginal(bytes);
        setOrigPdf(pdf);
        setViewPdf(pdf);
        setRuns(r);
        setPageWidth(layer.pageSizes[0]?.w ?? 595);
        setPageSizes(layer.pageSizes);
        setState("ready");
      } catch (err) {
        if (cancelled) return;
        setError(friendlyError(err, "We couldn't reliably extract this PDF. You can try another PDF or build your CV manually."));
        setState("error");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [doc.id, doc.ocrDone, scanned]);

  /* Regenerate the edited preview from the ORIGINAL + edits (debounced) */
  useEffect(() => {
    if (!original || !origPdf) return;
    if (!doc.edits.length) {
      setViewPdf(origPdf);
      setWarnings([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      const regen = async () => {
        try {
          const res = await applyPdfEdits(original, doc.edits, { scanned });
          const pdf = await openPdf(res.bytes);
          if (cancelled) return;
          setViewPdf(pdf);
          setWarnings(res.warnings);
        } catch {
          if (!cancelled) toast.error("We couldn't preview that change. Try undoing it.");
        }
      };
      void regen();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [original, origPdf, doc.edits, scanned]);

  const setEdits = useCallback((edits: PdfEdit[]) => updatePdf(doc.id, { edits }), [doc.id, updatePdf]);
  const editById = (eid: string | null) => doc.edits.find((e) => e.id === eid || e.runId === eid) ?? null;
  const selectedRun = runs.find((r) => r.id === selected) ?? null;
  const selectedEdit = editById(selected);

  /** Draft edit for a run (not stored until it actually differs) */
  const draftFor = (r: PdfTextRun, sample?: { color: RGB; bg: RGB }): PdfEdit => ({
    id: uid("pe"),
    page: r.page,
    kind: "replace",
    runId: r.id,
    region: { x: r.x, y: r.y, w: r.width, fs: r.fontSize },
    text: r.text,
    x: r.x,
    y: r.y,
    fontSize: r.fontSize,
    bold: r.bold,
    italic: r.italic,
    family: r.family,
    color: sample?.color ?? r.color ?? [0.1, 0.1, 0.12],
    bg: sample?.bg,
  });
  const [draft, setDraft] = useState<PdfEdit | null>(null);
  const current = selectedEdit ?? draft;

  const commit = (e: PdfEdit) => {
    const run = runs.find((r) => r.id === e.runId);
    const unchanged = run && e.kind === "replace" && e.text === run.text && e.x === run.x && e.y === run.y && e.fontSize === run.fontSize && e.bold === run.bold && e.italic === run.italic;
    const rest = doc.edits.filter((x) => x.id !== e.id && !(e.runId && x.runId === e.runId));
    setEdits(unchanged ? rest : [...rest, e]);
    if (unchanged) setDraft({ ...e });
  };
  const patch = (p: Partial<PdfEdit>) => current && commit({ ...current, ...p });
  const revert = () => {
    if (!current) return;
    setEdits(doc.edits.filter((x) => x.id !== current.id));
    setSelected(null);
    setDraft(null);
  };

  const onSelectRun = (r: PdfTextRun, sample?: { color: RGB; bg: RGB }) => {
    setSelected(r.id);
    const existing = doc.edits.find((e) => e.runId === r.id);
    setDraft(existing ? null : draftFor(r, sample));
  };
  const onAddAt = (page: number, x: number, y: number) => {
    const sizes = runs.filter((r) => r.page === page).map((r) => r.fontSize).sort((a, b) => a - b);
    const size = sizes[Math.floor(sizes.length / 2)] ?? 10;
    const families = runs.map((r) => r.family);
    const family = ([...(["sans", "serif", "mono"] as const)] as PdfEdit["family"][]).sort((a, b) => families.filter((f) => f === b).length - families.filter((f) => f === a).length)[0];
    const e: PdfEdit = { id: uid("pe"), page, kind: "add", text: "New text", x, y, fontSize: size, bold: false, italic: false, family, color: [0.1, 0.1, 0.12] };
    setEdits([...doc.edits, e]);
    setSelected(e.id);
    setDraft(null);
    setTool("select");
  };

  const runOcr = async (): Promise<PdfTextRun[] | null> => {
    if (!origPdf) return null;
    setOcr({ p: 0, label: "Loading text recognition…" });
    try {
      const res = await ocrPdf(origPdf, (p, label) => setOcr({ p, label }));
      await saveOcrRuns(doc.id, res.runs);
      setRuns(res.runs);
      updatePdf(doc.id, { ocrDone: true });
      toast.success(`Recognized ${res.runs.length} lines of text`, { description: res.confidence < 70 ? "Recognition confidence is low — please check the text carefully." : "Check the text carefully — OCR isn't perfect." });
      return res.runs;
    } catch {
      toast.error("Text recognition failed", { description: "Check your connection (the recognizer is downloaded the first time) and try again." });
      return null;
    } finally {
      setOcr(null);
    }
  };

  const smartEdit = async () => {
    setSmartBusy(true);
    try {
      let r = runs;
      if (scanned && !doc.ocrDone) r = (await runOcr()) ?? [];
      if (!r.length) throw new Error("no text");
      // Column-aware text with the PDF's headings marked, plus the original design (fonts, colours, layout)
      const prepared = await analyzeRunsForImport(origPdf, r, pageSizes.length ? pageSizes : [{ w: pageWidth, h: pageWidth * 1.414 }], scanned);
      const res = await withMinDuration(parseResume(prepared.text), 700);
      setSmart({ content: res.result.content, layout: res.result.layout, design: prepared.design.design, note: prepared.design.summary, sourceText: prepared.text, sections: res.result.sections, warnings: [...(scanned ? ["This CV came from a scanned PDF via text recognition — check spelling, dates and numbers carefully."] : []), ...res.result.warnings] });
    } catch {
      toast.error("We couldn't reliably extract this PDF.", { description: "You can try another PDF or build your CV manually." });
    } finally {
      setSmartBusy(false);
    }
  };

  const download = async () => {
    if (!original) return;
    setExporting(true);
    try {
      const res = await applyPdfEdits(original, doc.edits, { scanned });
      // Verify: every new/changed text must be present in the exported file's text layer
      let verified = true;
      if (!scanned) {
        const check = await openPdf(res.bytes);
        let text = "";
        for (let i = 1; i <= check.numPages; i++) text += " " + (await (await check.getPage(i)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(" ");
        const flat = text.replace(/\s/g, "");
        verified = doc.edits.filter((e) => e.kind !== "delete").every((e) => flat.includes(e.text.replace(/\s/g, "").replace(/[^\x20-\xFF]/g, "")));
      }
      triggerDownload(new Blob([new Uint8Array(res.bytes)], { type: "application/pdf" }), `${slugify(doc.name) || "cv"}-edited.pdf`);
      toast.success("Edited PDF downloaded", { description: scanned ? "Your original is kept unchanged." : verified ? "Verified: your changes are in the PDF text. Your original is kept unchanged." : "Downloaded — some text may not have been written exactly; please check the file." });
      if (res.warnings.length) toast.warning(res.warnings[0]);
    } catch {
      toast.error("We couldn't create the edited PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  if (smart) {
    return (
      <div className="min-h-dvh bg-bg px-3 py-6 sm:px-6">
        <ImportReview
          initial={smart.content}
          initialLayout={smart.layout}
          initialDesign={smart.design}
          designNote={smart.note}
          sourceText={smart.sourceText}
          sections={smart.sections}
          originalPdf={original ?? undefined}
          warnings={smart.warnings}
          defaultName={`${doc.name} (editable)`}
          source="a PDF"
          onCancel={() => setSmart(null)}
          onSave={(d) => {
            const cvId = createCV({ name: d.name, content: d.content, layout: d.layout, design: d.design });
            updatePdf(doc.id, { cvId });
            toast.success("Saved as an editable CV", { description: "Your original PDF is unchanged." });
            router.push(`/app/cv/${cvId}?welcome=1&imported=1`);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 sm:px-3">
        <Link href="/app/pdf" aria-label="Back to Edit PDF" className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
          <ArrowLeft className="size-[18px]" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{doc.name}</p>
          <p className="text-xs text-subtle">
            {doc.pages} page{doc.pages === 1 ? "" : "s"} · {doc.edits.length} change{doc.edits.length === 1 ? "" : "s"} · original kept
          </p>
        </div>
        {scanned ? <Badge tone="warning">Scanned</Badge> : <Badge tone="success">Text PDF</Badge>}
        <div className="hidden items-center rounded-lg border border-border p-0.5 sm:flex" role="toolbar" aria-label="Tools">
          <IconButton label="Select & edit text" size="sm" className={cn(tool === "select" && "bg-surface-2 text-fg")} onClick={() => setTool("select")}>
            <MousePointer2 className="size-4" />
          </IconButton>
          <IconButton label="Add text (click on the page)" size="sm" className={cn(tool === "add" && "bg-accent-soft text-accent")} onClick={() => setTool("add")}>
            <Type className="size-4" />
          </IconButton>
        </div>
        <Button size="sm" variant="accent-soft" className="hidden md:inline-flex" loading={smartBusy} icon={<Wand2 className="size-4" />} onClick={smartEdit} disabled={state !== "ready"}>
          Smart CV Edit
        </Button>
        <Button size="sm" variant="primary" loading={exporting} icon={<FileDown className="size-4" />} onClick={download} disabled={state !== "ready"}>
          <span className="hidden sm:inline">Download edited PDF</span>
          <span className="sm:hidden">PDF</span>
        </Button>
        <Menu
          trigger={
            <IconButton label="More" size="sm" tooltip={false}>
              <MoreHorizontal className="size-4" />
            </IconButton>
          }
        >
          <MenuItem icon={<Wand2 />} onSelect={smartEdit}>
            Smart CV Edit
          </MenuItem>
          <MenuItem icon={<Type />} onSelect={() => setTool("add")}>
            Add text
          </MenuItem>
          <MenuItem icon={<FileDown />} onSelect={() => original && triggerDownload(new Blob([new Uint8Array(original)], { type: "application/pdf" }), doc.fileName || "original.pdf")}>
            Download original
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            icon={<RotateCcw />}
            danger
            disabled={!doc.edits.length}
            onSelect={() => {
              const prev = doc.edits;
              setEdits([]);
              setSelected(null);
              toast("All changes discarded", { action: { label: "Undo", onClick: () => setEdits(prev) } });
            }}
          >
            Discard all changes
          </MenuItem>
        </Menu>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_340px]">
        <main id="main" className="scroll-thin min-h-0 overflow-y-auto bg-surface-2/70 px-3 py-5 sm:px-6">
          {state === "loading" && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Opening your PDF…
            </div>
          )}
          {state === "error" && (
            <div role="alert" className="mx-auto mt-10 max-w-md rounded-2xl border border-danger/30 bg-danger-soft p-5 text-sm">
              <p className="font-medium text-danger">This PDF couldn't be opened</p>
              <p className="mt-1 text-muted">{error}</p>
              <Link href="/app/pdf" className="mt-2 inline-block font-medium text-accent hover:underline">
                Upload another PDF
              </Link>
            </div>
          )}
          {state === "ready" && (
            <div className="mx-auto flex max-w-[860px] flex-col gap-4">
              {scanned && !doc.ocrDone && (
                <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm">
                  <ScanText className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">This PDF appears to be scanned.</p>
                    <p className="mt-0.5 text-muted">We can extract the content using text recognition (OCR), but some formatting may need adjustment. It runs on your device.</p>
                    {ocr && (
                      <div className="mt-3">
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(ocr.p * 100)}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-subtle" aria-live="polite">
                          {ocr.label}
                        </p>
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="primary" loading={!!ocr} onClick={() => void runOcr()}>
                    Recognize text
                  </Button>
                </div>
              )}
              {scanned && doc.ocrDone && (
                <p className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">
                  Scanned PDF: edits are painted over the image and aren't machine-readable. For an ATS-friendly CV, use <button className="font-medium text-accent hover:underline" onClick={smartEdit}>Smart CV Edit</button>.
                </p>
              )}
              <p className="text-center text-xs text-subtle">{tool === "add" ? "Click anywhere on the page to add text." : "Click any line of text to edit it."}</p>
              {viewPdf &&
                Array.from({ length: doc.pages }, (_, i) => (
                  <PageView
                    key={i}
                    index={i}
                    viewPdf={viewPdf}
                    origPdf={origPdf!}
                    runs={runs.filter((r) => r.page === i)}
                    edits={doc.edits.filter((e) => e.page === i)}
                    selected={selected}
                    tool={tool}
                    onSelectRun={onSelectRun}
                    onSelectEdit={(e) => {
                      setSelected(e.id);
                      setDraft(null);
                    }}
                    onAddAt={onAddAt}
                  />
                ))}
            </div>
          )}
        </main>

        {/* Inspector: side panel on desktop, bottom sheet on mobile */}
        <aside
          className={cn(
            "scroll-thin min-h-0 overflow-y-auto border-l border-border bg-surface p-4",
            current ? "fixed inset-x-0 bottom-0 z-40 max-h-[60dvh] rounded-t-2xl border-t shadow-lg lg:static lg:max-h-none lg:rounded-none lg:border-t-0 lg:shadow-none" : "hidden lg:block",
          )}
          aria-label="Edit panel"
        >
          {current ? (
            <Inspector
              edit={current}
              run={selectedRun ?? runs.find((r) => r.id === current.runId) ?? null}
              stored={!!selectedEdit}
              onPatch={patch}
              onDelete={() => (current.kind === "add" ? revert() : patch({ kind: "delete" }))}
              onRevert={revert}
              onClose={() => {
                setSelected(null);
                setDraft(null);
              }}
            />
          ) : (
            <div className="flex flex-col gap-4 text-sm">
              <div>
                <p className="font-semibold">Quick PDF Edit</p>
                <p className="mt-1 text-[13px] text-muted">Click any text on the page to change it. Your original file is never modified — downloads are a new, edited copy.</p>
              </div>
              {warnings.length > 0 && (
                <ul className="flex flex-col gap-1.5 rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs text-muted">
                  {warnings.map((w) => (
                    <li key={w} className="flex gap-1.5">
                      <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" aria-hidden /> {w}
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Changes ({doc.edits.length})</p>
                {doc.edits.length === 0 ? (
                  <p className="text-[13px] text-subtle">No changes yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {doc.edits.map((e) => {
                      const run = runs.find((r) => r.id === e.runId);
                      return (
                        <li key={e.id}>
                          <button type="button" onClick={() => setSelected(e.id)} className="w-full rounded-lg border border-border px-3 py-2 text-left text-[13px] hover:bg-surface-2">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-subtle">{e.kind === "add" ? "Added" : e.kind === "delete" ? "Deleted" : "Changed"} · page {e.page + 1}</span>
                            {run && e.kind !== "add" && <span className="block truncate text-subtle line-through">{run.text}</span>}
                            {e.kind !== "delete" && <span className="block truncate">{e.text}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-border bg-surface-2/60 p-3 text-[13px]">
                <p className="font-medium">Need bigger changes?</p>
                <p className="mt-1 text-muted">Smart CV Edit converts this PDF into an editable CV — then use templates, the assistant and job optimization.</p>
                <Button size="sm" variant="accent-soft" className="mt-2.5" loading={smartBusy} icon={<Wand2 className="size-3.5" />} onClick={smartEdit}>
                  Smart CV Edit
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ───────── One page: rendered canvas + clickable text overlay ───────── */
const PageView = memo(function PageView({
  index,
  viewPdf,
  origPdf,
  runs,
  edits,
  selected,
  tool,
  onSelectRun,
  onSelectEdit,
  onAddAt,
}: {
  index: number;
  viewPdf: PDFDocumentProxy;
  origPdf: PDFDocumentProxy;
  runs: PdfTextRun[];
  edits: PdfEdit[];
  selected: string | null;
  tool: "select" | "add";
  onSelectRun: (r: PdfTextRun, sample?: { color: RGB; bg: RGB }) => void;
  onSelectEdit: (e: PdfEdit) => void;
  onAddAt: (page: number, x: number, y: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sampleCanvas = useRef<HTMLCanvasElement | null>(null);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!canvas.current || !width) return;
    let cancelled = false;
    const draw = async () => {
      const page = await viewPdf.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(1.6, width / base.width);
      // Geometry is known before rasterizing — make lines clickable right away instead of after the paint
      if (!cancelled) setViewport((prev) => (prev && prev.scale === scale ? prev : page.getViewport({ scale })));
      await renderPage(viewPdf, index, scale, canvas.current!);
    };
    void draw().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [viewPdf, index, width]);

  const sampleFor = async (r: PdfTextRun) => {
    if (!viewport) return undefined;
    try {
      if (!sampleCanvas.current) {
        sampleCanvas.current = document.createElement("canvas");
        await renderPage(origPdf, index, viewport.scale, sampleCanvas.current);
      }
      return sampleColors(sampleCanvas.current, viewport, r);
    } catch {
      return undefined;
    }
  };

  const editOf = (r: PdfTextRun) => edits.find((e) => e.runId === r.id);

  return (
    <div ref={wrap} className="w-full">
      <div
        className={cn("relative mx-auto overflow-hidden rounded-[3px] bg-white shadow-paper ring-1 ring-black/5", tool === "add" && "cursor-crosshair")}
        style={viewport ? { width: viewport.width, height: viewport.height } : { aspectRatio: "1 / 1.414" }}
        onClick={(e) => {
          if (tool !== "add" || !viewport) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const [x, y] = viewport.convertToPdfPoint(e.clientX - rect.left, e.clientY - rect.top);
          onAddAt(index, x, y);
        }}
      >
        <canvas ref={canvas} className="block" aria-label={`Page ${index + 1}`} />
        {viewport &&
          tool === "select" &&
          runs.map((r) => {
            const e = editOf(r);
            const geom = e && e.kind !== "delete" ? { x: e.x, y: e.y, width: Math.max(r.width, measure(e.text, e.fontSize, e.family, e.bold)), fontSize: e.fontSize } : r;
            const rect = runRect(viewport, geom);
            const isSel = selected === r.id || (e && selected === e.id);
            return (
              <button
                key={r.id}
                type="button"
                aria-label={`Edit text: ${r.text}`}
                title={r.text}
                onClick={async (ev) => {
                  ev.stopPropagation();
                  // Colour sampling needs an off-screen render; never let it delay selecting the line
                  onSelectRun(r, await Promise.race([sampleFor(r), new Promise<undefined>((res) => setTimeout(() => res(undefined), 600))]));
                }}
                className={cn(
                  "absolute rounded-[2px] outline-offset-1 transition-colors",
                  isSel ? "bg-accent/10 outline outline-2 outline-accent" : e ? (e.kind === "delete" ? "outline outline-1 outline-dashed outline-danger/60" : "bg-success/10 outline outline-1 outline-success/60") : "hover:bg-accent/10 hover:outline hover:outline-1 hover:outline-accent/60",
                )}
                style={{ left: rect.left - 1, top: rect.top - 1, width: rect.width + 2, height: rect.height + 2 }}
              />
            );
          })}
        {viewport &&
          edits
            .filter((e) => e.kind === "add")
            .map((e) => {
              const rect = runRect(viewport, { x: e.x, y: e.y, width: Math.max(20, measure(e.text, e.fontSize, e.family, e.bold)), fontSize: e.fontSize });
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-label={`Edit added text: ${e.text}`}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelectEdit(e);
                  }}
                  className={cn("absolute rounded-[2px]", selected === e.id ? "bg-accent/10 outline outline-2 outline-accent" : "bg-success/10 outline outline-1 outline-success/60")}
                  style={{ left: rect.left - 1, top: rect.top - 1, width: rect.width + 2, height: rect.height + 2 }}
                />
              );
            })}
      </div>
      <p className="mt-1.5 text-center text-[11px] text-subtle">Page {index + 1}</p>
    </div>
  );
});

/* ───────── Inspector ───────── */
function Inspector({ edit, run, stored, onPatch, onDelete, onRevert, onClose }: { edit: PdfEdit; run: PdfTextRun | null; stored: boolean; onPatch: (p: Partial<PdfEdit>) => void; onDelete: () => void; onRevert: () => void; onClose: () => void }) {
  const [text, setText] = useState(edit.text);
  const [lastId, setLastId] = useState(edit.id);
  if (edit.id !== lastId) {
    setLastId(edit.id);
    setText(edit.text);
  }
  // debounce typing into the (costly) PDF regeneration
  useEffect(() => {
    if (text === edit.text) return;
    const t = setTimeout(() => onPatch({ text, kind: edit.kind === "delete" ? "replace" : edit.kind }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const overflow = run && edit.kind !== "add" ? measure(text, edit.fontSize, edit.family, edit.bold) > run.width * 1.12 : false;
  const nudge = (dx: number, dy: number) => onPatch({ x: Math.round((edit.x + dx) * 10) / 10, y: Math.round((edit.y + dy) * 10) / 10 });
  const deleted = edit.kind === "delete";

  return (
    <div className="flex flex-col gap-3.5 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{edit.kind === "add" ? "Added text" : deleted ? "Deleted text" : "Edit text"}</p>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>
      {run && edit.kind !== "add" && (
        <div>
          <p className="mb-1 text-xs text-subtle">Original</p>
          <p className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px] text-muted">{run.text}</p>
        </div>
      )}
      {deleted ? (
        <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">This line will be removed from the PDF.</p>
      ) : (
        <>
          <div>
            <label htmlFor="pdf-edit-text" className="mb-1 block text-xs font-medium text-muted">
              New text
            </label>
            <textarea
              id="pdf-edit-text"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(5, Math.max(2, Math.ceil(text.length / 38)))}
              className="w-full resize-none rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 sm:text-sm"
            />
            {overflow && <p className="mt-1 text-xs text-warning">This is wider than the original line — shorten it or reduce the font size so it doesn't overlap.</p>}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="pdf-fs" className="mb-1 block text-xs font-medium text-muted">
                Size
              </label>
              <input
                id="pdf-fs"
                type="number"
                min={5}
                max={48}
                step={0.5}
                value={edit.fontSize}
                onChange={(e) => onPatch({ fontSize: Math.max(5, Math.min(48, Number(e.target.value) || edit.fontSize)) })}
                className="h-9 w-20 rounded-lg border border-border bg-surface px-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <IconButton label="Bold" variant="secondary" size="sm" className={cn("size-9", edit.bold && "border-accent bg-accent-soft text-accent")} onClick={() => onPatch({ bold: !edit.bold })} aria-pressed={edit.bold}>
              <Bold className="size-4" />
            </IconButton>
            <IconButton label="Italic" variant="secondary" size="sm" className={cn("size-9", edit.italic && "border-accent bg-accent-soft text-accent")} onClick={() => onPatch({ italic: !edit.italic })} aria-pressed={edit.italic}>
              <Italic className="size-4" />
            </IconButton>
            <select aria-label="Font style" value={edit.family} onChange={(e) => onPatch({ family: e.target.value as PdfEdit["family"] })} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm">
              <option value="sans">Sans</option>
              <option value="serif">Serif</option>
              <option value="mono">Mono</option>
            </select>
            <label className="relative size-9 cursor-pointer overflow-hidden rounded-lg border border-border" title="Text colour" style={{ background: toHex(edit.color) }}>
              <span className="sr-only">Text colour</span>
              <input type="color" value={toHex(edit.color)} onChange={(e) => onPatch({ color: fromHex(e.target.value) })} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Move</p>
            <div className="flex items-center gap-1">
              <IconButton label="Move left" size="sm" variant="secondary" onClick={() => nudge(-2, 0)}>
                <ArrowLeft className="size-4" />
              </IconButton>
              <IconButton label="Move up" size="sm" variant="secondary" onClick={() => nudge(0, 2)}>
                <ArrowUp className="size-4" />
              </IconButton>
              <IconButton label="Move down" size="sm" variant="secondary" onClick={() => nudge(0, -2)}>
                <ArrowDown className="size-4" />
              </IconButton>
              <IconButton label="Move right" size="sm" variant="secondary" onClick={() => nudge(2, 0)}>
                <ArrowRight className="size-4" />
              </IconButton>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-subtle">Edited text is redrawn with a standard {edit.family === "serif" ? "serif" : edit.family === "mono" ? "monospace" : "sans-serif"} font matched to the original. The old text is removed from the file, not just covered.</p>
        </>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {!deleted && (
          <Button size="sm" variant="ghost" className="text-danger hover:text-danger" icon={<Trash2 className="size-3.5" />} onClick={onDelete}>
            {edit.kind === "add" ? "Remove" : "Delete line"}
          </Button>
        )}
        {(stored || deleted) && (
          <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} onClick={onRevert}>
            Revert to original
          </Button>
        )}
        <Button size="sm" variant="primary" className="ml-auto" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

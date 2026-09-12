"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CVDoc } from "@/lib/cv/schema";
import { googleFontHref, MM_TO_PX, PAGE_DIMENSIONS } from "@/lib/cv/meta";
import { cn } from "@/lib/utils";
import { CVDocument } from "./CVDocument";

type DocLike = Pick<CVDoc, "content" | "layout" | "design">;

/** Loads a Google Font for the CV on demand (only the families actually used). */
export function useCvFont(font: string) {
  useEffect(() => {
    const id = `cvfont-${font.replace(/\s+/g, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = googleFontHref(font);
    document.head.appendChild(link);
  }, [font]);
}

export function pageMetrics(design: DocLike["design"]) {
  const d = PAGE_DIMENSIONS[design.pageSize];
  const w = d.widthMm * MM_TO_PX;
  const h = d.heightMm * MM_TO_PX;
  const m = design.margin * MM_TO_PX;
  return { w, h, m, perPage: h - 2 * m };
}

interface PreviewProps {
  doc: DocLike;
  zoom?: number | "fit";
  onPages?: (pages: number) => void;
  showPlaceholders?: boolean;
  className?: string;
  maxScale?: number;
}

/** One thing that can't be split across two printed pages. */
interface Block {
  top: number;
  height: number;
  /** `break-inside: avoid` — a job, a degree, an entry. A long paragraph may be split. */
  atomic: boolean;
  /** `break-after: avoid` — a section heading must stay with what follows it. */
  withNext: boolean;
}

/** Reads the laid-out CV as the blocks a printer has to keep together. */
function readBlocks(page: HTMLElement): Block[] | null {
  // Two-column templates paginate column by column; that isn't worth simulating, fall back to the estimate
  if (page.querySelector(".cv-cols")) return null;
  const pageTop = page.getBoundingClientRect().top;
  // The preview is CSS-scaled, so convert every measurement back to real page units
  const scale = page.getBoundingClientRect().width / (page.offsetWidth || 1) || 1;
  const blocks: Block[] = [];
  const add = (el: Element, atomic: boolean, withNext = false) => {
    const r = el.getBoundingClientRect();
    if (r.height < 0.5) return;
    blocks.push({ top: (r.top - pageTop) / scale, height: r.height / scale, atomic, withNext });
  };

  const header = page.querySelector(":scope > .cv-header");
  if (header) add(header, true);
  page.querySelectorAll(":scope > .cv-section").forEach((sec) => {
    const h2 = sec.querySelector(":scope > .cv-h2");
    if (h2) add(h2, true, true);
    const body = sec.querySelector(":scope > .cv-rail-body") ?? sec;
    for (const child of Array.from(body.children)) {
      if (child === h2) continue;
      add(child, child.classList.contains("cv-item"));
    }
  });
  return blocks.length ? blocks : null;
}

/** Where the printer will actually start each new page, in page units from the top of page 1. */
export function paginate(blocks: Block[], firstTop: number, perPage: number): number[] {
  const breaks: number[] = [];
  let start = firstTop;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    // A heading is carried by whatever follows it, so they move to the next page together
    let end = b.top + b.height;
    for (let j = i; blocks[j]?.withNext && blocks[j + 1]; j++) end = blocks[j + 1].top + blocks[j + 1].height;
    const unbreakable = b.atomic || blocks[i].withNext;
    if (!unbreakable || end - b.top > perPage) continue; // taller than a page: it has to be split anyway
    if (end - start > perPage && b.top > start) {
      breaks.push(b.top);
      start = b.top;
    }
  }
  return breaks;
}

/** Live, true-to-print preview. Measures content to estimate page count and marks page breaks. */
export const CVPreview = memo(function CVPreview({ doc, zoom = "fit", onPages, showPlaceholders = true, className, maxScale = 1.15 }: PreviewProps) {
  useCvFont(doc.design.font);
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [breaks, setBreaks] = useState<number[]>([]);
  const { w, h, m, perPage } = pageMetrics(doc.design);

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    // Measure synchronously so the preview mounts immediately (don't wait for the first observer callback)
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    // Safety net: a preview that mounted inside a hidden panel measures 0 and would stay blank if the
    // observer never reports a size. Re-measure a few times, then stop.
    let tries = 0;
    const retry = window.setInterval(() => {
      const w = el.getBoundingClientRect().width;
      if (w > 0 || ++tries > 8) {
        if (w > 0) setWidth(w);
        window.clearInterval(retry);
      }
    }, 120);
    return () => {
      ro.disconnect();
      window.clearInterval(retry);
    };
  }, []);

  useLayoutEffect(() => {
    const page = inner.current?.querySelector(".cv-page") as HTMLElement | null;
    if (!page) return;
    const measure = () => {
      // measure natural content height (ignoring min-height)
      const kids = Array.from(page.children) as HTMLElement[];
      const last = kids[kids.length - 1];
      const bottom = last ? last.offsetTop + last.offsetHeight : 0;
      setContentH(bottom + m);
      // Where the PDF will really break: a job or a degree is never split down the middle, so one that
      // doesn't fit moves to the next page whole. Marking the naive cut instead used to promise a page 1
      // that the download didn't deliver.
      const blocks = readBlocks(page);
      const next = blocks ? paginate(blocks, m, perPage) : [];
      setBreaks((prev) => (prev.length === next.length && prev.every((v, i) => Math.abs(v - next[i]) < 0.5) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(page);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(measure).catch(() => undefined);
    return () => ro.disconnect();
    // `width` is a dependency because nothing is rendered until it is known — without it the page count
    // would be measured against an empty preview and always come out as one page.
  }, [doc, m, perPage, width]);

  const estimate = Math.max(1, Math.ceil((contentH - 2 * m - 2) / perPage));
  const pages = Math.max(estimate, breaks.length + 1);
  useEffect(() => {
    onPages?.(pages);
  }, [pages, onPages]);

  const scale = zoom === "fit" ? (width ? Math.min(maxScale, width / w) : 0) : zoom;
  const totalH = pages * h;

  return (
    <div ref={outer} className={cn("w-full", className)}>
      {scale > 0 && (
        <div className="relative mx-auto" style={{ width: w * scale, height: totalH * scale }}>
          <div className="absolute inset-0 overflow-hidden rounded-[3px] bg-white shadow-paper ring-1 ring-black/5" />
          <div ref={inner} className="absolute left-0 top-0 origin-top-left" style={{ width: w, transform: `scale(${scale})` }}>
            <div style={{ minHeight: totalH }} className="[&_.cv-page]:!min-h-0">
              <CVDocument doc={doc} showPlaceholders={showPlaceholders} />
            </div>
          </div>
          {Array.from({ length: pages - 1 }, (_, i) => breaks[i] ?? m + (i + 1) * perPage).map((top, i) => (
            <div key={i} className="pointer-events-none absolute inset-x-0 flex items-center" style={{ top: top * scale }} aria-hidden>
              <div className="h-px flex-1 border-t border-dashed border-accent/50" />
              <span className="mx-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-fg shadow-sm">Page {i + 2}</span>
              <div className="h-px flex-1 border-t border-dashed border-accent/50" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

/** Static first-page thumbnail for cards and template pickers. */
export const CVThumbnail = memo(function CVThumbnail({ doc, width = 220, className }: { doc: DocLike; width?: number; className?: string }) {
  useCvFont(doc.design.font);
  const { w, h } = pageMetrics(doc.design);
  const scale = width / w;
  return (
    <div className={cn("relative overflow-hidden bg-white", className)} style={{ width, height: h * scale }} aria-hidden>
      <div className="pointer-events-none absolute left-0 top-0 origin-top-left select-none" style={{ width: w, transform: `scale(${scale})` }}>
        <CVDocument doc={doc} showPlaceholders interactive={false} />
      </div>
    </div>
  );
});

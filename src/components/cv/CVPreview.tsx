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

/** Live, true-to-print preview. Measures content to estimate page count and marks page breaks. */
export const CVPreview = memo(function CVPreview({ doc, zoom = "fit", onPages, showPlaceholders = true, className, maxScale = 1.15 }: PreviewProps) {
  useCvFont(doc.design.font);
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [contentH, setContentH] = useState(0);
  const { w, h, m, perPage } = pageMetrics(doc.design);

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    // Measure synchronously so the preview mounts immediately (don't wait for the first observer callback)
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
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
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(page);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(measure).catch(() => undefined);
    return () => ro.disconnect();
  }, [doc, m]);

  const pages = Math.max(1, Math.ceil((contentH - 2 * m - 2) / perPage));
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
          {Array.from({ length: pages - 1 }, (_, i) => (
            <div key={i} className="pointer-events-none absolute inset-x-0 flex items-center" style={{ top: (m + (i + 1) * perPage) * scale }} aria-hidden>
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

"use client";

import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from "pdfjs-dist";
import { UserFacingError } from "@/lib/utils";
import { buildRuns, type RawTextItem } from "./runs";
import type { PdfTextRun, RGB } from "./types";

let lib: Promise<typeof import("pdfjs-dist")> | null = null;
export function getPdfjs() {
  if (!lib) {
    lib = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
    lib.catch(() => (lib = null));
  }
  return lib;
}

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs().catch(() => {
    throw new UserFacingError("The PDF reader failed to load. Check your connection and try again.");
  });
  try {
    return await pdfjs.getDocument({ data: bytes.slice() }).promise;
  } catch (err) {
    if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "PasswordException")
      throw new UserFacingError("This PDF is password-protected. Remove the password and try again.");
    throw new UserFacingError("We couldn't reliably extract this PDF. You can try another PDF or build your CV manually.");
  }
}

export interface PdfTextLayer {
  runs: PdfTextRun[];
  pageSizes: { w: number; h: number }[];
  textChars: number;
  kind: "text" | "scanned";
}

function fontName(page: PDFPageProxy, loaded: string): string | undefined {
  try {
    const f = page.commonObjs.get(loaded) as { name?: string } | undefined;
    return f?.name;
  } catch {
    return undefined;
  }
}

/** Extracts editable text runs from every page and decides text-based vs scanned. */
export async function extractTextLayer(pdf: PDFDocumentProxy): Promise<PdfTextLayer> {
  const runs: PdfTextRun[] = [];
  const pageSizes: { w: number; h: number }[] = [];
  let textChars = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const [x0, y0, x1, y1] = page.view;
    pageSizes.push({ w: x1 - x0, h: y1 - y0 });
    await page.getOperatorList(); // ensures fonts are loaded so real font names (bold/serif) are known
    const tc = await page.getTextContent();
    const items = tc.items.filter((it): it is typeof it & RawTextItem => "str" in it);
    textChars += items.reduce((s, it) => s + it.str.trim().length, 0);
    const styles = tc.styles as Record<string, { fontFamily?: string }>;
    runs.push(...buildRuns(items as unknown as RawTextItem[], i - 1, (fn) => ({ name: fontName(page, fn), family: styles[fn]?.fontFamily })));
  }
  const kind = textChars / Math.max(1, pdf.numPages) < 40 ? "scanned" : "text";
  return { runs, pageSizes, textChars, kind };
}

/** Renders a page to a canvas at the given CSS scale (crisp on high-DPI screens). */
export async function renderPage(pdf: PDFDocumentProxy, index: number, scale: number, canvas: HTMLCanvasElement): Promise<PageViewport> {
  const page = await pdf.getPage(index + 1);
  const viewport = page.getViewport({ scale });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  await page.render({ canvas, canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise;
  return viewport;
}

/** Screen rectangle (CSS px) for a run on a rendered page. */
export function runRect(viewport: PageViewport, r: { x: number; y: number; width: number; fontSize: number }) {
  const [ax, ay] = viewport.convertToViewportPoint(r.x, r.y + r.fontSize * 0.82);
  const [bx, by] = viewport.convertToViewportPoint(r.x + r.width, r.y - r.fontSize * 0.24);
  return { left: Math.min(ax, bx), top: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

/** Samples the text and background colours under a run from the rendered canvas. */
export function sampleColors(canvas: HTMLCanvasElement, viewport: PageViewport, r: PdfTextRun): { color: RGB; bg: RGB } {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const dpr = canvas.width / parseFloat(canvas.style.width || `${canvas.width}`);
  const rect = runRect(viewport, r);
  const fallback = { color: [0.1, 0.1, 0.12] as RGB, bg: [1, 1, 1] as RGB };
  if (!ctx || rect.width < 1) return fallback;
  const px = (x: number, y: number) => {
    const d = ctx.getImageData(Math.max(0, Math.round(x * dpr)), Math.max(0, Math.round(y * dpr)), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  // background: median of points just outside the text box
  const edge = [px(rect.left - 2, rect.top - 2), px(rect.left + rect.width + 2, rect.top - 2), px(rect.left - 2, rect.top + rect.height + 1), px(rect.left + rect.width / 2, rect.top - 2)];
  const bg = [0, 1, 2].map((c) => edge.map((e) => e[c]).sort((a, b) => a - b)[1]);
  // text colour: the pixel furthest from the background inside the box
  let best = bg;
  let bestD = -1;
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  const data = ctx.getImageData(Math.round(rect.left * dpr), Math.round(rect.top * dpr), w, h).data;
  for (let i = 0; i < data.length; i += 16) {
    const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
    if (d > bestD) {
      bestD = d;
      best = [data[i], data[i + 1], data[i + 2]];
    }
  }
  return { color: best.map((v) => v / 255) as RGB, bg: bg.map((v) => v / 255) as RGB };
}

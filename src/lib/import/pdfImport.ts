"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { HEADING_MARK, isSectionHeading } from "@/lib/engine/parseResume";
import { extractTextLayer, openPdf, renderPage, sampleColors } from "@/lib/pdf/load";
import { findGutter, runsToText } from "@/lib/pdf/runs";
import type { PdfTextRun, RGB } from "@/lib/pdf/types";
import { UserFacingError } from "@/lib/utils";
import { headingStyleMatcher, inferDesign, type InferredDesign } from "./designInfer";

export interface PdfImport {
  text: string;
  design: InferredDesign | null;
  warnings: string[];
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

/** Colours the text layer can't tell us (heading/name colour, sidebar fill), sampled from a render of page 1. */
async function sampleDesignColours(pdf: PDFDocumentProxy, runs: PdfTextRun[], mark: (r: PdfTextRun) => boolean, pageWidth: number) {
  const p0 = runs.filter((r) => r.page === 0);
  if (!p0.length) return {};
  const canvas = document.createElement("canvas");
  const vp = await withTimeout(renderPage(pdf, 0, 1.5, canvas), 5000);
  const heading = p0.find((r) => mark(r));
  const name = p0.reduce((m, r) => (r.fontSize > m.fontSize ? r : m), p0[0]);
  let sidebarBg: RGB | null = null;
  const g = findGutter(p0, pageWidth);
  if (g != null) {
    const left = p0.filter((r) => r.x + r.width <= g);
    const right = p0.filter((r) => r.x >= g);
    const chars = (rs: PdfTextRun[]) => rs.reduce((t, r) => t + r.text.length, 0);
    const side = chars(left) <= chars(right) ? left : right;
    if (side.length) sidebarBg = sampleColors(canvas, vp, side[Math.floor(side.length / 2)]).bg;
  }
  return { headingColor: heading ? sampleColors(canvas, vp, heading).color : null, nameColor: sampleColors(canvas, vp, name).color, sidebarBg };
}

/** Text for the parser (column-aware, headings marked) + the original design, from runs already extracted. */
export async function analyzeRunsForImport(pdf: PDFDocumentProxy | null, runs: PdfTextRun[], pageSizes: { w: number; h: number }[], scanned: boolean): Promise<{ text: string; design: InferredDesign }> {
  const pageWidth = pageSizes[0]?.w ?? 595;
  const mark = headingStyleMatcher(runs, isSectionHeading);
  const text = runsToText(runs, pageWidth, { mark, prefix: HEADING_MARK });
  const colours = pdf && !scanned ? await sampleDesignColours(pdf, runs, mark, pageWidth).catch(() => ({})) : {};
  return { text, design: inferDesign({ runs, pageSizes: pageSizes.length ? pageSizes : [{ w: pageWidth, h: pageWidth * 1.414 }], ...colours }) };
}

/** Reads a PDF CV for import. Scanned PDFs go through on-device text recognition. */
export async function readPdfForImport(bytes: Uint8Array, onStep?: (label: string) => void): Promise<PdfImport> {
  const pdf = await openPdf(bytes);
  const layer = await extractTextLayer(pdf);
  const warnings: string[] = [];
  let runs = layer.runs;
  const scanned = layer.kind === "scanned";
  if (scanned) {
    onStep?.("Recognizing text in your scanned PDF…");
    try {
      const { ocrPdf } = await import("@/lib/pdf/ocr");
      runs = (await ocrPdf(pdf, () => undefined)).runs;
      warnings.push("This PDF is a scanned image, so we used text recognition — check names, dates and numbers carefully.");
    } catch {
      throw new UserFacingError("This PDF is a scanned image and text recognition couldn't run. Check your connection and try again, or upload a DOCX.");
    }
  }
  if (!runs.length) throw new UserFacingError("We couldn't reliably extract this PDF. You can try another PDF or build your CV manually.");
  onStep?.("Matching your original design…");
  const { text, design } = await analyzeRunsForImport(pdf, runs, layer.pageSizes, scanned);
  return { text, design, warnings };
}

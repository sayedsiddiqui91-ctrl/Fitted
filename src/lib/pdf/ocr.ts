"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfTextRun } from "./types";

/* OCR for scanned (image-only) PDFs, entirely in the browser via tesseract.js.
   The PDF never leaves the device; the recognition engine and English language
   data are downloaded from a public CDN the first time OCR runs. */

export interface OcrResult {
  runs: PdfTextRun[];
  text: string;
  confidence: number;
}

export async function ocrPdf(pdf: PDFDocumentProxy, onProgress: (fraction: number, label: string) => void): Promise<OcrResult> {
  const { createWorker } = await import("tesseract.js");
  let pageIdx = 0;
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress((pageIdx + m.progress) / pdf.numPages, `Reading page ${pageIdx + 1} of ${pdf.numPages}…`);
      else if (/load/i.test(m.status)) onProgress(0, "Loading text recognition…");
    },
  });
  const runs: PdfTextRun[] = [];
  const texts: string[] = [];
  let confSum = 0;
  try {
    for (pageIdx = 0; pageIdx < pdf.numPages; pageIdx++) {
      const page = await pdf.getPage(pageIdx + 1);
      const scale = 2.2;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
      texts.push(data.text);
      confSum += data.confidence;
      let k = 0;
      for (const b of data.blocks ?? []) {
        for (const p of b.paragraphs) {
          for (const l of p.lines) {
            const text = l.text.replace(/\s+/g, " ").trim();
            if (!text || l.confidence < 35) continue;
            const baselinePx = (l.baseline.y0 + l.baseline.y1) / 2 || l.bbox.y1;
            const [x, y] = viewport.convertToPdfPoint(l.bbox.x0, baselinePx);
            const [x2] = viewport.convertToPdfPoint(l.bbox.x1, baselinePx);
            const heightPt = (l.bbox.y1 - l.bbox.y0) / scale;
            runs.push({
              id: `p${pageIdx}-o${k++}`,
              page: pageIdx,
              text,
              x,
              y,
              width: Math.max(1, x2 - x),
              fontSize: Math.max(6, Math.round(heightPt * 0.74 * 10) / 10),
              bold: false,
              italic: false,
              family: "sans",
            });
          }
        }
      }
    }
  } finally {
    await worker.terminate();
  }
  return { runs, text: texts.join("\n\n"), confidence: confSum / Math.max(1, pdf.numPages) };
}

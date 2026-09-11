"use client";

import type { CVDoc } from "@/lib/cv/schema";
import { slugify } from "@/lib/utils";
import { buildCvHtml } from "./render";

export function cvFileName(doc: Pick<CVDoc, "name" | "content">, ext: string) {
  const base = slugify(doc.content.personal.fullName ? `${doc.content.personal.fullName} CV` : doc.name) || "cv";
  return `${base}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Opens the browser print dialog for the CV (fallback + "Print"). Text stays selectable in the PDF. */
export function printCv(doc: Pick<CVDoc, "content" | "layout" | "design" | "name">): void {
  const html = buildCvHtml(doc);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0";
  document.body.appendChild(iframe);
  const w = iframe.contentWindow;
  if (!w) throw new Error("print unavailable");
  w.document.open();
  w.document.write(html);
  w.document.close();
  const go = () => {
    w.focus();
    w.print();
    setTimeout(() => iframe.remove(), 60_000);
  };
  // wait for web fonts before printing
  const fonts = (w.document as Document & { fonts?: FontFaceSet }).fonts;
  setTimeout(() => (fonts ? fonts.ready.then(go, go) : go()), 350);
}

/**
 * Generates a real PDF on the server (headless Chrome, vector text, ATS-readable).
 * Falls back to the browser print dialog if the server can't generate it.
 */
export async function downloadPdf(doc: Pick<CVDoc, "content" | "layout" | "design" | "name">): Promise<"download" | "print"> {
  const html = buildCvHtml(doc);
  try {
    const res = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`pdf ${res.status}`);
    const blob = await res.blob();
    if (blob.type !== "application/pdf" || blob.size < 500) throw new Error("bad pdf");
    triggerDownload(blob, cvFileName(doc, "pdf"));
    return "download";
  } catch {
    printCv(doc);
    return "print";
  }
}

export { triggerDownload };

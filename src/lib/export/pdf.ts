"use client";

import type { CVDoc } from "@/lib/cv/schema";
import { CV_CSS, printCss } from "@/lib/cv/styles";
import { slugify } from "@/lib/utils";
import { buildCvHtml } from "./render";

type PrintableDoc = Pick<CVDoc, "content" | "layout" | "design" | "name">;

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

/** Browsers built into other apps (Messenger, Facebook, Instagram, LinkedIn…) usually can't print or save files. */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|LinkedInApp|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly|; wv\)/i.test(navigator.userAgent);
}

const isTouchDevice = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/* Phones ignore print() on a hidden iframe — tapping Print just did nothing. Printing the page itself works
   on Android Chrome and iOS Safari, so the CV is mounted into this page and everything else is hidden from
   the printer while the print sheet is open. */
function printInPage(doc: PrintableDoc): void {
  const parsed = new DOMParser().parseFromString(buildCvHtml(doc), "text/html");
  const wrap = document.createElement("div");
  wrap.id = "fitted-print";
  parsed.head.querySelectorAll('link[rel="stylesheet"]').forEach((n) => wrap.appendChild(n.cloneNode(true)));
  const cvStyle = document.createElement("style");
  // Page rules only while printing, so the app behind stays exactly as it was
  cvStyle.textContent = `${CV_CSS}@media print{${printCss(doc.design.pageSize, doc.design.margin)}}`;
  wrap.appendChild(cvStyle);
  wrap.insertAdjacentHTML("beforeend", parsed.body.innerHTML);

  const hide = document.createElement("style");
  hide.textContent = "#fitted-print{display:none}@media print{body>*:not(#fitted-print){display:none!important}#fitted-print{display:block!important}}";
  document.head.appendChild(hide);
  document.body.appendChild(wrap);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    wrap.remove();
    hide.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 120_000);
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  const go = () => window.print();
  setTimeout(() => (fonts ? fonts.ready.then(go, go) : go()), 400);
}

/** Opens the print dialog for the CV (fallback + "Print"). Text stays selectable in the PDF. */
export function printCv(doc: PrintableDoc): void {
  if (isTouchDevice()) {
    printInPage(doc);
    return;
  }
  const html = buildCvHtml(doc);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0";
  document.body.appendChild(iframe);
  const w = iframe.contentWindow;
  if (!w) {
    iframe.remove();
    printInPage(doc);
    return;
  }
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

export type PdfOutcome = "download" | "print" | "in-app";

/**
 * Generates a real PDF on the server (headless Chrome, vector text, ATS-readable) and downloads it.
 * Falls back to the print dialog if the server can't generate it.
 */
export async function downloadPdf(doc: PrintableDoc): Promise<PdfOutcome> {
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
    // An in-app browser may swallow the file — say how to get it rather than pretend it worked
    return isInAppBrowser() ? "in-app" : "download";
  } catch {
    if (isInAppBrowser()) return "in-app";
    printCv(doc);
    return "print";
  }
}

/** What to tell the user after a download attempt. */
export function pdfOutcomeMessage(outcome: PdfOutcome): { title: string; description?: string; tone: "success" | "info" } {
  if (outcome === "download") return { title: "PDF downloaded", description: "Free, no watermark. Good luck!", tone: "success" };
  if (outcome === "in-app")
    return {
      title: "Open Fitted in Chrome or Safari to download",
      description: "Browsers inside apps like Messenger, Facebook or Instagram often can't save files. Tap ⋯ → Open in browser, then download again.",
      tone: "info",
    };
  return { title: "Choose “Save as PDF” to download", description: "In the print screen, pick Save as PDF (on iPhone: Share → Save to Files).", tone: "info" };
}

export { triggerDownload };

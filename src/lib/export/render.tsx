"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { CVDocument } from "@/components/cv/CVDocument";
import type { CVDoc } from "@/lib/cv/schema";
import { CV_CSS, printCss } from "@/lib/cv/styles";
import { googleFontHref } from "@/lib/cv/meta";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Renders a CV to a standalone, print-ready HTML document (same markup as the preview). */
export function buildCvHtml(doc: Pick<CVDoc, "content" | "layout" | "design" | "name">): string {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(<CVDocument doc={doc} />));
  const inner = host.innerHTML;
  root.unmount();
  const title = esc(doc.content.personal.fullName ? `${doc.content.personal.fullName} — CV` : doc.name);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${googleFontHref(doc.design.font)}">
<style>${CV_CSS}${printCss(doc.design.pageSize, doc.design.margin)}</style></head><body>${inner}</body></html>`;
}

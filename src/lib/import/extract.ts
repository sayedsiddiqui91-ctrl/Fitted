"use client";

import { UserFacingError } from "@/lib/utils";
import { HEADING_MARK } from "@/lib/engine/parseResume";
import type { InferredDesign } from "./designInfer";

const MAX_BYTES = 10 * 1024 * 1024;

export interface ImportExtraction {
  text: string;
  /** The original CV's design (PDF only), so an imported CV keeps its look */
  design: InferredDesign | null;
  warnings: string[];
  /** The original PDF, so the review step can show it side by side */
  bytes?: Uint8Array;
}

/** Reads a PDF, DOCX or TXT CV for import — entirely in the browser. */
export async function extractForImport(file: File, onStep?: (label: string) => void): Promise<ImportExtraction> {
  const name = file.name.toLowerCase();
  if (file.size === 0) throw new UserFacingError("That file is empty. Please choose another file.");
  if (file.size > MAX_BYTES) throw new UserFacingError("That file is larger than 10 MB. Please upload a smaller PDF, DOCX or TXT file.");
  if (name.endsWith(".doc")) throw new UserFacingError("Older .doc files aren't supported. Open it in Word and save as .docx or PDF, then try again.");

  const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";
  let result: ImportExtraction;
  if (isPdf) {
    try {
      const { readPdfForImport } = await import("./pdfImport");
      const bytes = new Uint8Array(await file.arrayBuffer());
      result = { ...(await readPdfForImport(bytes.slice(), onStep)), bytes };
    } catch (err) {
      if (err instanceof UserFacingError) throw err;
      throw new UserFacingError("We couldn't read this PDF. It may be damaged — try exporting it again or upload a DOCX.");
    }
  } else if (name.endsWith(".docx") || file.type.includes("wordprocessingml")) result = { text: await fromDocx(file), design: null, warnings: [] };
  else if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) result = { text: await file.text(), design: null, warnings: [] };
  else throw new UserFacingError("That file type isn't supported. Please upload a PDF, DOCX or TXT file.");

  const cleaned = result.text.replace(/[​­]/g, "").trim();
  if (cleaned.replace(/§§/g, "").replace(/\s/g, "").length < 40)
    throw new UserFacingError(isPdf ? "We couldn't find readable text in this PDF. Try uploading a DOCX or text version instead." : "We couldn't find enough text in this file to build a CV.");
  return { ...result, text: cleaned };
}

async function fromDocx(file: File): Promise<string> {
  try {
    const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    const dom = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const lines: string[] = [];
    dom.body.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, td").forEach((el) => {
      if (el.tagName === "TD" && el.querySelector("p")) return;
      const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!t) return;
      // Word "Heading 2–6" paragraphs are section headings: keep them as sections even with unusual wording
      const heading = /^H[2-6]$/.test(el.tagName) && t.split(/\s+/).length <= 6 && !/\d{3,}/.test(t);
      lines.push(el.tagName === "LI" ? `• ${t}` : heading ? `${HEADING_MARK}${t}` : t);
    });
    return lines.join("\n");
  } catch {
    throw new UserFacingError("We couldn't read this Word document. Try saving it again as .docx or upload a PDF.");
  }
}

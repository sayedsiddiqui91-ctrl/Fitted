/* Shared types for the Edit-PDF workflow. Coordinates are PDF user space
   (points, origin bottom-left); y is the text BASELINE. */

export type FontFamilyKind = "sans" | "serif" | "mono";
export type RGB = [number, number, number]; // 0..1

/** One editable line/run of text extracted from a PDF page. */
export interface PdfTextRun {
  id: string;
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  family: FontFamilyKind;
  color?: RGB;
  /** Real font name (subset prefix removed), when the PDF provides it — used to match the original design */
  font?: string;
}

export interface PdfRegion {
  x: number;
  y: number;
  w: number;
  fs: number;
}

export interface PdfEdit {
  id: string;
  page: number;
  kind: "replace" | "delete" | "add";
  runId?: string;
  /** original text area to clear (replace/delete) */
  region?: PdfRegion;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  family: FontFamilyKind;
  color: RGB;
  /** background colour under the text (only used for the cover fallback) */
  bg?: RGB;
}

export interface ApplyResult {
  bytes: Uint8Array;
  warnings: string[];
  removed: number;
  covered: number;
}

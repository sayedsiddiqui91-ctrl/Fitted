import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { applyReplacements, findShowOps, IDENTITY, mul, parseContent, planRemovals, type FontMetrics, type M, type Reach, type Region } from "./contentStream";
import type { ApplyResult, FontFamilyKind, PdfEdit } from "./types";

/* Quick PDF edit: the ORIGINAL file is kept untouched; this produces a new file.
   1. remove the original text operators in each edited region (real removal)
   2. draw the new text at the same (or moved) position with a matched standard font
   3. only if removal can't find the text (e.g. unusual fonts), cover it and warn */

function decode(obj: unknown): Uint8Array | null {
  if (obj instanceof PDFRawStream) {
    try {
      return decodePDFRawStream(obj).decode();
    } catch {
      return null;
    }
  }
  return null;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const sep = new Uint8Array([10]);
  const total = parts.reduce((s, p) => s + p.length + 1, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
    out.set(sep, o);
    o += 1;
  }
  return out;
}

const numOf = (o: unknown): number | null => {
  if (o == null) return null;
  const v = Number(String(o));
  return Number.isFinite(v) ? v : null;
};

/** Real glyph widths from a font resource: simple fonts (/FirstChar + /Widths, Type3 via /FontMatrix)
    and CID fonts (/DW + /W with Identity encoding). Unknown → null, and positions fall back to estimates. */
function fontMetrics(resources: PDFDict | undefined, name: string): FontMetrics {
  const fonts = resources?.lookupMaybe(PDFName.of("Font"), PDFDict);
  const f = fonts?.lookupMaybe(PDFName.of(name), PDFDict);
  if (!f) return { twoByte: false, width: () => null };
  const sub = f.get(PDFName.of("Subtype"))?.toString();
  try {
    if (sub === "/Type0") {
      const cid = f.lookupMaybe(PDFName.of("DescendantFonts"), PDFArray)?.lookupMaybe(0, PDFDict);
      const dw = numOf(cid?.lookup(PDFName.of("DW"))) ?? 1000;
      const table = new Map<number, number>();
      const W = cid?.lookupMaybe(PDFName.of("W"), PDFArray);
      if (W) {
        for (let i = 0; i < W.size(); ) {
          const c0 = numOf(W.lookup(i));
          const next = W.lookup(i + 1);
          if (c0 == null) break;
          if (next instanceof PDFArray) {
            for (let k = 0; k < next.size(); k++) {
              const w = numOf(next.lookup(k));
              if (w != null) table.set(c0 + k, w);
            }
            i += 2;
          } else {
            const c1 = numOf(next);
            const w = numOf(W.lookup(i + 2));
            if (c1 == null || w == null) break;
            for (let c = c0; c <= c1 && c - c0 < 65536; c++) table.set(c, w);
            i += 3;
          }
        }
      }
      const identity = /Identity/.test(f.get(PDFName.of("Encoding"))?.toString() ?? "");
      return { twoByte: true, width: (code) => (identity ? (table.get(code) ?? dw) : null) };
    }
    const first = numOf(f.lookup(PDFName.of("FirstChar")));
    const widths = f.lookupMaybe(PDFName.of("Widths"), PDFArray);
    if (!widths || first == null) return { twoByte: false, width: () => null };
    const fm = sub === "/Type3" ? f.lookupMaybe(PDFName.of("FontMatrix"), PDFArray) : undefined;
    const scale = fm ? (numOf(fm.lookup(0)) ?? 0.001) * 1000 : 1;
    const missing = numOf(f.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict)?.lookup(PDFName.of("MissingWidth")));
    const list: (number | null)[] = [];
    for (let k = 0; k < widths.size(); k++) list.push(numOf(widths.lookup(k)));
    return { twoByte: false, width: (code) => (list[code - first] ?? missing ?? null) === null ? null : (list[code - first] ?? missing!) * scale };
  } catch {
    return { twoByte: sub === "/Type0", width: () => null };
  }
}

function metricsCache(resources: PDFDict | undefined): (font: string) => FontMetrics {
  const cache = new Map<string, FontMetrics>();
  return (font) => {
    if (!cache.has(font)) cache.set(font, fontMetrics(resources, font));
    return cache.get(font)!;
  };
}

const numArr = (a: PDFArray | undefined): M | null => {
  if (!a || a.size() < 6) return null;
  const v = a.asArray().map((x) => Number(x.toString()));
  return v.every((n) => Number.isFinite(n)) ? (v as M) : null;
};

/** Removes text ops inside regions from a page (and its form XObjects). Returns matches and removed extent per region. */
function removeText(doc: PDFDocument, page: PDFPage, regions: Region[]): { matched: number[]; reach: Reach[] } {
  const matched = regions.map(() => 0);
  const reach: Reach[] = regions.map(() => ({ start: Infinity, end: -Infinity, reliable: true }));
  const mergeReach = (rs: Reach[]) =>
    rs.forEach((g, i) => {
      if (g.end === -Infinity) return;
      reach[i] = { start: Math.min(reach[i].start, g.start), end: Math.max(reach[i].end, g.end), reliable: reach[i].reliable && g.reliable };
    });
  if (!regions.length) return { matched, reach };
  const resources = page.node.Resources();
  const contents = page.node.Contents();
  const parts: Uint8Array[] = [];
  if (contents instanceof PDFArray) {
    for (let k = 0; k < contents.size(); k++) {
      const b = decode(contents.lookup(k));
      if (b) parts.push(b);
    }
  } else {
    const b = decode(contents);
    if (b) parts.push(b);
  }
  if (!parts.length) return { matched, reach };

  const data = concat(parts);
  const instrs = parseContent(data);
  const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);

  const visitForm = (name: string, ctm: M) => {
    const ref = xobjects?.get(PDFName.of(name));
    if (!(ref instanceof PDFRef)) return;
    const stream = doc.context.lookup(ref);
    if (!(stream instanceof PDFRawStream) || stream.dict.get(PDFName.of("Subtype"))?.toString() !== "/Form") return;
    const bytes = decode(stream);
    if (!bytes) return;
    const matrix = numArr(stream.dict.lookupMaybe(PDFName.of("Matrix"), PDFArray)) ?? IDENTITY;
    const formRes = stream.dict.lookupMaybe(PDFName.of("Resources"), PDFDict) ?? resources;
    const fInstrs = parseContent(bytes);
    const fShows = findShowOps(fInstrs, mul(matrix, ctm), metricsCache(formRes));
    const plan = planRemovals(fInstrs, fShows, regions);
    if (!plan.replacements.length) return;
    plan.matched.forEach((m, i) => (matched[i] += m));
    mergeReach(plan.reach);
    const dict = stream.dict.clone(doc.context);
    dict.delete(PDFName.of("Filter"));
    dict.delete(PDFName.of("DecodeParms"));
    doc.context.assign(ref, PDFRawStream.of(dict, applyReplacements(bytes, plan.replacements)));
  };

  const shows = findShowOps(instrs, IDENTITY, metricsCache(resources), visitForm);
  const plan = planRemovals(instrs, shows, regions);
  plan.matched.forEach((m, i) => (matched[i] += m));
  mergeReach(plan.reach);
  if (plan.replacements.length) {
    const stream = doc.context.flateStream(applyReplacements(data, plan.replacements));
    page.node.set(PDFName.of("Contents"), doc.context.register(stream));
  }
  return { matched, reach };
}

const FONT_MAP: Record<FontFamilyKind, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

/** Replaces characters the standard fonts can't encode, reporting them once. */
function encodable(text: string, font: PDFFont, warnings: Set<string>): string {
  let out = "";
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      const fallback = ch === "‑" ? "-" : ch === " " ? " " : "?";
      out += fallback;
      warnings.add(`The character “${ch}” isn't supported in quick edit and was replaced. Use Smart CV Edit for full character support.`);
    }
  }
  return out;
}

export async function applyPdfEdits(input: Uint8Array, edits: PdfEdit[], opts: { scanned?: boolean } = {}): Promise<ApplyResult> {
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  const warnings = new Set<string>();
  const fontCache = new Map<string, PDFFont>();
  const getFont = async (family: FontFamilyKind, bold: boolean, italic: boolean) => {
    const key = `${family}-${bold}-${italic}`;
    if (!fontCache.has(key)) fontCache.set(key, await doc.embedFont(FONT_MAP[family][(bold ? 1 : 0) + (italic ? 2 : 0)]));
    return fontCache.get(key)!;
  };
  let removed = 0;
  let covered = 0;
  const pages = doc.getPages();

  for (const [pi, page] of pages.entries()) {
    const pageEdits = edits.filter((e) => e.page === pi);
    if (!pageEdits.length) continue;
    const withRegion = pageEdits.filter((e) => (e.kind === "replace" || e.kind === "delete") && e.region);
    const { matched, reach } = removeText(doc, page, withRegion.map((e) => e.region!));
    withRegion.forEach((e, i) => {
      if (matched[i] > 0) {
        removed++;
        // Safety net: when glyph extents are measured and show a sliver of the line was NOT removed
        // (an unusual font or layout), hide that sliver so no stray character remains — and say so.
        const r = e.region!;
        const g = reach[i];
        if (g.reliable) {
          const slivers: [number, number][] = [];
          if (g.start > r.x + 1.2) slivers.push([r.x, g.start]);
          if (g.end < r.x + r.w - 1.2) slivers.push([g.end, r.x + r.w]);
          const [br, bg, bb] = e.bg ?? [1, 1, 1];
          for (const [a, b] of slivers) page.drawRectangle({ x: a - 0.5, y: r.y - r.fs * 0.3, width: b - a + 1, height: r.fs * 1.25, color: rgb(br, bg, bb) });
          if (slivers.length) warnings.add("A few characters at the edge of an edited line couldn't be removed from the file itself and were covered instead.");
        }
      } else {
        // Couldn't locate the original operators: hide visually and tell the user honestly.
        const r = e.region!;
        const [br, bg, bb] = e.bg ?? [1, 1, 1];
        page.drawRectangle({ x: r.x - 1, y: r.y - r.fs * 0.3, width: r.w + 2, height: r.fs * 1.25, color: rgb(br, bg, bb) });
        covered++;
        warnings.add(
          opts.scanned
            ? "This is a scanned PDF, so edits are painted over the image. Scanned text isn't machine-readable — use Smart CV Edit for an ATS-friendly version."
            : "Some original text couldn't be removed from the file itself and was covered instead. It may still be readable by ATS software — use Smart CV Edit to rebuild the CV cleanly.",
        );
      }
    });

    for (const e of pageEdits) {
      if (e.kind === "delete" || !e.text.trim()) continue;
      const font = await getFont(e.family, e.bold, e.italic);
      const lines = e.text.split(/\r?\n/);
      lines.forEach((line, li) => {
        const t = encodable(line, font, warnings);
        if (!t) return;
        page.drawText(t, { x: e.x, y: e.y - li * e.fontSize * 1.2, size: e.fontSize, font, color: rgb(e.color[0], e.color[1], e.color[2]) });
      });
    }
  }

  doc.setModificationDate(new Date());
  doc.setProducer("Fitted — quick PDF edit");
  const bytes = await doc.save({ useObjectStreams: true });
  return { bytes, warnings: [...warnings], removed, covered };
}

/** Width of text in a standard font — used to warn when an edit overflows its line. */
export async function measureStandard(text: string, size: number, family: FontFamilyKind, bold: boolean): Promise<number> {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(FONT_MAP[family][bold ? 1 : 0]);
  try {
    return f.widthOfTextAtSize(text, size);
  } catch {
    return text.length * size * 0.5;
  }
}

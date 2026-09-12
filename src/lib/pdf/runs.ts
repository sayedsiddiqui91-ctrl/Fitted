import type { FontFamilyKind, PdfTextRun } from "./types";

/* Groups pdf.js text items into editable runs (one per visual line segment).
   A large horizontal gap starts a new run, so a right-aligned date or a second
   column is edited independently of the text beside it. */

export interface RawTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}

export interface FontInfo {
  /** real font name, e.g. "ABCDEF+Inter-Bold" */
  name?: string;
  /** pdf.js style family, e.g. "sans-serif" */
  family?: string;
}

export function classifyFont(info: FontInfo): { bold: boolean; italic: boolean; family: FontFamilyKind } {
  const n = `${info.name ?? ""}`.replace(/^[A-Z]{6}\+/, "");
  const bold = /bold|black|heavy|semibold|demi|extrabold/i.test(n);
  const italic = /italic|oblique/i.test(n);
  const mono = /mono|courier|consol|menlo/i.test(n) || info.family === "monospace";
  const serif = !mono && (/serif(?!.*sans)|times|georgia|garamond|lora|merriweather|minion|cambria|baskerville|palatino|book ?antiqua|charter|caslon/i.test(n) && !/sans/i.test(n) || (info.family === "serif" && !n));
  return { bold, italic, family: mono ? "mono" : serif ? "serif" : "sans" };
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Average character width and space width, in ems, measured from where the PDF puts each piece of text. */
export interface Advance {
  /** width of one character, as a fraction of the font size */
  char: number;
  /** width of a space, as a fraction of the font size */
  space: number;
}

/* Some PDFs (subset fonts with missing or default glyph widths) report every piece of text as far wider
   than it is drawn. The gap between two words then measures as zero or negative and they run together —
   that is how "SMAC Advisory Ltd" became "SMACAdvisoryLtd". Item positions are always right, so we fit
   `advance = char × letters + space` across the page: the intercept IS the width of a space. */
export function fitAdvance(lines: { str: string; x: number; size: number }[][]): Advance | null {
  const pts: [number, number][] = [];
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [a, b] = [line[i], line[i + 1]];
      const adv = (b.x - a.x) / a.size;
      // Skip column jumps and anything a line of text can't be: at most one em per letter, plus a space
      if (adv > 0.05 && adv < a.str.length + 1) pts.push([a.str.length, adv]);
    }
  }
  if (pts.length < 2) return null;
  const n = pts.length;
  const sx = pts.reduce((t, [l]) => t + l, 0);
  const sy = pts.reduce((t, [, a]) => t + a, 0);
  const den = n * pts.reduce((t, [l]) => t + l * l, 0) - sx * sx;
  if (!den) return null; // every word the same length — nothing to separate
  const char = (n * pts.reduce((t, [l, a]) => t + l * a, 0) - sx * sy) / den;
  const space = (sy - char * sx) / n;
  return char > 0.2 && char < 1.2 && space > 0.08 && space < 0.6 ? { char, space } : null;
}

export function buildRuns(items: RawTextItem[], page: number, fontInfo: (fontName: string) => FontInfo): PdfTextRun[] {
  type It = RawTextItem & { x: number; y: number; size: number; spaceBefore?: boolean };
  // A whitespace-only item is the PDF saying "there is a space here" — remember it instead of dropping it
  let pendingSpace = false;
  const list: It[] = [];
  for (const it of items) {
    if (!it.str || !it.transform || it.transform.length < 6) continue;
    if (!it.str.trim()) {
      pendingSpace = true;
      continue;
    }
    if (Math.abs(it.transform[1]) >= 0.01) continue; // horizontal text only (rotated text isn't quick-editable)
    list.push({ ...it, x: it.transform[4], y: it.transform[5], size: Math.hypot(it.transform[2], it.transform[3]) || it.height || 10, spaceBefore: pendingSpace });
    pendingSpace = false;
  }

  // group into lines
  list.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: It[][] = [];
  for (const it of list) {
    const line = lines.find((l) => Math.abs(l[0].y - it.y) < Math.max(1.2, l[0].size * 0.3) && Math.abs(l[0].size - it.size) < l[0].size * 0.5);
    if (line) line.push(it);
    else lines.push([it]);
  }

  for (const line of lines) line.sort((a, b) => a.x - b.x);
  // Measured once per page, so even a two-word line benefits from the rest of the page's spacing
  const fit = fitAdvance(lines);
  // If pieces of text are reported as overlapping each other, this PDF's widths are wrong everywhere,
  // not just where they overlap — so the whole page is measured from positions instead.
  let boundaries = 0;
  let overlaps = 0;
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      boundaries++;
      if (line[i + 1].x - (line[i].x + line[i].width) < -0.5) overlaps++;
    }
  }
  const trustWidths = !fit || overlaps < boundaries * 0.15;
  /** The gap before `it` — from the PDF's own widths when they hold up, from positions when they don't. */
  const realGap = (prev: It, it: It): number => (trustWidths ? it.x - (prev.x + prev.width) : it.x - prev.x - fit!.char * prev.str.length * prev.size);

  const runs: PdfTextRun[] = [];
  let k = 0;
  for (const line of lines) {
    let cur: It[] = [];
    const flush = () => {
      if (!cur.length) return;
      const first = cur[0];
      const last = cur[cur.length - 1];
      let text = "";
      cur.forEach((it, idx) => {
        if (idx > 0) {
          const prev = cur[idx - 1];
          const space = realGap(prev, it) > (fit ? Math.min(it.size * 0.18, fit.space * it.size * 0.5) : it.size * 0.18);
          if ((space || it.spaceBefore) && !text.endsWith(" ") && !it.str.startsWith(" ")) text += " ";
        }
        text += it.str;
      });
      const info = fontInfo(first.fontName);
      const style = classifyFont(info);
      runs.push({
        font: info.name?.replace(/^[A-Z]{6}\+/, ""),
        id: `p${page}-r${k++}`,
        page,
        text: text.replace(/\s+/g, " ").trim(),
        x: first.x,
        y: first.y,
        width: Math.max(1, last.x + last.width - first.x),
        fontSize: Math.round(first.size * 100) / 100,
        ...style,
      });
      cur = [];
    };
    for (const it of line) {
      const prev = cur[cur.length - 1];
      if (prev) {
        const differentStyle = Math.abs(prev.size - it.size) > prev.size * 0.25;
        if (realGap(prev, it) > Math.max(prev.size * 1.6, 14) || differentStyle) flush();
      }
      cur.push(it);
    }
    flush();
  }
  return runs;
}

/** Two-column detection: a vertical gutter that no run crosses, with text on both sides. */
export function findGutter(list: PdfTextRun[], pageWidth: number): number | null {
  for (let g = pageWidth * 0.25; g <= pageWidth * 0.7; g += 4) {
    const crossing = list.filter((r) => r.x < g - 2 && r.x + r.width > g + 2).length;
    const left = list.filter((r) => r.x + r.width <= g).length;
    const right = list.filter((r) => r.x >= g).length;
    if (crossing <= Math.max(1, list.length * 0.04) && left > 5 && right > 5) return g;
  }
  return null;
}

/** Plain text from runs, in reading order (column-aware). `mark` flags heading lines, which get `prefix`. */
export function runsToText(runs: PdfTextRun[], pageWidth: number, opts?: { mark?: (r: PdfTextRun) => boolean; prefix?: string }): string {
  const byPage = new Map<number, PdfTextRun[]>();
  for (const r of runs) byPage.set(r.page, [...(byPage.get(r.page) ?? []), r]);
  const out: string[] = [];
  for (const [, list] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    const gutter = findGutter(list, pageWidth);
    const header = gutter == null ? [] : list.filter((r) => r.x < gutter! && r.x + r.width > gutter!);
    const cols = gutter == null ? [list] : [list.filter((r) => r.x + r.width <= gutter! && !header.includes(r)), list.filter((r) => r.x >= gutter! && !header.includes(r))];
    const lineText = (rs: PdfTextRun[]) => {
      const sorted = [...rs].sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: PdfTextRun[][] = [];
      for (const r of sorted) {
        const l = lines.find((x) => Math.abs(x[0].y - r.y) < Math.max(1.5, r.fontSize * 0.35));
        if (l) l.push(r);
        else lines.push([r]);
      }
      const res: string[] = [];
      let prevY: number | null = null;
      let prevSize = 10;
      for (const l of lines) {
        l.sort((a, b) => a.x - b.x);
        const heading = !!opts?.mark && l.some(opts.mark);
        // Line size = its largest text (a tiny bullet glyph mustn't count); a gap of > 1.5 lines = a new entry
        const size = Math.max(...l.map((r) => r.fontSize));
        if (prevY != null && (prevY - l[0].y > Math.max(prevSize, size) * 1.5 || heading)) res.push("");
        res.push(`${heading ? (opts?.prefix ?? "") : ""}${l.map((r) => r.text).join("   ")}`);
        prevY = l[0].y;
        prevSize = size;
      }
      return res.join("\n");
    };
    if (header.length) out.push(lineText(header));
    for (const c of cols) out.push(lineText(c));
  }
  return out.join("\n\n");
}

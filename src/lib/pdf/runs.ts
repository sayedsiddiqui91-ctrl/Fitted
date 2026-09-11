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

export function buildRuns(items: RawTextItem[], page: number, fontInfo: (fontName: string) => FontInfo): PdfTextRun[] {
  type It = RawTextItem & { x: number; y: number; size: number };
  const list: It[] = items
    .filter((it) => it.str && it.str.trim() && it.transform?.length >= 6)
    .map((it) => ({ ...it, x: it.transform[4], y: it.transform[5], size: Math.hypot(it.transform[2], it.transform[3]) || it.height || 10 }))
    .filter((it) => Math.abs(it.transform[1]) < 0.01); // horizontal text only (rotated text isn't quick-editable)

  // group into lines
  list.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: It[][] = [];
  for (const it of list) {
    const line = lines.find((l) => Math.abs(l[0].y - it.y) < Math.max(1.2, l[0].size * 0.3) && Math.abs(l[0].size - it.size) < l[0].size * 0.5);
    if (line) line.push(it);
    else lines.push([it]);
  }

  const runs: PdfTextRun[] = [];
  let k = 0;
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    let cur: It[] = [];
    const flush = () => {
      if (!cur.length) return;
      const first = cur[0];
      const last = cur[cur.length - 1];
      let text = "";
      cur.forEach((it, idx) => {
        if (idx > 0) {
          const prev = cur[idx - 1];
          const gap = it.x - (prev.x + prev.width);
          if (gap > it.size * 0.18 && !text.endsWith(" ") && !it.str.startsWith(" ")) text += " ";
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
        const gap = it.x - (prev.x + prev.width);
        const differentStyle = Math.abs(prev.size - it.size) > prev.size * 0.25;
        if (gap > Math.max(prev.size * 1.6, 14) || differentStyle) flush();
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

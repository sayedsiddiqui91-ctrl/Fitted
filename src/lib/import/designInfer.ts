import type { Design, TemplateId } from "@/lib/cv/schema";
import { CV_FONTS, templateMeta } from "@/lib/cv/meta";
import { DEFAULT_DESIGN, TEMPLATE_DESIGN_DEFAULTS } from "@/lib/cv/defaults";
import { findGutter } from "@/lib/pdf/runs";
import type { PdfTextRun, RGB } from "@/lib/pdf/types";

/* Reads the ORIGINAL CV's design from its PDF text layer (fonts, sizes, positions) plus a few sampled
   colours, and turns it into a Fitted design: the closest template, with the original's font, size,
   line spacing, margins, colour and page size. The user can switch templates at any time.
   Pure functions (no DOM) so they can be tested. */

export interface DesignSignals {
  runs: PdfTextRun[];
  pageSizes: { w: number; h: number }[];
  headingColor?: RGB | null;
  nameColor?: RGB | null;
  sidebarBg?: RGB | null;
}

export interface InferredDesign {
  design: Design;
  /** One-line explanation shown to the user */
  summary: string;
  columns: 1 | 2;
}

const FONT_MAP: [RegExp, string][] = [
  [/^inter\b|^inter[-,]/i, "Inter"],
  [/roboto/i, "Roboto"],
  [/\blato/i, "Lato"],
  [/plex/i, "IBM Plex Sans"],
  [/source ?sans|sourcesans/i, "Source Sans 3"],
  [/source ?serif|sourceserif/i, "Source Serif 4"],
  [/\blora/i, "Lora"],
  [/merriweather/i, "Merriweather"],
  [/garamond/i, "EB Garamond"],
  [/calibri|carlito|segoe|open ?sans|opensans|noto ?sans|verdana|tahoma|trebuchet|gill ?sans|myriad/i, "Source Sans 3"],
  [/arial|helvetica|arimo|liberation ?sans|nimbus ?sans|montserrat|poppins|nunito|raleway|work ?sans|dm ?sans|avenir|proxima|futura/i, "Inter"],
  [/times|tinos|georgia|cambria|minion|palatino|book ?antiqua|baskerville|caslon|charter|century|crimson|pt ?serif|bookman/i, "Source Serif 4"],
];

/** Closest available web font for a PDF font name. */
export function mapFont(name?: string, family?: string): string {
  const n = (name ?? "").replace(/^[A-Z]{6}\+/, "");
  for (const [re, f] of FONT_MAP) if (re.test(n)) return f;
  return family === "serif" ? "Source Serif 4" : "Inter";
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
function weightedMedian(pairs: [number, number][]): number | null {
  if (!pairs.length) return null;
  const s = [...pairs].sort((a, b) => a[0] - b[0]);
  const total = s.reduce((t, [, w]) => t + w, 0);
  let acc = 0;
  for (const [v, w] of s) {
    acc += w;
    if (acc >= total / 2) return v;
  }
  return s[s.length - 1][0];
}
const toHex = (c: RGB) => `#${c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0")).join("")}`;
const saturation = (c: RGB) => {
  const mx = Math.max(...c);
  const mn = Math.min(...c);
  return mx === 0 ? 0 : (mx - mn) / mx;
};
const luminance = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const isColour = (c?: RGB | null): c is RGB => !!c && saturation(c) > 0.2 && luminance(c) < 0.8 && luminance(c) > 0.04;

/** Recognizes heading lines by STYLE: the style shared by the CV's known headings ("EXPERIENCE", "EDUCATION")
    is applied to other lines, so unusual headings ("Leadership & Activities") are found too. */
export function headingStyleMatcher(runs: PdfTextRun[], isHeading: (text: string) => boolean): (r: PdfTextRun) => boolean {
  const sig = (r: PdfTextRun) => `${Math.round(r.fontSize * 2) / 2}|${r.bold ? "b" : ""}|${(r.font ?? r.family).toLowerCase()}|${r.text === r.text.toUpperCase() ? "U" : ""}`;
  const counts = new Map<string, number>();
  for (const r of runs) if (isHeading(r.text)) counts.set(sig(r), (counts.get(sig(r)) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  // Headings sit alone on their line (no date or text beside them) and are short
  const alone = (r: PdfTextRun) => !runs.some((o) => o !== r && o.page === r.page && Math.abs(o.y - r.y) < 2 && o.fontSize > 2);
  const shaped = (r: PdfTextRun) => r.text.split(/\s+/).length <= 6 && !/\d/.test(r.text) && /[A-Za-z]{3}/.test(r.text) && !/[.,;:]$/.test(r.text) && alone(r);
  // Generalize from the known headings' style only if (nearly) every line in that style is heading-shaped —
  // then "LEADERSHIP & IMPACT" in the same style is a heading too, however many there are
  const same = best ? runs.filter((r) => sig(r) === best[0]) : [];
  const usable = !!best && best[1] >= 2 && same.filter(shaped).length >= same.length * 0.8;
  return (r) => isHeading(r.text) || (usable && sig(r) === best![0] && shaped(r));
}

export function inferDesign(s: DesignSignals): InferredDesign {
  const { runs } = s;
  const { w: pw, h: ph } = s.pageSizes[0] ?? { w: 595, h: 842 };
  const p0 = runs.filter((r) => r.page === 0);
  const pageSize: Design["pageSize"] = Math.abs(pw - 612) < 14 && Math.abs(ph - 792) < 14 ? "Letter" : "A4";

  // Body text size: character-weighted median of longer runs
  const bodyRuns = runs.filter((r) => r.text.length >= 25);
  const body = weightedMedian((bodyRuns.length ? bodyRuns : runs).map((r) => [r.fontSize, r.text.length] as [number, number])) ?? 10;
  const fontSize = clamp(Math.round(body * 2) / 2, 8.5, 12);

  // Name = largest text near the top of page 1; centred header if it sits in the middle
  const top = p0.filter((r) => r.y > ph * 0.72);
  const name = (top.length ? top : p0).reduce<PdfTextRun | null>((m, r) => (!m || r.fontSize > m.fontSize ? r : m), null);
  const centered = !!name && Math.abs(name.x + name.width / 2 - pw / 2) < pw * 0.07 && name.x > pw * 0.15;

  // Columns
  const gutter = findGutter(p0, pw);
  let sidebar: "left" | "right" | null = null;
  if (gutter != null) {
    const chars = (rs: PdfTextRun[]) => rs.reduce((t, r) => t + r.text.length, 0);
    sidebar = chars(p0.filter((r) => r.x + r.width <= gutter)) <= chars(p0.filter((r) => r.x >= gutter)) ? "left" : "right";
  }

  // Margin: where text starts on page 1
  const xs = p0.map((r) => r.x).sort((a, b) => a - b);
  const leftX = xs[Math.floor(xs.length * 0.05)] ?? 45;
  const margin = clamp(Math.round((leftX * 25.4) / 72), 8, 25);

  // Line spacing: typical baseline gap between consecutive body lines
  const ys = [...new Set(bodyRuns.filter((r) => r.page === 0 && Math.abs(r.fontSize - body) < 0.6).map((r) => Math.round(r.y * 10) / 10))].sort((a, b) => b - a);
  const gaps = ys
    .slice(1)
    .map((y, i) => ys[i] - y)
    .filter((g) => g > body * 0.9 && g < body * 2.2)
    .sort((a, b) => a - b);
  const lineHeight = gaps.length ? clamp(Math.round((gaps[Math.floor(gaps.length / 2)] / body) * 20) / 20, 1.15, 1.7) : 1.4;

  // Font: the one used for most characters
  const votes = new Map<string, number>();
  for (const r of runs) {
    const f = mapFont(r.font, r.family);
    votes.set(f, (votes.get(f) ?? 0) + r.text.length);
  }
  const font = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Inter";
  const serif = CV_FONTS.find((f) => f.name === font)?.kind === "serif";

  // Colour: headings first, then the name, then a coloured sidebar; black if the original is black
  const accentC = isColour(s.headingColor) ? s.headingColor : isColour(s.nameColor) ? s.nameColor : isColour(s.sidebarBg) ? s.sidebarBg : null;
  const accent = accentC ? toHex(accentC) : s.headingColor && luminance(s.headingColor) < 0.35 ? toHex(s.headingColor) : "#111827";

  // Closest template by STRUCTURE (the font/colour/size above are then applied on top)
  let template: TemplateId;
  if (sidebar === "left") template = "sidebar";
  else if (sidebar === "right") template = "twocolumn";
  else if (centered) template = "classic";
  else if (accentC) template = "modern";
  else template = serif ? "executive" : "minimal";

  const design: Design = {
    ...DEFAULT_DESIGN,
    ...TEMPLATE_DESIGN_DEFAULTS[template],
    template,
    font,
    fontSize,
    lineHeight,
    margin,
    accent,
    pageSize,
    targetPages: s.pageSizes.length >= 2 ? 2 : 1,
  };
  const summary = `We matched your original design: ${templateMeta(template).name} layout${gutter != null ? " (two columns)" : centered ? " (centred header)" : ""}, ${font} ${fontSize}pt, ${pageSize}${accentC ? ", your accent colour" : ""}. You can switch to any template later.`;
  return { design, summary, columns: gutter != null ? 2 : 1 };
}

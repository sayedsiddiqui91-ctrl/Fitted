import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { suite, test, expect } from "./harness";
import { applyPdfEdits } from "../src/lib/pdf/edit";
import { buildRuns } from "../src/lib/pdf/runs";
import type { PdfEdit, PdfTextRun } from "../src/lib/pdf/types";

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pdfjs(): Promise<any> {
  const lib = await import(pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);
  lib.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
  return lib;
}

async function extract(bytes: Uint8Array) {
  const lib = await pdfjs();
  const pdf = await lib.getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
  const runs: PdfTextRun[] = [];
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    await page.getOperatorList();
    const tc = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    text += " " + tc.items.map((it: any) => it.str ?? "").join(" ");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runs.push(...buildRuns(tc.items as any, i - 1, () => ({})));
  }
  return { runs, text };
}

const editFor = (r: PdfTextRun, kind: PdfEdit["kind"], text: string): PdfEdit => ({
  id: `e-${r.id}`, page: r.page, kind, runId: r.id, region: { x: r.x, y: r.y, w: r.width, fs: r.fontSize },
  text, x: r.x, y: r.y, fontSize: r.fontSize, bold: r.bold, italic: r.italic, family: r.family, color: [0, 0, 0],
});

suite("Quick PDF edit", () => {
  test("changes a phone number: new text in, old text really removed, rest untouched", async () => {
    const d = await PDFDocument.create();
    const p = d.addPage([595, 842]);
    const helv = await d.embedFont(StandardFonts.Helvetica);
    p.drawText("John Smith", { x: 50, y: 780, size: 20, font: await d.embedFont(StandardFonts.HelveticaBold) });
    p.drawText("john@gmail.com | +880 1711 000000 | Dhaka, Bangladesh", { x: 50, y: 755, size: 10, font: helv });
    p.drawText("Accountant, Company X", { x: 50, y: 720, size: 11, font: helv });
    p.drawText("2021 - Present", { x: 470, y: 720, size: 11, font: helv });
    const original = new Uint8Array(await d.save());
    const before = await extract(original);
    const contact = before.runs.find((r) => r.text.includes("+880"));
    expect(contact, "contact run should be found");
    const res = await applyPdfEdits(original, [editFor(contact, "replace", contact.text.replace("1711 000000", "1999 123456"))]);
    const after = await extract(res.bytes);
    expect(after.text.includes("1999 123456"), "new phone present");
    expect(!after.text.includes("1711 000000"), "old phone must be removed from the text layer, not just covered");
    expect(after.text.includes("John Smith") && after.text.includes("2021 - Present"), "other text intact");
    expect(res.covered === 0, "no cover fallback needed");
  });
  test("lines drawn glyph by glyph are removed completely (no stray last letter); same-line date survives", async () => {
    const d = await PDFDocument.create();
    const p = d.addPage([595, 842]);
    const bold = await d.embedFont(StandardFonts.HelveticaBold);
    const reg = await d.embedFont(StandardFonts.Helvetica);
    // Chrome/Word-style PDFs position every glyph separately — the last glyph starts right at the line's end
    const glyphs = (s: string, x: number, y: number, size: number, font: typeof reg) => {
      let cx = x;
      for (const ch of s) {
        p.drawText(ch, { x: cx, y, size, font });
        cx += font.widthOfTextAtSize(ch, size);
      }
    };
    glyphs("Sayed Hasan Siddiqui", 50, 780, 18.5, bold);
    glyphs("SMAC Advisory Ltd,", 50, 740, 10.5, bold);
    glyphs("02/2026 - Present", 470, 740, 10.5, reg);
    glyphs("Delivered strategic recommendations.", 50, 720, 10.5, reg);
    glyphs("Portfolio Optimization - Black-Litterman Model", 50, 700, 10.5, bold);
    const original = new Uint8Array(await d.save());
    const before = await extract(original);
    for (const target of ["Sayed Hasan Siddiqui", "SMAC Advisory Ltd,", "Delivered strategic recommendations.", "Portfolio Optimization - Black-Litterman Model"]) {
      const r = before.runs.find((x) => x.text === target);
      expect(r, `run “${target}” should be found`);
      const res = await applyPdfEdits(original, [editFor(r, "delete", "")]);
      const after = await extract(res.bytes);
      const left = after.runs.filter((a) => Math.abs(a.y - r.y) < 2 && a.x < r.x + r.width - 0.5).map((a) => a.text);
      expect(!left.length, `leftover after deleting “${target}”: ${JSON.stringify(left)}`);
      if (target === "SMAC Advisory Ltd,") expect(after.text.includes("02/2026 - Present"), "the date on the same line must survive");
    }
  });
  test("deletes and adds text", async () => {
    const d = await PDFDocument.create();
    const p = d.addPage([595, 842]);
    const f = await d.embedFont(StandardFonts.Helvetica);
    p.drawText("Keep this line", { x: 50, y: 700, size: 11, font: f });
    p.drawText("Remove this line", { x: 50, y: 680, size: 11, font: f });
    const original = new Uint8Array(await d.save());
    const before = await extract(original);
    const target = before.runs.find((r) => r.text === "Remove this line")!;
    const res = await applyPdfEdits(original, [editFor(target, "delete", ""), { ...editFor(target, "add", "Open to relocation"), kind: "add", region: undefined, y: 650 }]);
    const after = await extract(res.bytes);
    expect(!after.text.includes("Remove this line") && after.text.includes("Keep this line") && after.text.includes("Open to relocation"), after.text);
  });

  test("closing the gap after a deletion moves the lines below up without overlapping", async () => {
    const d = await PDFDocument.create();
    const p = d.addPage([595, 842]);
    const f = await d.embedFont(StandardFonts.Helvetica);
    const ys = [700, 680, 660, 640, 620];
    const texts = ["First line here", "Second line here", "Third line goes away", "Fourth line here", "Fifth line here"];
    texts.forEach((t, i) => p.drawText(t, { x: 50, y: ys[i], size: 11, font: f }));
    const original = new Uint8Array(await d.save());
    const before = await extract(original);
    const gone = before.runs.find((r) => r.text === "Third line goes away")!;
    const shift = 20; // one line height

    // What the "Close the gap" button builds: delete one line, move everything below it up by one line
    const edits: PdfEdit[] = [editFor(gone, "delete", "")];
    for (const r of before.runs) if (r.y < gone.y - 1) edits.push({ ...editFor(r, "replace", r.text), y: r.y + shift });
    const after = await extract((await applyPdfEdits(original, edits)).bytes);

    expect(!after.text.includes("Third line goes away"), `deleted line is still there: ${after.text}`);
    for (const t of ["First line here", "Second line here", "Fourth line here", "Fifth line here"]) {
      expect(after.text.includes(t), `“${t}” was lost: ${after.text}`);
    }
    // Every line sits on its own baseline — nothing was drawn on top of anything else
    const lines = new Map<number, string[]>();
    for (const r of after.runs) {
      const key = Math.round(r.y);
      lines.set(key, [...(lines.get(key) ?? []), r.text.trim()]);
    }
    const doubled = [...lines.entries()].filter(([, v]) => v.filter(Boolean).length > 1);
    expect(!doubled.length, `two lines ended up on the same baseline: ${JSON.stringify(doubled)}`);
    const order = [...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, v]) => v.join(""));
    expect(order.join(" | ") === "First line here | Second line here | Fourth line here | Fifth line here", `order was: ${order.join(" | ")}`);
  });
});

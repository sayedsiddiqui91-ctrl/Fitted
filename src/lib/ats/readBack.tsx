"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { CVDocument } from "@/components/cv/CVDocument";
import type { CVDoc } from "@/lib/cv/schema";
import { MM_TO_PX, PAGE_DIMENSIONS } from "@/lib/cv/meta";
import { compareReadBack, type ReadBackResult } from "@/lib/engine/atsCheck";

type DocLike = Pick<CVDoc, "content" | "layout" | "design">;

/** Lays the CV out exactly as it prints (hidden, off-screen), then reads its text the way a basic ATS does:
    line by line, top to bottom and left to right across the full page width — so two-column layouts that
    confuse simple parsers show up here too. */
export async function readCvLikeAts(doc: DocLike): Promise<string> {
  const host = document.createElement("div");
  const widthPx = PAGE_DIMENSIONS[doc.design.pageSize].widthMm * MM_TO_PX;
  Object.assign(host.style, { position: "fixed", left: "-20000px", top: "0", width: `${widthPx}px`, visibility: "hidden", pointerEvents: "none" });
  host.setAttribute("aria-hidden", "true");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<CVDocument doc={doc} interactive={false} />));
    try {
      await Promise.race([(document as Document & { fonts?: FontFaceSet }).fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
    } catch {
      /* fonts not critical for reading order */
    }

    type Word = { t: string; x: number; y: number; h: number; right: number; li: Element | null };
    const words: Word[] = [];
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      const re = /\S+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const r = range.getClientRects()[0];
        if (!r || !r.width) continue;
        words.push({ t: m[0], x: r.left, y: r.top, h: r.height, right: r.right, li: node.parentElement?.closest("li") ?? null });
      }
    }

    // Group into visual lines across the whole page width
    words.sort((a, b) => a.y - b.y || a.x - b.x);
    const lines: Word[][] = [];
    for (const w of words) {
      const line = lines[lines.length - 1];
      if (line && Math.abs(line[0].y - w.y) < Math.max(3, w.h * 0.5)) line.push(w);
      else lines.push([w]);
    }
    const seenLi = new Set<Element>();
    const out: string[] = [];
    let prevBottom: number | null = null;
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      const h = Math.max(...line.map((w) => w.h));
      if (prevBottom != null && line[0].y - prevBottom > h * 0.9) out.push("");
      let s = "";
      let lastRight: number | null = null;
      for (const w of line) {
        // List items are exported as bullet lists; mark the start of each item as ATS parsers see it
        if (w.li && !seenLi.has(w.li)) {
          seenLi.add(w.li);
          if (!s) s = "• ";
        }
        if (lastRight != null) s += w.x - lastRight > h * 1.5 ? "   " : " ";
        s += w.t;
        lastRight = w.right;
      }
      out.push(s);
      prevBottom = line[0].y + h;
    }
    return out.join("\n");
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Reads the CV like a basic ATS and checks every key detail against what the user wrote. */
export async function atsReadBack(doc: DocLike): Promise<ReadBackResult> {
  return compareReadBack(doc.content, await readCvLikeAts(doc));
}

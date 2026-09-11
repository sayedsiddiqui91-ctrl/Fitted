"use client";

import { useEffect, useRef, useState } from "react";

/** Renders the user's original PDF (all pages) so the import can be compared side by side. */
export function OriginalPdf({ bytes }: { bytes: Uint8Array }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      try {
        const { openPdf, renderPage } = await import("@/lib/pdf/load");
        const pdf = await openPdf(bytes);
        const el = host.current;
        if (!el || cancelled) return;
        el.replaceChildren();
        const width = el.clientWidth || 600;
        for (let i = 0; i < pdf.numPages && !cancelled; i++) {
          const page = await pdf.getPage(i + 1);
          const canvas = document.createElement("canvas");
          canvas.className = "mb-3 block rounded-[3px] bg-white shadow-paper ring-1 ring-black/5";
          canvas.setAttribute("aria-label", `Original page ${i + 1}`);
          el.appendChild(canvas);
          await renderPage(pdf, i, width / page.getViewport({ scale: 1 }).width, canvas);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
        }
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    };
    void draw();
    return () => {
      cancelled = true;
    };
  }, [bytes]);

  return (
    <div>
      {state === "loading" && <p className="py-10 text-center text-sm text-subtle">Loading your original…</p>}
      {state === "error" && <p className="py-10 text-center text-sm text-subtle">We couldn't display the original file.</p>}
      <div ref={host} />
    </div>
  );
}

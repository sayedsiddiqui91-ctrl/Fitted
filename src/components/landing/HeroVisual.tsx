"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Circle, ShieldCheck, XCircle } from "lucide-react";
import { sampleContent, DEFAULT_DESIGN, DEFAULT_ORDER, TEMPLATE_DESIGN_DEFAULTS } from "@/lib/cv/defaults";
import { TEMPLATE_DEFS } from "@/lib/cv/templates";
import { CVThumbnail } from "@/components/cv/CVPreview";
import { ScoreRing } from "@/components/ui/misc";
import { Reveal } from "./Reveal";

const delay = (s: number) => ({ animationDelay: `${s}s` });

/** Animated product preview built from real app components (no screenshots).
    Entrance and float effects are CSS animations, so the landing page ships no animation library. */
export function HeroVisual() {
  const doc = useMemo(() => ({ content: sampleContent(), layout: { order: DEFAULT_ORDER, hidden: [], titles: {} }, design: { ...DEFAULT_DESIGN } }), []);
  return (
    <div className="relative mx-auto h-[440px] w-full max-w-[560px] sm:h-[500px]" aria-hidden>
      <div className="anim-rise-tilt absolute left-1/2 top-2 -translate-x-[62%] overflow-hidden rounded-md shadow-paper ring-1 ring-black/5 sm:-translate-x-[70%]">
        <CVThumbnail doc={doc} width={300} />
      </div>

      {/* Score card */}
      <div className="anim-slide-x absolute right-0 top-6 w-52 rounded-2xl border border-border bg-surface/95 p-4 shadow-lg backdrop-blur sm:right-2" style={delay(0.35)}>
        <div className="anim-float">
          <p className="text-xs font-medium text-muted">Job Match Score</p>
          <div className="mt-2 flex items-center gap-3">
            <ScoreRing value={86} size={68} stroke={7} label="Job match" />
            <div className="text-xs">
              <p className="text-subtle line-through">64</p>
              <p className="font-semibold text-success">+22 after review</p>
            </div>
          </div>
        </div>
      </div>

      {/* Keywords card */}
      <div className="anim-slide-x absolute right-0 top-[188px] w-56 rounded-2xl border border-border bg-surface/95 p-4 shadow-lg backdrop-blur sm:right-6" style={delay(0.55)}>
        <p className="mb-2 text-xs font-medium text-muted">Keyword insights</p>
        {[
          { icon: CheckCircle2, c: "text-success", t: "Financial analysis" },
          { icon: CheckCircle2, c: "text-success", t: "Advanced Excel" },
          { icon: Circle, c: "text-warning", t: "Forecasting — ask first" },
          { icon: XCircle, c: "text-danger", t: "Power BI — not added" },
        ].map((k, i) => (
          <p key={k.t} className="anim-slide-x flex items-center gap-2 py-0.5 text-[13px]" style={delay(0.8 + i * 0.12)}>
            <k.icon className={`size-3.5 ${k.c}`} /> {k.t}
          </p>
        ))}
      </div>

      {/* Before / after */}
      <div className="anim-rise absolute bottom-0 left-0 right-6 rounded-2xl border border-border bg-surface/95 p-4 shadow-lg backdrop-blur sm:left-4 sm:right-16" style={delay(0.8)}>
        <div className="anim-float" style={delay(1)}>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-success">
            <ShieldCheck className="size-3.5" /> FACT · based on your CV
          </div>
          <p className="text-[13px] text-subtle line-through decoration-danger/50">Responsible for invoice processing and vendor payments for 120+ suppliers.</p>
          <p className="mt-1 text-[13px] font-medium">
            <span className="rounded bg-success-soft px-0.5 text-success">Managed</span> invoice processing and vendor payments for 120+ suppliers.
          </p>
        </div>
      </div>
    </div>
  );
}

/* Each thumbnail is a whole CV laid out in the DOM. Rendering all eighteen at once cost a phone about a
   second of layout for a strip that is mostly off-screen, so one is built when it comes near the viewport. */
function LazyThumb({ children, width, height }: { children: () => ReactNode; width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    // Never leave an empty box behind if the observer doesn't fire
    const failsafe = window.setTimeout(() => setShow(true), 2500);
    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, [show]);
  return (
    <div ref={ref} style={{ width, height }} className="bg-surface-2">
      {show ? children() : null}
    </div>
  );
}

export function TemplateStrip() {
  const content = useMemo(() => sampleContent(), []);
  const layout = { order: ["summary", "experience", "education", "skills", "certifications", "languages"], hidden: [], titles: {} };
  const width = 180;
  const height = Math.round(width * 1.414);
  return (
    <div className="scroll-thin -mx-4 flex snap-x gap-5 overflow-x-auto px-4 pb-4 sm:mx-0">
      {TEMPLATE_DEFS.map((t, i) => (
        <Reveal key={t.id} delay={Math.min(i, 6) * 0.06} className="shrink-0 snap-start">
          <div className="overflow-hidden rounded-md shadow-md ring-1 ring-black/5 transition-transform duration-300 hover:-translate-y-1.5">
            <LazyThumb width={width} height={height}>
              {() => <CVThumbnail doc={{ content, layout, design: { ...DEFAULT_DESIGN, ...TEMPLATE_DESIGN_DEFAULTS[t.id], template: t.id } }} width={width} />}
            </LazyThumb>
          </div>
          <p className="mt-3 text-center text-sm font-medium">{t.name}</p>
          <p className="text-center text-xs text-subtle">{t.atsFriendly ? "ATS-friendly" : "Visual"}</p>
        </Reveal>
      ))}
    </div>
  );
}

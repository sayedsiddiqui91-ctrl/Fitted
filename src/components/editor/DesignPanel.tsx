"use client";

import { memo, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import type { CVContent, CVDoc, Layout, TemplateId } from "@/lib/cv/schema";
import { ACCENT_SWATCHES, CV_FONTS, TEMPLATES } from "@/lib/cv/meta";
import { TEMPLATE_CATEGORIES } from "@/lib/cv/templates";
import { DEFAULT_DESIGN, TEMPLATE_DESIGN_DEFAULTS } from "@/lib/cv/defaults";
import { cn } from "@/lib/utils";
import { CVThumbnail } from "@/components/cv/CVPreview";
import { Range, Select } from "@/components/ui/Field";
import { Badge, Segmented } from "@/components/ui/misc";
import { Button } from "@/components/ui/Button";
import type { Update } from "./SectionEditors";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h3 className="mb-3.5 text-[13px] font-semibold uppercase tracking-wide text-subtle">{title}</h3>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Thumbnail of the user's own CV in a template's default look. Re-renders only when content changes. */
const TemplateThumb = memo(function TemplateThumb({ id, content, layout, pageSize }: { id: TemplateId; content: CVContent; layout: Layout; pageSize: CVDoc["design"]["pageSize"] }) {
  return <CVThumbnail doc={{ content, layout, design: { ...DEFAULT_DESIGN, ...TEMPLATE_DESIGN_DEFAULTS[id], template: id, pageSize } }} width={104} />;
});

type Filter = "all" | "ats" | (typeof TEMPLATE_CATEGORIES)[number];

export function DesignPanel({ doc, update }: { doc: CVDoc; update: Update }) {
  const d = doc.design;
  const [filter, setFilter] = useState<Filter>("all");
  const set = (patch: Partial<CVDoc["design"]>) => update((x) => void Object.assign(x.design, patch));
  const pickTemplate = (t: TemplateId) => set({ ...TEMPLATE_DESIGN_DEFAULTS[t], template: t });
  const list = TEMPLATES.filter((t) => filter === "all" || (filter === "ats" ? t.atsFriendly : t.category === filter));

  return (
    <div className="flex flex-col gap-3">
      <Group title={`Template · ${TEMPLATES.length}`}>
        <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter templates">
          {(["all", "ats", ...TEMPLATE_CATEGORIES.filter((c) => c !== "ATS")] as Filter[]).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn("h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors", filter === f ? "border-fg bg-fg text-bg" : "border-border bg-surface text-muted hover:text-fg")}
            >
              {f === "all" ? "All" : f === "ats" ? "ATS-friendly" : f}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {list.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pickTemplate(t.id)}
              aria-pressed={d.template === t.id}
              title={`${t.name} — ${t.description}`}
              className={cn("rounded-xl border p-1.5 text-left transition-[border-color,box-shadow]", d.template === t.id ? "border-accent ring-3 ring-accent/15" : "border-border hover:border-border-strong")}
            >
              <div className="flex justify-center overflow-hidden rounded-lg bg-surface-2 p-1.5">
                <div className="ring-1 ring-black/5">
                  <TemplateThumb id={t.id} content={doc.content} layout={doc.layout} pageSize={d.pageSize} />
                </div>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-1 px-1">
                <span className="truncate text-[13px] font-medium">{t.name}</span>
                {d.template === t.id && <Check className="size-3.5 shrink-0 text-accent" aria-hidden />}
              </div>
              <div className="px-1 pb-0.5 pt-1">{t.atsFriendly ? <Badge tone="success">ATS-friendly</Badge> : <Badge>Visual</Badge>}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-subtle">Switching templates only changes the look — your content stays exactly the same. {TEMPLATES.find((t) => t.id === d.template)?.bestFor ? `Best for: ${TEMPLATES.find((t) => t.id === d.template)!.bestFor}.` : ""}</p>
      </Group>

      <Group title="Page">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-muted">Paper size</span>
          <Segmented label="Paper size" value={d.pageSize} onChange={(v) => set({ pageSize: v })} options={[{ value: "A4", label: "A4" }, { value: "Letter", label: "US Letter" }]} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-muted">Target length</span>
          <Segmented label="Target length" value={String(d.targetPages) as "1" | "2"} onChange={(v) => set({ targetPages: v === "1" ? 1 : 2 })} options={[{ value: "1", label: "1 page" }, { value: "2", label: "2 pages" }]} />
        </div>
        <Range label="Margins" value={d.margin} min={8} max={25} step={1} onChange={(v) => set({ margin: v })} format={(v) => `${v} mm`} />
      </Group>

      <Group title="Typography">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="font-select" className="text-[13px] font-medium text-muted">
            Font
          </label>
          <Select id="font-select" value={d.font} onChange={(e) => set({ font: e.target.value })}>
            <optgroup label="Sans-serif">
              {CV_FONTS.filter((f) => f.kind === "sans").map((f) => (
                <option key={f.name}>{f.name}</option>
              ))}
            </optgroup>
            <optgroup label="Serif">
              {CV_FONTS.filter((f) => f.kind === "serif").map((f) => (
                <option key={f.name}>{f.name}</option>
              ))}
            </optgroup>
          </Select>
        </div>
        <Range label="Font size" value={d.fontSize} min={8.5} max={12} step={0.5} onChange={(v) => set({ fontSize: v })} format={(v) => `${v} pt`} />
        <Range label="Heading size" value={d.headingScale} min={0.85} max={1.3} step={0.05} onChange={(v) => set({ headingScale: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <Range label="Line spacing" value={d.lineHeight} min={1.15} max={1.7} step={0.05} onChange={(v) => set({ lineHeight: v })} format={(v) => v.toFixed(2)} />
        <Range label="Section spacing" value={d.sectionSpacing} min={0.6} max={1.6} step={0.1} onChange={(v) => set({ sectionSpacing: v })} format={(v) => `${Math.round(v * 100)}%`} />
      </Group>

      <Group title="Accent color">
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent color">
          {ACCENT_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={d.accent.toLowerCase() === c}
              aria-label={`Accent ${c}`}
              onClick={() => set({ accent: c })}
              className={cn("flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-shadow", d.accent.toLowerCase() === c && "ring-2 ring-fg")}
              style={{ background: c }}
            >
              {d.accent.toLowerCase() === c && <Check className="size-4 text-white" aria-hidden />}
            </button>
          ))}
          <label className="relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]" title="Custom color">
            <span className="sr-only">Custom accent color</span>
            <input type="color" value={d.accent} onChange={(e) => set({ accent: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
      </Group>

      <Button variant="ghost" className="self-start" icon={<RotateCcw className="size-4" />} onClick={() => set({ ...DEFAULT_DESIGN, ...TEMPLATE_DESIGN_DEFAULTS[d.template], template: d.template, pageSize: d.pageSize, targetPages: d.targetPages })}>
        Reset to template defaults
      </Button>
    </div>
  );
}

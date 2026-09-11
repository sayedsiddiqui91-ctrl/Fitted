"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Eye, FileText, ListTree, Palette, PenLine } from "lucide-react";
import type { CVContent, CVDoc, Design, Layout, TemplateId } from "@/lib/cv/schema";
import { DEFAULT_DESIGN, newCV, TEMPLATE_DESIGN_DEFAULTS } from "@/lib/cv/defaults";
import { TEMPLATES } from "@/lib/cv/meta";
import { parseResumeText, type ParsedSection, type SectionKind } from "@/lib/engine/parseResume";
import { clone, cn } from "@/lib/utils";
import type { AssistantSelection } from "@/lib/ai/types";
import { ContentPanel } from "@/components/editor/ContentPanel";
import { AssistantSheet } from "@/components/editor/AssistantSheet";
import type { AskTarget } from "@/components/editor/SectionEditors";
import { CVPreview } from "@/components/cv/CVPreview";
import { OriginalPdf } from "@/components/app/OriginalPdf";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/misc";

const KIND_OPTIONS: { value: SectionKind; label: string }[] = [
  { value: "custom", label: "Keep as its own section" },
  { value: "summary", label: "Summary" },
  { value: "experience", label: "Work experience" },
  { value: "volunteer", label: "Volunteer / leadership" },
  { value: "projects", label: "Projects" },
  { value: "education", label: "Education" },
  { value: "skills", label: "Skills" },
  { value: "certifications", label: "Certifications / training" },
  { value: "awards", label: "Awards" },
  { value: "languages", label: "Languages" },
];

/** Review step after importing (file, pasted text or PDF): fix extraction mistakes BEFORE saving.
    Keeps the original's section order/titles and (for PDFs) its matched design; the user can compare
    with the original file and correct how a section was read. */
export function ImportReview({
  initial,
  initialLayout,
  initialDesign,
  designNote,
  sourceText,
  sections: initialSections,
  originalPdf,
  warnings,
  defaultName,
  source,
  onSave,
  onCancel,
}: {
  initial: CVContent;
  initialLayout?: Layout;
  initialDesign?: Design;
  designNote?: string | null;
  /** Text the CV was parsed from — lets the user re-read a section as another type */
  sourceText?: string;
  sections?: ParsedSection[];
  /** The original PDF, for side-by-side comparison */
  originalPdf?: Uint8Array;
  warnings: string[];
  defaultName: string;
  source: string;
  onSave: (doc: Pick<CVDoc, "content" | "layout" | "design" | "name">) => void;
  onCancel: () => void;
}) {
  const [doc, setDoc] = useState<CVDoc>(() =>
    newCV({ name: defaultName, content: clone(initial), ...(initialLayout ? { layout: clone(initialLayout) } : {}), ...(initialDesign ? { design: { ...initialDesign } } : {}) }),
  );
  const [choice, setChoice] = useState<string>(initialDesign ? "original" : doc.design.template);
  const [view, setView] = useState<"edit" | "preview" | "original">("edit");
  const [side, setSide] = useState<"fitted" | "original">("fitted");
  const [sections, setSections] = useState<ParsedSection[]>(initialSections ?? []);
  const [overrides, setOverrides] = useState<Record<string, SectionKind>>({});
  const [original] = useState(() => (originalPdf ? originalPdf.slice() : null));
  // Assistant: "Improve with assistant" opens it pointed at that section/bullet (same as the main editor)
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [selection, setSelection] = useState<AssistantSelection>({ scope: "global", label: "Whole CV" });
  const ask = useCallback((t: AskTarget) => {
    setSelection(t.bulletId ? { scope: "bullet", section: t.section, itemId: t.itemId, bulletId: t.bulletId, label: t.label } : { scope: "section", section: t.section, label: t.label });
    setAssistantOpen(true);
  }, []);

  const update = useCallback((recipe: (d: CVDoc) => void) => {
    setDoc((prev) => {
      const next = clone(prev);
      recipe(next);
      return next;
    });
  }, []);
  const pickDesign = (v: string) => {
    setChoice(v);
    setDoc((d) => ({
      ...d,
      design: v === "original" && initialDesign ? { ...initialDesign } : { ...DEFAULT_DESIGN, ...TEMPLATE_DESIGN_DEFAULTS[v as TemplateId], template: v as TemplateId },
    }));
  };
  const retype = (title: string, kind: SectionKind) => {
    if (!sourceText) return;
    const next = { ...overrides, [title.toLowerCase()]: kind };
    setOverrides(next);
    const r = parseResumeText(sourceText, { kindOverrides: next });
    setDoc((d) => ({ ...d, content: r.content, layout: r.layout ?? d.layout }));
    setSections(r.sections ?? []);
    toast.success(`“${title}” is now read as ${KIND_OPTIONS.find((o) => o.value === kind)?.label.toLowerCase()}`, { description: "Your CV was re-read from the original; check the section below." });
  };

  const c = doc.content;
  const found = [
    c.experience.length && `${c.experience.length} position${c.experience.length === 1 ? "" : "s"}`,
    c.education.length && `${c.education.length} education`,
    c.skills.length && `${c.skills.length} skills`,
    c.projects.length && `${c.projects.length} projects`,
    c.certifications.length && `${c.certifications.length} certifications`,
    c.awards.length && `${c.awards.length} awards`,
    c.volunteer.length && `${c.volunteer.length} volunteer`,
    c.languages.length && `${c.languages.length} languages`,
    c.custom.length && `${c.custom.length} other section${c.custom.length === 1 ? "" : "s"}`,
  ].filter(Boolean);
  const retypable = sourceText ? sections.filter((s) => s.title && s.title !== "Additional Information") : [];

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
        <div className="min-w-0 max-w-2xl">
          <p className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <CheckCircle2 className="size-5 text-success" aria-hidden /> We imported your CV
          </p>
          <p className="mt-1 text-sm text-muted">
            Check that everything looks correct — extraction from {source} is never perfect. {original ? "Compare with your original on the right, then fix anything before saving." : "Fix anything below before saving."}
          </p>
          {found.length > 0 && <p className="mt-2 text-xs text-subtle">Found: {found.join(" · ")}</p>}
          {designNote && choice === "original" && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-accent-soft/60 px-3 py-2 text-[13px] text-accent-soft-fg">
              <Palette className="mt-0.5 size-3.5 shrink-0" aria-hidden /> <span>{designNote}</span>
            </p>
          )}
          {warnings.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px] text-muted">
              {warnings.map((w) => (
                <li key={w} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden /> {w}
                </li>
              ))}
            </ul>
          )}
          {retypable.length > 0 && (
            <details className="mt-3 rounded-xl border border-border bg-surface-2/60 px-3 py-2.5 text-[13px]">
              <summary className="flex cursor-pointer items-center gap-2 font-medium">
                <ListTree className="size-3.5 text-muted" aria-hidden /> Sections we found ({retypable.length}) — was one read as the wrong type?
              </summary>
              <p className="mt-2 text-muted">Change a section's type and we'll re-read it from your original. (Edits made below are replaced.)</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {retypable.map((s) => (
                  <li key={`${s.title}-${s.kind}`} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{s.title}</span>
                    <Select aria-label={`Read “${s.title}” as`} value={s.kind} onChange={(e) => retype(s.title, e.target.value as SectionKind)} className="h-9 w-56 text-[13px] sm:h-9">
                      {KIND_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-72">
          <Field label="CV name">{(p) => <Input {...p} value={doc.name} onChange={(e) => setDoc((d) => ({ ...d, name: e.target.value }))} maxLength={80} />}</Field>
          <Field label="Design">
            {(p) => (
              <Select {...p} value={choice} onChange={(e) => pickDesign(e.target.value)}>
                {initialDesign && <option value="original">Match my original CV</option>}
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.atsFriendly ? "" : " (visual)"}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Start over
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => onSave({ content: doc.content, layout: doc.layout, design: doc.design, name: doc.name.trim() || defaultName })}>
              Save CV
            </Button>
          </div>
        </div>
      </div>

      <Segmented
        label="Review view"
        value={view}
        onChange={setView}
        className="mb-3 w-full lg:hidden"
        options={[
          { value: "edit", label: "Review", icon: <PenLine className="size-3.5" aria-hidden /> },
          { value: "preview", label: "Preview", icon: <Eye className="size-3.5" aria-hidden /> },
          ...(original ? [{ value: "original" as const, label: "Original", icon: <FileText className="size-3.5" aria-hidden /> }] : []),
        ]}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(380px,1fr)_minmax(0,1fr)]">
        <div className={cn(view === "edit" ? "block" : "hidden", "min-w-0 lg:block")}>
          <ContentPanel doc={doc} update={update} onAsk={ask} onFocusTarget={setSelection} defaultOpen={["personal", "summary", "experience", "education", "skills"]} />
        </div>
        <div className={cn(view === "edit" ? "hidden" : "block", "min-w-0 lg:block")}>
          <div className="rounded-2xl bg-surface-2/70 p-3 lg:sticky lg:top-4">
            {original && (
              <Segmented
                label="Compare"
                value={side}
                onChange={setSide}
                className="mb-3 hidden w-full lg:flex"
                options={[
                  { value: "fitted", label: "Imported CV", icon: <Eye className="size-3.5" aria-hidden /> },
                  { value: "original", label: "Your original", icon: <FileText className="size-3.5" aria-hidden /> },
                ]}
              />
            )}
            {original && (view === "original" || side === "original") ? (
              <div className={cn(view === "original" ? "block" : "hidden", side === "original" ? "lg:block" : "lg:hidden")}>
                <OriginalPdf bytes={original} />
              </div>
            ) : null}
            <div className={cn(original && (view === "original" || side === "original") ? cn(view === "original" ? "hidden" : "block", side === "original" ? "lg:hidden" : "lg:block") : "block")}>
              <CVPreview doc={doc} maxScale={0.95} />
            </div>
          </div>
        </div>
      </div>
      <AssistantSheet open={assistantOpen} onOpenChange={setAssistantOpen} doc={doc} update={update} selection={selection} setSelection={setSelection} job={null} />
    </div>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { Plus, Sparkles, Tags, X } from "lucide-react";
import type { Bullet, CVDoc, Skill } from "@/lib/cv/schema";
import type { AssistantSelection } from "@/lib/ai/types";
import {
  newAward,
  newCertification,
  newCustomItem,
  newEducation,
  newExperience,
  newLanguage,
  newProject,
  newSkill,
  newVolunteer,
} from "@/lib/cv/defaults";
import { formatRange } from "@/lib/cv/dates";
import { uid } from "@/lib/utils";
import { wordCount } from "@/lib/engine/text";
import { BUZZWORDS } from "@/lib/engine/verbs";
import { Field, Input, Switch, Textarea } from "@/components/ui/Field";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/misc";
import { BulletsEditor } from "./BulletsEditor";
import { ItemCard } from "./ItemCard";
import { DragHandle, move, SortableList } from "./Sortable";

export type Update = (recipe: (d: CVDoc) => void) => void;
export type AskTarget = { label: string; text: string; section: string; itemId?: string; bulletId?: string };
export interface EditorProps {
  doc: CVDoc;
  update: Update;
  onAsk?: (t: AskTarget) => void;
  /** Reports what the user is editing so assistant requests like "make this stronger" have context */
  onFocusTarget?: (s: AssistantSelection) => void;
}

const entryLabel = (a?: string, b?: string) => [a, b].filter(Boolean).join(" · ");

/* ───────── Generic list section ───────── */
function ListSection<T extends { id: string }>({
  items,
  set,
  factory,
  addLabel,
  empty,
  emptyIcon,
  title,
  subtitle,
  placeholder,
  onFocusItem,
  children,
}: {
  items: T[];
  set: (next: T[]) => void;
  factory: () => T;
  addLabel: string;
  empty: string;
  emptyIcon: ReactNode;
  title: (t: T) => string;
  subtitle?: (t: T) => string;
  placeholder: string;
  onFocusItem?: (t: T) => void;
  children: (item: T, patch: (p: Partial<T>) => void) => ReactNode;
}) {
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const add = () => {
    const it = factory();
    set([...items, it]);
    setJustAdded(it.id);
  };
  if (!items.length)
    return (
      <EmptyState
        className="py-8"
        icon={emptyIcon}
        title={empty}
        action={
          <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={add}>
            {addLabel}
          </Button>
        }
      />
    );
  return (
    <div className="flex flex-col gap-2">
      <SortableList items={items} onReorder={set}>
        {(item, handle, i) => (
          <ItemCard
            title={title(item)}
            subtitle={subtitle?.(item)}
            placeholder={placeholder}
            handle={handle}
            defaultOpen={item.id === justAdded || items.length === 1}
            onDuplicate={() => {
              const copy = JSON.parse(JSON.stringify(item)) as T & { bullets?: Bullet[] };
              copy.id = uid("dup");
              if (copy.bullets) copy.bullets = copy.bullets.map((b) => ({ ...b, id: uid("b") }));
              const next = [...items];
              next.splice(i + 1, 0, copy);
              set(next);
            }}
            onDelete={() => set(items.filter((x) => x.id !== item.id))}
            onMoveUp={i > 0 ? () => set(move(items, i, i - 1)) : undefined}
            onMoveDown={i < items.length - 1 ? () => set(move(items, i, i + 1)) : undefined}
          >
            {/* focus capture fires before a bullet's own onFocus, so a focused bullet wins over its entry */}
            <div onFocusCapture={() => onFocusItem?.(item)}>{children(item, (p) => set(items.map((x) => (x.id === item.id ? { ...x, ...p } : x))))}</div>
          </ItemCard>
        )}
      </SortableList>
      <Button size="sm" variant="ghost" className="self-start text-accent hover:text-accent" icon={<Plus className="size-4" />} onClick={add}>
        {addLabel}
      </Button>
    </div>
  );
}

const grid2 = "grid grid-cols-1 gap-3 sm:grid-cols-2";

function TextField({ label, value, onChange, placeholder, type = "text", autoComplete, optional, className }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; autoComplete?: string; optional?: boolean; className?: string }) {
  return (
    <Field label={label} optional={optional} className={className}>
      {(p) => <Input {...p} type={type} autoComplete={autoComplete} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

function Dates({ start, end, current, onChange, currentLabel = "I currently work here" }: { start: string; end: string; current?: boolean; onChange: (p: { startDate?: string; endDate?: string; current?: boolean }) => void; currentLabel?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className={grid2}>
        <TextField label="Start date" value={start} placeholder="e.g. Mar 2022" onChange={(v) => onChange({ startDate: v })} />
        {current ? (
          <Field label="End date">{(p) => <Input {...p} value="Present" disabled readOnly />}</Field>
        ) : (
          <TextField label="End date" value={end} placeholder="e.g. Jun 2024" onChange={(v) => onChange({ endDate: v })} />
        )}
      </div>
      {current !== undefined && (
        <label className="inline-flex cursor-pointer items-center gap-2 self-start text-sm text-muted">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={current} onChange={(e) => onChange({ current: e.target.checked })} />
          {currentLabel}
        </label>
      )}
    </div>
  );
}

/* ───────── Personal ───────── */
export function PersonalEditor({ doc, update }: EditorProps) {
  const p = doc.content.personal;
  const set = (patch: Partial<typeof p>) => update((d) => void Object.assign(d.content.personal, patch));
  return (
    <div className="flex flex-col gap-3">
      <div className={grid2}>
        <TextField label="Full name" value={p.fullName} onChange={(v) => set({ fullName: v })} autoComplete="name" placeholder="Jordan Lee" />
        <TextField label="Professional title" value={p.headline} onChange={(v) => set({ headline: v })} autoComplete="organization-title" placeholder="Finance Analyst" />
        <TextField label="Email" type="email" value={p.email} onChange={(v) => set({ email: v })} autoComplete="email" placeholder="you@email.com" />
        <TextField label="Phone" type="tel" value={p.phone} onChange={(v) => set({ phone: v })} autoComplete="tel" placeholder="+1 555 000 0000" />
        <TextField label="Location" value={p.location} onChange={(v) => set({ location: v })} autoComplete="address-level2" placeholder="City, Country" />
        <TextField label="LinkedIn" value={p.linkedin} onChange={(v) => set({ linkedin: v })} placeholder="linkedin.com/in/you" optional />
        <TextField label="Website / portfolio" value={p.website} onChange={(v) => set({ website: v })} autoComplete="url" placeholder="yoursite.com" optional className="sm:col-span-2" />
      </div>
      {p.links.map((l) => (
        <div key={l.id} className="flex items-end gap-2">
          <TextField label="Link label" value={l.label} onChange={(v) => update((d) => void (d.content.personal.links.find((x) => x.id === l.id)!.label = v))} placeholder="GitHub" className="w-32 shrink-0" />
          <TextField label="URL" value={l.url} onChange={(v) => update((d) => void (d.content.personal.links.find((x) => x.id === l.id)!.url = v))} placeholder="github.com/you" className="flex-1" />
          <IconButton label="Remove link" onClick={() => update((d) => void (d.content.personal.links = d.content.personal.links.filter((x) => x.id !== l.id)))}>
            <X className="size-4" />
          </IconButton>
        </div>
      ))}
      <Button size="sm" variant="ghost" className="self-start text-accent hover:text-accent" icon={<Plus className="size-4" />} onClick={() => update((d) => void d.content.personal.links.push({ id: uid("lnk"), label: "", url: "" }))}>
        Add link
      </Button>
      <p className="text-xs text-subtle">Only include what's needed. A city and country is enough — no full address, photo or date of birth required.</p>
    </div>
  );
}

/* ───────── Summary ───────── */
export function SummaryEditor({ doc, update, onAsk, onFocusTarget }: EditorProps) {
  const s = doc.content.summary;
  const wc = wordCount(s);
  const buzz = BUZZWORDS.filter((b) => s.toLowerCase().includes(b));
  return (
    <div className="flex flex-col gap-2">
      <Field label="Professional summary" hint={`${wc} words · aim for 30–70. Who you are, your core skills, and one real achievement.`}>
        {(p) => (
          <Textarea
            {...p}
            rows={4}
            value={s}
            onFocus={() => onFocusTarget?.({ scope: "section", section: "summary", label: "Summary" })}
            onChange={(e) => update((d) => void (d.content.summary = e.target.value))}
            placeholder="Finance analyst with 3 years of experience in accounts payable and reporting…"
          />
        )}
      </Field>
      {buzz.length > 0 && <p className="text-xs text-warning">Consider replacing generic words: {buzz.map((b) => `“${b}”`).join(", ")}</p>}
      {onAsk && s.trim().length > 10 && (
        <Button size="sm" variant="ghost" className="self-start text-accent hover:text-accent" icon={<Sparkles className="size-4" />} onClick={() => onAsk({ label: "Summary", text: s, section: "summary" })}>
          Improve with assistant
        </Button>
      )}
    </div>
  );
}

/* ───────── Experience & Volunteer ───────── */
export function ExperienceEditor({ doc, update, onAsk, onFocusTarget }: EditorProps) {
  return (
    <ListSection
      items={doc.content.experience}
      set={(next) => update((d) => void (d.content.experience = next))}
      onFocusItem={(e) => onFocusTarget?.({ scope: "entry", section: "experience", itemId: e.id, label: entryLabel(e.role, e.company) || "Position" })}
      factory={newExperience}
      addLabel="Add position"
      empty="Add your first position"
      emptyIcon={<Plus />}
      placeholder="New position"
      title={(e) => [e.role, e.company].filter(Boolean).join(" · ")}
      subtitle={(e) => formatRange(e.startDate, e.endDate, e.current)}
    >
      {(e, patch) => (
        <div className="flex flex-col gap-3">
          <div className={grid2}>
            <TextField label="Job title" value={e.role} onChange={(v) => patch({ role: v })} placeholder="Finance Analyst" />
            <TextField label="Company" value={e.company} onChange={(v) => patch({ company: v })} placeholder="Company name" />
            <TextField label="Location" value={e.location} onChange={(v) => patch({ location: v })} placeholder="City or Remote" optional className="sm:col-span-2" />
          </div>
          <Dates start={e.startDate} end={e.endDate} current={e.current} onChange={(p) => patch(p)} />
          <BulletsEditor
            bullets={e.bullets}
            onChange={(b) => patch({ bullets: b })}
            onFocusBullet={(b, i) => onFocusTarget?.({ scope: "bullet", section: "experience", itemId: e.id, bulletId: b.id, label: `${entryLabel(e.role, e.company) || "Position"} — bullet ${i + 1}` })}
            onAsk={onAsk && ((b) => onAsk({ label: `${entryLabel(e.role, e.company) || "Position"} — bullet ${e.bullets.indexOf(b) + 1}`, text: b.text, section: "experience", itemId: e.id, bulletId: b.id }))}
          />
        </div>
      )}
    </ListSection>
  );
}

export function VolunteerEditor({ doc, update, onAsk, onFocusTarget }: EditorProps) {
  return (
    <ListSection
      items={doc.content.volunteer}
      set={(next) => update((d) => void (d.content.volunteer = next))}
      onFocusItem={(e) => onFocusTarget?.({ scope: "entry", section: "volunteer", itemId: e.id, label: entryLabel(e.role, e.organization) || "Volunteer role" })}
      factory={newVolunteer}
      addLabel="Add volunteer role"
      empty="Add volunteer experience"
      emptyIcon={<Plus />}
      placeholder="New volunteer role"
      title={(e) => [e.role, e.organization].filter(Boolean).join(" · ")}
      subtitle={(e) => formatRange(e.startDate, e.endDate, e.current)}
    >
      {(e, patch) => (
        <div className="flex flex-col gap-3">
          <div className={grid2}>
            <TextField label="Role" value={e.role} onChange={(v) => patch({ role: v })} />
            <TextField label="Organization" value={e.organization} onChange={(v) => patch({ organization: v })} />
            <TextField label="Location" value={e.location} onChange={(v) => patch({ location: v })} optional className="sm:col-span-2" />
          </div>
          <Dates start={e.startDate} end={e.endDate} current={e.current} onChange={(p) => patch(p)} currentLabel="I currently volunteer here" />
          <BulletsEditor
            bullets={e.bullets}
            onChange={(b) => patch({ bullets: b })}
            onFocusBullet={(b, i) => onFocusTarget?.({ scope: "bullet", section: "volunteer", itemId: e.id, bulletId: b.id, label: `${entryLabel(e.role, e.organization) || "Volunteer role"} — bullet ${i + 1}` })}
            onAsk={onAsk && ((b) => onAsk({ label: `${entryLabel(e.role, e.organization) || "Volunteer role"} — bullet ${e.bullets.indexOf(b) + 1}`, text: b.text, section: "volunteer", itemId: e.id, bulletId: b.id }))}
          />
        </div>
      )}
    </ListSection>
  );
}

/* ───────── Education ───────── */
export function EducationEditor({ doc, update }: EditorProps) {
  return (
    <ListSection
      items={doc.content.education}
      set={(next) => update((d) => void (d.content.education = next))}
      factory={newEducation}
      addLabel="Add education"
      empty="Add your school or degree"
      emptyIcon={<Plus />}
      placeholder="New education"
      title={(e) => [e.degree, e.school].filter(Boolean).join(" · ")}
      subtitle={(e) => formatRange(e.startDate, e.endDate)}
    >
      {(e, patch) => (
        <div className="flex flex-col gap-3">
          <div className={grid2}>
            <TextField label="Degree" value={e.degree} onChange={(v) => patch({ degree: v })} placeholder="Bachelor of Science" />
            <TextField label="Field of study" value={e.field} onChange={(v) => patch({ field: v })} placeholder="Finance" optional />
            <TextField label="School" value={e.school} onChange={(v) => patch({ school: v })} placeholder="University name" />
            <TextField label="Location" value={e.location} onChange={(v) => patch({ location: v })} optional />
            <TextField label="Start" value={e.startDate} onChange={(v) => patch({ startDate: v })} placeholder="2016" />
            <TextField label="End (or expected)" value={e.endDate} onChange={(v) => patch({ endDate: v })} placeholder="2020" />
            <TextField label="Grade / GPA / honors" value={e.grade} onChange={(v) => patch({ grade: v })} optional className="sm:col-span-2" />
          </div>
          <BulletsEditor label="Details (coursework, thesis, activities)" placeholder="Relevant coursework: Corporate Finance, Statistics" bullets={e.bullets} onChange={(b) => patch({ bullets: b })} />
        </div>
      )}
    </ListSection>
  );
}

/* ───────── Projects ───────── */
export function ProjectsEditor({ doc, update, onAsk, onFocusTarget }: EditorProps) {
  return (
    <ListSection
      items={doc.content.projects}
      set={(next) => update((d) => void (d.content.projects = next))}
      onFocusItem={(p) => onFocusTarget?.({ scope: "entry", section: "projects", itemId: p.id, label: p.name || "Project" })}
      factory={newProject}
      addLabel="Add project"
      empty="Add a project you're proud of"
      emptyIcon={<Plus />}
      placeholder="New project"
      title={(p) => p.name}
      subtitle={(p) => [p.role, formatRange(p.startDate, p.endDate)].filter(Boolean).join(" · ")}
    >
      {(p, patch) => (
        <div className="flex flex-col gap-3">
          <div className={grid2}>
            <TextField label="Project name" value={p.name} onChange={(v) => patch({ name: v })} />
            <TextField label="Your role" value={p.role} onChange={(v) => patch({ role: v })} optional />
            <TextField label="Link" value={p.link} onChange={(v) => patch({ link: v })} optional className="sm:col-span-2" />
            <TextField label="Start" value={p.startDate} onChange={(v) => patch({ startDate: v })} optional />
            <TextField label="End" value={p.endDate} onChange={(v) => patch({ endDate: v })} optional />
          </div>
          <BulletsEditor
            bullets={p.bullets}
            onChange={(b) => patch({ bullets: b })}
            onFocusBullet={(b, i) => onFocusTarget?.({ scope: "bullet", section: "projects", itemId: p.id, bulletId: b.id, label: `${p.name || "Project"} — bullet ${i + 1}` })}
            onAsk={onAsk && ((b) => onAsk({ label: `${p.name || "Project"} — bullet ${p.bullets.indexOf(b) + 1}`, text: b.text, section: "projects", itemId: p.id, bulletId: b.id }))}
          />
        </div>
      )}
    </ListSection>
  );
}

/* ───────── Certifications / Awards ───────── */
export function CertificationsEditor({ doc, update }: EditorProps) {
  return (
    <ListSection
      items={doc.content.certifications}
      set={(next) => update((d) => void (d.content.certifications = next))}
      factory={newCertification}
      addLabel="Add certification"
      empty="Add a certification or license"
      emptyIcon={<Plus />}
      placeholder="New certification"
      title={(c) => c.name}
      subtitle={(c) => [c.issuer, c.date].filter(Boolean).join(" · ")}
    >
      {(c, patch) => (
        <div className={grid2}>
          <TextField label="Name" value={c.name} onChange={(v) => patch({ name: v })} className="sm:col-span-2" />
          <TextField label="Issuer" value={c.issuer} onChange={(v) => patch({ issuer: v })} optional />
          <TextField label="Date" value={c.date} onChange={(v) => patch({ date: v })} optional />
          <TextField label="Credential link" value={c.link} onChange={(v) => patch({ link: v })} optional className="sm:col-span-2" />
        </div>
      )}
    </ListSection>
  );
}

export function AwardsEditor({ doc, update }: EditorProps) {
  return (
    <ListSection
      items={doc.content.awards}
      set={(next) => update((d) => void (d.content.awards = next))}
      factory={newAward}
      addLabel="Add award"
      empty="Add an award or honor"
      emptyIcon={<Plus />}
      placeholder="New award"
      title={(a) => a.title}
      subtitle={(a) => [a.issuer, a.date].filter(Boolean).join(" · ")}
    >
      {(a, patch) => (
        <div className="flex flex-col gap-3">
          <div className={grid2}>
            <TextField label="Title" value={a.title} onChange={(v) => patch({ title: v })} className="sm:col-span-2" />
            <TextField label="Issuer" value={a.issuer} onChange={(v) => patch({ issuer: v })} optional />
            <TextField label="Date" value={a.date} onChange={(v) => patch({ date: v })} optional />
          </div>
          <Field label="Description" optional>
            {(p) => <Textarea {...p} rows={2} value={a.description} onChange={(e) => patch({ description: e.target.value })} />}
          </Field>
        </div>
      )}
    </ListSection>
  );
}

/* ───────── Languages ───────── */
const PROFICIENCY = ["Native", "Fluent", "Professional working", "Limited working", "Elementary"];
export function LanguagesEditor({ doc, update }: EditorProps) {
  const list = doc.content.languages;
  const set = (next: typeof list) => update((d) => void (d.content.languages = next));
  if (!list.length)
    return (
      <EmptyState className="py-8" icon={<Plus />} title="Add a language you speak" action={<Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => set([newLanguage()])}>Add language</Button>} />
    );
  return (
    <div className="flex flex-col gap-2">
      <datalist id="proficiency-options">
        {PROFICIENCY.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <SortableList items={list} onReorder={set}>
        {(l, handle) => (
          <div className="flex items-end gap-1.5 rounded-xl border border-border bg-surface p-2">
            <DragHandle handle={handle} label="Reorder language" className="mb-1" />
            <TextField label="Language" value={l.name} onChange={(v) => set(list.map((x) => (x.id === l.id ? { ...x, name: v } : x)))} className="flex-1" />
            <Field label="Level" className="flex-1">
              {(p) => <Input {...p} list="proficiency-options" value={l.proficiency} placeholder="Fluent" onChange={(e) => set(list.map((x) => (x.id === l.id ? { ...x, proficiency: e.target.value } : x)))} />}
            </Field>
            <IconButton label="Remove language" onClick={() => set(list.filter((x) => x.id !== l.id))}>
              <X className="size-4" />
            </IconButton>
          </div>
        )}
      </SortableList>
      <Button size="sm" variant="ghost" className="self-start text-accent hover:text-accent" icon={<Plus className="size-4" />} onClick={() => set([...list, newLanguage()])}>
        Add language
      </Button>
    </div>
  );
}

/* ───────── Skills ───────── */
export function SkillsEditor({ doc, update, onFocusTarget }: EditorProps) {
  const skills = doc.content.skills;
  const set = (next: Skill[]) => update((d) => void (d.content.skills = next));
  const [draft, setDraft] = useState("");
  const [grouping, setGrouping] = useState(skills.some((s) => s.group.trim()));
  const addFrom = (text: string) => {
    const names = text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    const next = [...skills];
    for (const n of names) if (!next.some((s) => s.name.toLowerCase() === n.toLowerCase())) next.push(newSkill(n));
    set(next);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          aria-label="Add a skill"
          value={draft}
          onFocus={() => onFocusTarget?.({ scope: "section", section: "skills", label: "Skills" })}
          placeholder="Type a skill and press Enter (e.g. Excel, SQL)"
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;]$/.test(v)) addFrom(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (draft.trim()) addFrom(draft);
            } else if (e.key === "Backspace" && !draft && skills.length) set(skills.slice(0, -1));
          }}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text");
            if (/[,;\n]/.test(t)) {
              e.preventDefault();
              addFrom(t);
            }
          }}
        />
        <Button onClick={() => draft.trim() && addFrom(draft)} disabled={!draft.trim()} aria-label="Add skill">
          Add
        </Button>
      </div>
      {skills.length === 0 ? (
        <p className="text-sm text-subtle">Add the skills you want employers to notice. Tip: paste a comma-separated list.</p>
      ) : grouping ? (
        <div className="flex flex-col gap-1.5">
          <SortableList items={skills} onReorder={set}>
            {(s, handle) => (
              // Fixed grid columns: Input always carries `w-full`, so width utilities on the inputs can't be relied on
              // (that collapsed the skill name to a sliver while the category filled the row)
              <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,7.5rem)_auto] items-center gap-1.5">
                <DragHandle handle={handle} label={`Reorder ${s.name}`} />
                <Input aria-label="Skill" value={s.name} onChange={(e) => set(skills.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} className="h-9" />
                <Input aria-label={`Category for ${s.name}`} value={s.group} placeholder="Category" onChange={(e) => set(skills.map((x) => (x.id === s.id ? { ...x, group: e.target.value } : x)))} className="h-9 text-[13px] text-muted" list="skill-groups" />
                <IconButton label={`Remove ${s.name}`} size="sm" onClick={() => set(skills.filter((x) => x.id !== s.id))}>
                  <X className="size-4" />
                </IconButton>
              </div>
            )}
          </SortableList>
          <datalist id="skill-groups">
            {[...new Set(skills.map((s) => s.group).filter(Boolean)), "Technical", "Tools", "Languages", "Soft skills"].map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <SortableList items={skills} onReorder={set} grid>
            {(s, handle) => (
              <span className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-border bg-surface-2 pl-2.5 pr-1 text-[13px] font-medium">
                <span {...handle.attributes} {...handle.listeners} className="cursor-grab touch-none" aria-label={`Drag ${s.name}`}>
                  {s.name}
                </span>
                <button type="button" aria-label={`Remove ${s.name}`} onClick={() => set(skills.filter((x) => x.id !== s.id))} className="ml-0.5 inline-flex size-6 items-center justify-center rounded-md text-subtle hover:bg-surface-3 hover:text-fg">
                  <X className="size-3.5" />
                </button>
              </span>
            )}
          </SortableList>
        </div>
      )}
      <label className="flex items-center justify-between gap-3 rounded-lg bg-surface-2/70 px-3 py-2 text-sm">
        <span className="flex items-center gap-2 text-muted">
          <Tags className="size-4" aria-hidden /> Group skills into categories
        </span>
        <Switch checked={grouping} onChange={setGrouping} label="Group skills into categories" />
      </label>
    </div>
  );
}

/* ───────── Custom sections ───────── */
export function CustomEditor({ doc, update, sectionId }: EditorProps & { sectionId: string }) {
  const sec = doc.content.custom.find((s) => s.id === sectionId);
  if (!sec) return null;
  const setItems = (items: typeof sec.items) => update((d) => void (d.content.custom.find((s) => s.id === sectionId)!.items = items));
  return (
    <div className="flex flex-col gap-3">
      <Field label="Section title">
        {(p) => <Input {...p} value={sec.title} onChange={(e) => update((d) => void (d.content.custom.find((s) => s.id === sectionId)!.title = e.target.value))} />}
      </Field>
      <ListSection items={sec.items} set={setItems} factory={newCustomItem} addLabel="Add item" empty="Add an item" emptyIcon={<Plus />} placeholder="New item" title={(i) => i.title} subtitle={(i) => [i.subtitle, i.date].filter(Boolean).join(" · ")}>
        {(i, patch) => (
          <div className="flex flex-col gap-3">
            <div className={grid2}>
              <TextField label="Title" value={i.title} onChange={(v) => patch({ title: v })} />
              <TextField label="Subtitle" value={i.subtitle} onChange={(v) => patch({ subtitle: v })} optional />
              <TextField label="Date" value={i.date} onChange={(v) => patch({ date: v })} optional className="sm:col-span-2" />
            </div>
            <Field label="Description" optional hint="Start a line with • to make it a bullet point.">
              {(p) => <Textarea {...p} rows={2} value={i.description} onChange={(e) => patch({ description: e.target.value })} />}
            </Field>
          </div>
        )}
      </ListSection>
    </div>
  );
}

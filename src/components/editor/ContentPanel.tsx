"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, Award, BookOpen, Briefcase, ChevronDown, Eye, EyeOff, FolderGit2, GraduationCap, HandHeart, Languages, LayoutList, MoreHorizontal, Pencil, Plus, ScrollText, Trash2, User, Wrench } from "lucide-react";
import type { BuiltinSection, CVDoc } from "@/lib/cv/schema";
import type { AssistantSelection } from "@/lib/ai/types";
import { SECTION_DESCRIPTIONS, SECTION_LABELS, sectionTitle } from "@/lib/cv/meta";
import { newCustomSection } from "@/lib/cv/defaults";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/Button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/Menu";
import { ConfirmDialog, PromptDialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/misc";
import { DragHandle, move, SortableList, type HandleProps } from "./Sortable";
import {
  AwardsEditor,
  CertificationsEditor,
  CustomEditor,
  EducationEditor,
  ExperienceEditor,
  LanguagesEditor,
  PersonalEditor,
  ProjectsEditor,
  SkillsEditor,
  SummaryEditor,
  VolunteerEditor,
  type AskTarget,
  type Update,
} from "./SectionEditors";

const ICONS: Record<string, ReactNode> = {
  summary: <ScrollText />,
  experience: <Briefcase />,
  education: <GraduationCap />,
  skills: <Wrench />,
  projects: <FolderGit2 />,
  certifications: <BookOpen />,
  awards: <Award />,
  volunteer: <HandHeart />,
  languages: <Languages />,
};

function countFor(doc: CVDoc, key: string): number | null {
  const c = doc.content;
  switch (key) {
    case "summary":
      return null;
    case "experience":
      return c.experience.length;
    case "education":
      return c.education.length;
    case "skills":
      return c.skills.length;
    case "projects":
      return c.projects.length;
    case "certifications":
      return c.certifications.length;
    case "awards":
      return c.awards.length;
    case "volunteer":
      return c.volunteer.length;
    case "languages":
      return c.languages.length;
    default:
      return c.custom.find((s) => `custom:${s.id}` === key)?.items.length ?? 0;
  }
}

export interface FocusRequest {
  key: string;
  nonce: number;
}

export function ContentPanel({
  doc,
  update,
  onAsk,
  focus,
  onFocusTarget,
  defaultOpen,
}: {
  doc: CVDoc;
  update: Update;
  onAsk: (t: AskTarget) => void;
  focus?: FocusRequest | null;
  onFocusTarget?: (s: AssistantSelection) => void;
  /** sections expanded initially (e.g. all of them in the import review) */
  defaultOpen?: string[];
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpen ?? (doc.content.personal.fullName ? [] : ["personal"])));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!focus) return;
    setOpen((s) => new Set(s).add(focus.key));
    setTimeout(() => refs.current.get(focus.key)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, [focus]);

  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const order = doc.layout.order;
  const missing = (Object.keys(SECTION_LABELS) as BuiltinSection[]).filter((k) => !order.includes(k));
  const props = { doc, update, onAsk, onFocusTarget };

  const editorFor = (key: string) => {
    switch (key) {
      case "summary":
        return <SummaryEditor {...props} />;
      case "experience":
        return <ExperienceEditor {...props} />;
      case "education":
        return <EducationEditor {...props} />;
      case "skills":
        return <SkillsEditor {...props} />;
      case "projects":
        return <ProjectsEditor {...props} />;
      case "certifications":
        return <CertificationsEditor {...props} />;
      case "awards":
        return <AwardsEditor {...props} />;
      case "volunteer":
        return <VolunteerEditor {...props} />;
      case "languages":
        return <LanguagesEditor {...props} />;
      default:
        return key.startsWith("custom:") ? <CustomEditor {...props} sectionId={key.slice(7)} /> : null;
    }
  };

  const removeSection = (key: string) =>
    update((d) => {
      d.layout.order = d.layout.order.filter((k) => k !== key);
      d.layout.hidden = d.layout.hidden.filter((k) => k !== key);
      delete d.layout.titles[key];
      if (key.startsWith("custom:")) d.content.custom = d.content.custom.filter((s) => `custom:${s.id}` !== key);
      else if (key === "summary") d.content.summary = "";
      else (d.content[key as Exclude<BuiltinSection, "summary">] as unknown[]) = [];
    });

  const addSection = (key: string) => {
    update((d) => void d.layout.order.push(key));
    setOpen((s) => new Set(s).add(key));
    setTimeout(() => refs.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Personal info — always first */}
      <SectionShell
        refCb={(el) => (el ? refs.current.set("personal", el) : refs.current.delete("personal"))}
        icon={<User />}
        title="Personal information"
        subtitle={doc.content.personal.fullName || "Name, contact details and links"}
        open={open.has("personal")}
        onToggle={() => toggle("personal")}
      >
        <PersonalEditor {...props} />
      </SectionShell>

      <SortableList items={order.map((k) => ({ id: k }))} onReorder={(next) => update((d) => void (d.layout.order = next.map((x) => x.id)))}>
        {({ id: key }, handle, i) => {
          const hidden = doc.layout.hidden.includes(key);
          const count = countFor(doc, key);
          return (
            <SectionShell
              refCb={(el) => (el ? refs.current.set(key, el) : refs.current.delete(key))}
              handle={handle}
              icon={ICONS[key] ?? <LayoutList />}
              title={sectionTitle(doc, key)}
              subtitle={hidden ? "Hidden from CV" : (SECTION_DESCRIPTIONS[key as BuiltinSection] ?? "Custom section")}
              count={count}
              hidden={hidden}
              open={open.has(key)}
              onToggle={() => toggle(key)}
              menu={
                <Menu
                  trigger={
                    <IconButton label={`${sectionTitle(doc, key)} options`} size="sm" tooltip={false}>
                      <MoreHorizontal className="size-4" />
                    </IconButton>
                  }
                >
                  <MenuItem icon={<Pencil />} onSelect={() => setRenaming(key)}>
                    Rename section
                  </MenuItem>
                  <MenuItem icon={hidden ? <Eye /> : <EyeOff />} onSelect={() => update((d) => void (d.layout.hidden = hidden ? d.layout.hidden.filter((k) => k !== key) : [...d.layout.hidden, key]))}>
                    {hidden ? "Show on CV" : "Hide from CV"}
                  </MenuItem>
                  {i > 0 && (
                    <MenuItem icon={<ArrowUp />} onSelect={() => update((d) => void (d.layout.order = move(d.layout.order, i, i - 1)))}>
                      Move up
                    </MenuItem>
                  )}
                  {i < order.length - 1 && (
                    <MenuItem icon={<ArrowDown />} onSelect={() => update((d) => void (d.layout.order = move(d.layout.order, i, i + 1)))}>
                      Move down
                    </MenuItem>
                  )}
                  <MenuSeparator />
                  <MenuItem icon={<Trash2 />} danger onSelect={() => setRemoving(key)}>
                    Remove section
                  </MenuItem>
                </Menu>
              }
            >
              {editorFor(key)}
            </SectionShell>
          );
        }}
      </SortableList>

      <Menu
        align="start"
        trigger={
          <button type="button" className="flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong/80 text-sm font-medium text-muted transition-colors hover:border-accent/50 hover:bg-accent-soft/40 hover:text-accent">
            <Plus className="size-4" aria-hidden /> Add section
          </button>
        }
      >
        {missing.length > 0 && <MenuLabel>Sections</MenuLabel>}
        {missing.map((k) => (
          <MenuItem key={k} icon={ICONS[k]} onSelect={() => addSection(k)}>
            {SECTION_LABELS[k]}
          </MenuItem>
        ))}
        {missing.length > 0 && <MenuSeparator />}
        <MenuItem
          icon={<LayoutList />}
          onSelect={() => {
            const cs = newCustomSection();
            update((d) => {
              d.content.custom.push(cs);
              d.layout.order.push(`custom:${cs.id}`);
            });
            setOpen((s) => new Set(s).add(`custom:${cs.id}`));
          }}
        >
          Custom section
        </MenuItem>
      </Menu>

      <PromptDialog
        open={!!renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Rename section"
        label="Section title"
        initial={renaming ? sectionTitle(doc, renaming) : ""}
        confirmLabel="Save"
        onSubmit={(v) =>
          renaming &&
          update((d) => {
            if (renaming.startsWith("custom:")) d.content.custom.find((s) => `custom:${s.id}` === renaming)!.title = v;
            else d.layout.titles[renaming] = v;
          })
        }
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this section?"
        description="Its content will be deleted from this CV. You can undo with Ctrl+Z."
        confirmLabel="Remove section"
        danger
        onConfirm={() => removing && removeSection(removing)}
      />
    </div>
  );
}

function SectionShell({
  refCb,
  handle,
  icon,
  title,
  subtitle,
  count,
  hidden,
  open,
  onToggle,
  menu,
  children,
}: {
  refCb: (el: HTMLDivElement | null) => void;
  handle?: HandleProps;
  icon: ReactNode;
  title: string;
  subtitle: string;
  count?: number | null;
  hidden?: boolean;
  open: boolean;
  onToggle: () => void;
  menu?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div ref={refCb} className={cn("scroll-mt-4 rounded-2xl border bg-surface shadow-sm transition-colors", open ? "border-border-strong/70" : "border-border", hidden && "opacity-70")}>
      <div className="flex items-center gap-1 p-1.5">
        {handle ? <DragHandle handle={handle} label={`Reorder ${title} section`} /> : <span className="w-1" />}
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1.5 text-left">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted [&>svg]:size-4">{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{title}</span>
              {count != null && count > 0 && <Badge>{count}</Badge>}
              {hidden && <EyeOff className="size-3.5 text-subtle" aria-label="Hidden" />}
            </span>
            <span className="block truncate text-xs text-subtle">{subtitle}</span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-subtle transition-transform duration-200", open && "rotate-180")} aria-hidden />
        </button>
        {menu}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="px-3 pb-4 pt-1 sm:px-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

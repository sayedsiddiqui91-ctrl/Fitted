import type { BuiltinSection, CVDoc, TemplateId } from "./schema";
import { TEMPLATE_DEFS, templateDef, type TemplateDef } from "./templates";

export const SECTION_LABELS: Record<BuiltinSection, string> = {
  summary: "Summary",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  certifications: "Certifications",
  awards: "Awards",
  volunteer: "Volunteer Experience",
  languages: "Languages",
};

export const SECTION_DESCRIPTIONS: Record<BuiltinSection, string> = {
  summary: "A short pitch tailored to the roles you want",
  experience: "Your jobs, internships and key achievements",
  education: "Degrees, schools and relevant coursework",
  skills: "Tools, technical and professional skills",
  projects: "Personal, academic or work projects",
  certifications: "Licenses and professional certifications",
  awards: "Honors, scholarships and recognition",
  volunteer: "Volunteering and community work",
  languages: "Languages you speak and your level",
};

export const EMPTY_STATE_COPY: Record<BuiltinSection, string> = {
  summary: "Write two or three sentences about who you are and what you bring.",
  experience: "Add your first position.",
  education: "Add your school or degree.",
  skills: "Add the skills you want employers to notice.",
  projects: "Add a project you're proud of.",
  certifications: "Add a certification or license.",
  awards: "Add an award or honor.",
  volunteer: "Add volunteer experience.",
  languages: "Add a language you speak.",
};

export function sectionTitle(doc: CVDoc, key: string): string {
  if (doc.layout.titles[key]) return doc.layout.titles[key];
  if (key.startsWith("custom:")) {
    const id = key.slice(7);
    return doc.content.custom.find((c) => c.id === id)?.title || "Custom Section";
  }
  return SECTION_LABELS[key as BuiltinSection] ?? key;
}

export type TemplateMeta = TemplateDef;
export const TEMPLATES: TemplateMeta[] = TEMPLATE_DEFS;
export const templateMeta = (id: TemplateId) => templateDef(id);

export interface FontOption {
  name: string;
  stack: string;
  kind: "sans" | "serif";
  google: string; // family query for Google Fonts css2
}

export const CV_FONTS: FontOption[] = [
  { name: "Inter", stack: "'Inter', Arial, sans-serif", kind: "sans", google: "Inter:ital,wght@0,400;0,500;0,600;0,700;1,400" },
  { name: "IBM Plex Sans", stack: "'IBM Plex Sans', Arial, sans-serif", kind: "sans", google: "IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400" },
  { name: "Lato", stack: "'Lato', Arial, sans-serif", kind: "sans", google: "Lato:ital,wght@0,400;0,700;1,400" },
  { name: "Source Sans 3", stack: "'Source Sans 3', Arial, sans-serif", kind: "sans", google: "Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400" },
  { name: "Roboto", stack: "'Roboto', Arial, sans-serif", kind: "sans", google: "Roboto:ital,wght@0,400;0,500;0,700;1,400" },
  { name: "Source Serif 4", stack: "'Source Serif 4', Georgia, serif", kind: "serif", google: "Source+Serif+4:ital,wght@0,400;0,600;0,700;1,400" },
  { name: "Lora", stack: "'Lora', Georgia, serif", kind: "serif", google: "Lora:ital,wght@0,400;0,500;0,600;0,700;1,400" },
  { name: "Merriweather", stack: "'Merriweather', Georgia, serif", kind: "serif", google: "Merriweather:ital,wght@0,400;0,700;1,400" },
  { name: "EB Garamond", stack: "'EB Garamond', Garamond, Georgia, serif", kind: "serif", google: "EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400" },
];

export const fontOption = (name: string) => CV_FONTS.find((f) => f.name === name) ?? CV_FONTS[0];

export const googleFontHref = (name: string) => googleFontsHref([name]);

/** One stylesheet for several CV fonts — the template strip needs eight of them, and eight
    separate requests to Google is what made the landing page slow on a phone. */
export const googleFontsHref = (names: string[]) => `https://fonts.googleapis.com/css2?${names.map((n) => `family=${fontOption(n).google}`).join("&")}&display=swap`;

export const ACCENT_SWATCHES = [
  "#111827",
  "#2b4c9a",
  "#1d4ed8",
  "#0f766e",
  "#15803d",
  "#7a2e2e",
  "#9d174d",
  "#6d28d9",
  "#b45309",
];

export const PAGE_DIMENSIONS = {
  A4: { widthMm: 210, heightMm: 297 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
} as const;

export const MM_TO_PX = 96 / 25.4;

import type { Design, TemplateId } from "./schema";

/* Template registry. A template is a PRESENTATION LAYER over the same CV data:
   it chooses a layout, header, entry and skills style plus visual defaults.
   CV DATA → CVDocument renderer → template definition + CSS (styles.ts). */

export type HeaderStyle = "left" | "center" | "split" | "band" | "details";
export type EntryStyle = "stacked" | "traditional" | "dates-left" | "compact" | "timeline";
export type SkillsStyle = "inline" | "tags" | "columns";
export type LayoutStyle = "single" | "sidebar-left" | "sidebar-right";
export type TemplateCategory = "ATS" | "Professional" | "Creative" | "Academic";

export interface TemplateDef {
  id: TemplateId;
  name: string;
  description: string;
  bestFor: string;
  category: TemplateCategory;
  atsFriendly: boolean;
  /** Shows the profile photo, if the user added one */
  photo: boolean;
  layout: LayoutStyle;
  header: HeaderStyle;
  entry: EntryStyle;
  skills: SkillsStyle;
  /** "rail" puts section titles in a left column */
  sectionStyle: "stacked" | "rail";
  sidebarSections: string[];
  /** Render contact details inside the sidebar instead of the header */
  contactInSidebar: boolean;
  /** Put the name/headline at the top of the main column (sidebar layouts) */
  headerInMain: boolean;
  separator: string;
  contactSeparator: string;
  defaults: Partial<Design>;
}

const SIDEBAR = ["skills", "languages", "certifications", "awards"];

const base = {
  photo: false,
  layout: "single" as LayoutStyle,
  header: "left" as HeaderStyle,
  entry: "stacked" as EntryStyle,
  skills: "inline" as SkillsStyle,
  sectionStyle: "stacked" as const,
  sidebarSections: [] as string[],
  contactInSidebar: false,
  headerInMain: false,
  separator: " · ",
  contactSeparator: "•",
};

export const TEMPLATE_DEFS: TemplateDef[] = [
  { ...base, id: "modern", name: "Modern", description: "Clean, confident layout with accent headings.", bestFor: "Most roles", category: "Professional", atsFriendly: true, defaults: { font: "Inter", accent: "#2b4c9a", margin: 16 } },
  { ...base, id: "classic", name: "Classic", description: "Traditional corporate CV with serif type.", bestFor: "Law, banking, government", category: "Professional", atsFriendly: true, header: "center", entry: "traditional", defaults: { font: "Source Serif 4", accent: "#1f2937", margin: 18 } },
  { ...base, id: "minimal", name: "Minimal ATS", description: "Plain, highly parseable single column.", bestFor: "Online applications", category: "ATS", atsFriendly: true, separator: " | ", contactSeparator: "|", defaults: { font: "IBM Plex Sans", accent: "#111827", margin: 16 } },
  { ...base, id: "executive", name: "Executive", description: "Refined layout for senior professionals.", bestFor: "Senior & leadership roles", category: "Professional", atsFriendly: true, entry: "traditional", defaults: { font: "Lora", accent: "#7a2e2e", margin: 18 } },
  { ...base, id: "finance", name: "Finance", description: "Split header, double rule and small-caps headings.", bestFor: "Finance, accounting, banking", category: "Professional", atsFriendly: true, header: "split", entry: "traditional", defaults: { font: "Source Serif 4", accent: "#1e3a5f", margin: 16 } },
  { ...base, id: "consulting", name: "Consulting", description: "Section titles in a left rail for fast scanning.", bestFor: "Consulting, strategy, operations", category: "Professional", atsFriendly: true, sectionStyle: "rail", defaults: { font: "Inter", accent: "#0b4f8a", margin: 16 } },
  { ...base, id: "technology", name: "Technology", description: "Monospace accents and skill tags.", bestFor: "Engineering, data, product", category: "Professional", atsFriendly: true, skills: "tags", defaults: { font: "IBM Plex Sans", accent: "#0f766e", margin: 15 } },
  { ...base, id: "graduate", name: "Graduate", description: "Friendly, spacious layout with pill headings.", bestFor: "Students, internships, first jobs", category: "ATS", atsFriendly: true, header: "center", defaults: { font: "Lato", accent: "#6d28d9", margin: 16 } },
  { ...base, id: "academic", name: "Academic", description: "Serif CV with dates in the left margin.", bestFor: "Research, teaching, PhD", category: "Academic", atsFriendly: true, header: "center", entry: "dates-left", defaults: { font: "EB Garamond", accent: "#111827", margin: 18, fontSize: 11 } },
  { ...base, id: "compact", name: "Compact", description: "Dense one-pager that fits more on a page.", bestFor: "Experienced candidates keeping to 1 page", category: "ATS", atsFriendly: true, entry: "compact", defaults: { font: "Inter", accent: "#111827", margin: 12, fontSize: 9.5, lineHeight: 1.3, sectionSpacing: 0.8 } },
  { ...base, photo: true, id: "international", name: "International", description: "Personal details table and banded headings.", bestFor: "Europe, Middle East & Asia applications", category: "ATS", atsFriendly: true, header: "details", entry: "traditional", defaults: { font: "Roboto", accent: "#1f2937", margin: 16 } },
  { ...base, id: "professional", name: "Professional Minimal", description: "Light type, dates on the left, lots of air.", bestFor: "Design-aware corporate roles", category: "Professional", atsFriendly: true, entry: "dates-left", defaults: { font: "Inter", accent: "#374151", margin: 18 } },
  { ...base, photo: true, id: "contemporary", name: "Contemporary", description: "Accent bars and a three-column skills grid.", bestFor: "Marketing, sales, business", category: "Professional", atsFriendly: true, header: "split", skills: "columns", defaults: { font: "IBM Plex Sans", accent: "#b45309", margin: 16 } },
  { ...base, id: "elegant", name: "Elegant", description: "Centered serif with fine rules.", bestFor: "Hospitality, arts, luxury, law", category: "Professional", atsFriendly: true, header: "center", entry: "traditional", defaults: { font: "Lora", accent: "#1f2937", margin: 18 } },
  { ...base, photo: true, id: "creative", name: "Creative", description: "Colour header band with a skills sidebar.", bestFor: "Design, marketing, networking", category: "Creative", atsFriendly: false, header: "band", layout: "sidebar-left", sidebarSections: SIDEBAR, defaults: { font: "Lato", accent: "#0f766e", margin: 14 } },
  { ...base, photo: true, id: "twocolumn", name: "Clean Two-Column", description: "Main column with a tinted side panel.", bestFor: "Networking, career fairs", category: "Creative", atsFriendly: false, layout: "sidebar-right", sidebarSections: SIDEBAR, defaults: { font: "Source Sans 3", accent: "#2b4c9a", margin: 14 } },
  { ...base, photo: true, id: "sidebar", name: "Modern Sidebar", description: "Bold colour sidebar with contact and skills.", bestFor: "Creative and client-facing roles", category: "Creative", atsFriendly: false, layout: "sidebar-left", sidebarSections: SIDEBAR, contactInSidebar: true, headerInMain: true, defaults: { font: "Lato", accent: "#1f3a5f", margin: 12 } },
  { ...base, photo: true, id: "timeline", name: "Timeline", description: "Career shown as a vertical timeline.", bestFor: "Portfolios, career changers", category: "Creative", atsFriendly: false, entry: "timeline", defaults: { font: "Source Sans 3", accent: "#0f766e", margin: 15 } },
];

const byId = new Map(TEMPLATE_DEFS.map((t) => [t.id, t]));
export const templateDef = (id: TemplateId | string): TemplateDef => byId.get(id as TemplateId) ?? TEMPLATE_DEFS[0];

export const TEMPLATE_CATEGORIES: TemplateCategory[] = ["ATS", "Professional", "Academic", "Creative"];

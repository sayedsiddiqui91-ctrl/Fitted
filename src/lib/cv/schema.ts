import { z } from "zod";

/* ───────── CV CONTENT (what the CV says) ─────────
   Content is stored independently from presentation (design/template)
   so the same content renders in any template and can be optimized,
   versioned and exported. */

export const BulletSchema = z.object({ id: z.string(), text: z.string() });

export const LinkSchema = z.object({ id: z.string(), label: z.string(), url: z.string() });

export const PersonalSchema = z.object({
  fullName: z.string(),
  headline: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  website: z.string(),
  linkedin: z.string(),
  links: z.array(LinkSchema),
});

export const ExperienceSchema = z.object({
  id: z.string(),
  role: z.string(),
  company: z.string(),
  location: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  current: z.boolean(),
  bullets: z.array(BulletSchema),
});

export const EducationSchema = z.object({
  id: z.string(),
  degree: z.string(),
  field: z.string(),
  school: z.string(),
  location: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  grade: z.string(),
  bullets: z.array(BulletSchema),
});

export const SkillSchema = z.object({ id: z.string(), name: z.string(), group: z.string() });

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  link: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  bullets: z.array(BulletSchema),
});

export const CertificationSchema = z.object({
  id: z.string(),
  name: z.string(),
  issuer: z.string(),
  date: z.string(),
  link: z.string(),
});

export const AwardSchema = z.object({
  id: z.string(),
  title: z.string(),
  issuer: z.string(),
  date: z.string(),
  description: z.string(),
});

export const VolunteerSchema = z.object({
  id: z.string(),
  role: z.string(),
  organization: z.string(),
  location: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  current: z.boolean(),
  bullets: z.array(BulletSchema),
});

export const LanguageSchema = z.object({ id: z.string(), name: z.string(), proficiency: z.string() });

export const CustomItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  date: z.string(),
  description: z.string(),
});

export const CustomSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  items: z.array(CustomItemSchema),
});

export const CVContentSchema = z.object({
  personal: PersonalSchema,
  summary: z.string(),
  experience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  skills: z.array(SkillSchema),
  projects: z.array(ProjectSchema),
  certifications: z.array(CertificationSchema),
  awards: z.array(AwardSchema),
  volunteer: z.array(VolunteerSchema),
  languages: z.array(LanguageSchema),
  custom: z.array(CustomSectionSchema),
});

/* ───────── LAYOUT + DESIGN (how the CV looks) ───────── */

export const BUILTIN_SECTIONS = [
  "summary",
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
  "awards",
  "volunteer",
  "languages",
] as const;
export type BuiltinSection = (typeof BUILTIN_SECTIONS)[number];
/** A section key is a builtin section or `custom:<id>` */
export type SectionKey = BuiltinSection | `custom:${string}`;

export const LayoutSchema = z.object({
  order: z.array(z.string()),
  hidden: z.array(z.string()),
  titles: z.record(z.string(), z.string()),
});

export const TEMPLATE_IDS = [
  "classic",
  "modern",
  "minimal",
  "executive",
  "creative",
  "finance",
  "consulting",
  "technology",
  "graduate",
  "academic",
  "twocolumn",
  "compact",
  "sidebar",
  "international",
  "professional",
  "contemporary",
  "elegant",
  "timeline",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const DesignSchema = z.object({
  template: z.enum(TEMPLATE_IDS),
  font: z.string(),
  fontSize: z.number(), // pt
  headingScale: z.number(), // multiplier
  lineHeight: z.number(),
  sectionSpacing: z.number(), // multiplier
  margin: z.number(), // mm
  accent: z.string(),
  pageSize: z.enum(["A4", "Letter"]),
  targetPages: z.union([z.literal(1), z.literal(2)]),
});

/* ───────── JOB TARGET (attached to tailored versions) ───────── */

export const JobTargetSchema = z.object({
  title: z.string(),
  company: z.string(),
  description: z.string(),
  score: z.number().optional(),
  scoreBefore: z.number().optional(),
  optimizedAt: z.number().optional(),
});

export const CVDocSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  parentId: z.string().nullable(),
  jobTarget: JobTargetSchema.nullable(),
  content: CVContentSchema,
  layout: LayoutSchema,
  design: DesignSchema,
});

/* ───────── APPLICATION TRACKER ───────── */

export const APPLICATION_STATUSES = ["saved", "applied", "interview", "offer", "rejected"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const ApplicationSchema = z.object({
  id: z.string(),
  company: z.string(),
  title: z.string(),
  link: z.string(),
  dateApplied: z.string(),
  cvId: z.string().nullable(),
  status: z.enum(APPLICATION_STATUSES),
  notes: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Bullet = z.infer<typeof BulletSchema>;
export type Personal = z.infer<typeof PersonalSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Certification = z.infer<typeof CertificationSchema>;
export type Award = z.infer<typeof AwardSchema>;
export type Volunteer = z.infer<typeof VolunteerSchema>;
export type Language = z.infer<typeof LanguageSchema>;
export type CustomItem = z.infer<typeof CustomItemSchema>;
export type CustomSection = z.infer<typeof CustomSectionSchema>;
export type CVContent = z.infer<typeof CVContentSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type Design = z.infer<typeof DesignSchema>;
export type JobTarget = z.infer<typeof JobTargetSchema>;
export type CVDoc = z.infer<typeof CVDocSchema>;
export type Application = z.infer<typeof ApplicationSchema>;

/** Sections with list items that can be added / duplicated / reordered. */
export type ListSection =
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications"
  | "awards"
  | "volunteer"
  | "languages";

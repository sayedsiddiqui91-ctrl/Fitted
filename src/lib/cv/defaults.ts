import { uid } from "@/lib/utils";
import { TEMPLATE_DEFS } from "./templates";
import type {
  Award,
  Certification,
  CustomItem,
  CustomSection,
  CVContent,
  CVDoc,
  Design,
  Education,
  Experience,
  Language,
  Layout,
  Project,
  Skill,
  TemplateId,
  Volunteer,
} from "./schema";

export const DEFAULT_ORDER = [
  "summary",
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
  "awards",
  "volunteer",
  "languages",
];

export const DEFAULT_DESIGN: Design = {
  template: "modern",
  font: "Inter",
  fontSize: 10,
  headingScale: 1,
  lineHeight: 1.4,
  sectionSpacing: 1,
  margin: 16,
  accent: "#2b4c9a",
  pageSize: "A4",
  targetPages: 1,
};

/** Template-specific defaults applied when a user switches template (only design, never content).
    Visual params not set by a template are reset to the global defaults so templates don't leak into each other. */
export const TEMPLATE_DESIGN_DEFAULTS = Object.fromEntries(
  TEMPLATE_DEFS.map((t) => [t.id, { fontSize: 10, lineHeight: 1.4, sectionSpacing: 1, headingScale: 1, ...t.defaults }]),
) as Record<TemplateId, Partial<Design>>;

export const emptyContent = (): CVContent => ({
  personal: {
    fullName: "",
    headline: "",
    email: "",
    phone: "",
    location: "",
    website: "",
    linkedin: "",
    links: [],
  },
  summary: "",
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
  awards: [],
  volunteer: [],
  languages: [],
  custom: [],
});

export const defaultLayout = (): Layout => ({
  order: [...DEFAULT_ORDER],
  hidden: [],
  titles: {},
});

export function newCV(partial: Partial<CVDoc> = {}): CVDoc {
  const now = Date.now();
  return {
    id: uid("cv"),
    name: "Untitled CV",
    createdAt: now,
    updatedAt: now,
    parentId: null,
    jobTarget: null,
    content: emptyContent(),
    layout: defaultLayout(),
    design: { ...DEFAULT_DESIGN },
    ...partial,
  };
}

/* ───────── item factories ───────── */
export const newBullet = (text = "") => ({ id: uid("b"), text });
export const newExperience = (): Experience => ({
  id: uid("exp"),
  role: "",
  company: "",
  location: "",
  startDate: "",
  endDate: "",
  current: false,
  bullets: [newBullet()],
});
export const newEducation = (): Education => ({
  id: uid("edu"),
  degree: "",
  field: "",
  school: "",
  location: "",
  startDate: "",
  endDate: "",
  grade: "",
  bullets: [],
});
export const newSkill = (name = "", group = ""): Skill => ({ id: uid("sk"), name, group });
export const newProject = (): Project => ({
  id: uid("prj"),
  name: "",
  role: "",
  link: "",
  startDate: "",
  endDate: "",
  bullets: [newBullet()],
});
export const newCertification = (): Certification => ({ id: uid("cert"), name: "", issuer: "", date: "", link: "" });
export const newAward = (): Award => ({ id: uid("awd"), title: "", issuer: "", date: "", description: "" });
export const newVolunteer = (): Volunteer => ({
  id: uid("vol"),
  role: "",
  organization: "",
  location: "",
  startDate: "",
  endDate: "",
  current: false,
  bullets: [newBullet()],
});
export const newLanguage = (): Language => ({ id: uid("lang"), name: "", proficiency: "" });
export const newCustomItem = (): CustomItem => ({ id: uid("ci"), title: "", subtitle: "", date: "", description: "" });
export const newCustomSection = (title = "Custom Section"): CustomSection => ({
  id: uid("cs"),
  title,
  items: [newCustomItem()],
});

/* ───────── Sample content (used for templates, landing & demo) ───────── */

const b = (text: string) => newBullet(text);

export function sampleContent(): CVContent {
  return {
    personal: {
      fullName: "Jordan Lee",
      headline: "Finance Analyst",
      email: "jordan.lee@email.com",
      phone: "+1 (555) 014-2290",
      location: "Chicago, IL",
      website: "",
      linkedin: "linkedin.com/in/jordanlee",
      links: [],
    },
    summary:
      "Detail-oriented finance professional with experience in accounts payable, vendor reconciliation and management reporting. Comfortable working with large data sets in Excel and SQL.",
    experience: [
      {
        id: uid("exp"),
        role: "Finance Analyst",
        company: "Brightline Logistics",
        location: "Chicago, IL",
        startDate: "Mar 2023",
        endDate: "",
        current: true,
        bullets: [
          b("Responsible for invoice processing and vendor payments for 120+ suppliers."),
          b("Reconciled vendor statements monthly and resolved payment discrepancies with procurement."),
          b("Built Excel pivot-table reports on monthly spend by cost center for department heads."),
          b("Helped with month-end close by preparing accruals and journal entries."),
        ],
      },
      {
        id: uid("exp"),
        role: "Accounts Payable Associate",
        company: "Crestview Health",
        location: "Evanston, IL",
        startDate: "Jun 2021",
        endDate: "Feb 2023",
        current: false,
        bullets: [
          b("Processed purchase orders and invoices using three-way matching in SAP."),
          b("Worked on a project to clean up duplicate vendor records, reducing duplicate payments by 30%."),
          b("Answered supplier queries by email and phone."),
        ],
      },
    ],
    education: [
      {
        id: uid("edu"),
        degree: "Bachelor of Science",
        field: "Finance",
        school: "University of Illinois",
        location: "Urbana-Champaign, IL",
        startDate: "2017",
        endDate: "2021",
        grade: "GPA 3.6",
        bullets: [b("Relevant coursework: Corporate Finance, Managerial Accounting, Statistics")],
      },
    ],
    skills: [
      newSkill("Microsoft Office"),
      newSkill("SQL"),
      newSkill("Financial Analysis"),
      newSkill("Excel"),
      newSkill("SAP"),
      newSkill("Accounts Payable"),
      newSkill("Communication"),
    ],
    projects: [],
    certifications: [
      { id: uid("cert"), name: "Excel Expert (MO-201)", issuer: "Microsoft", date: "2022", link: "" },
    ],
    awards: [],
    volunteer: [],
    languages: [
      { id: uid("lang"), name: "English", proficiency: "Native" },
      { id: uid("lang"), name: "Spanish", proficiency: "Professional working" },
    ],
    custom: [],
  };
}

export const SAMPLE_JOB = `Financial Analyst — Northwind Partners

About the role
Northwind Partners is looking for a Financial Analyst to join our FP&A team in Chicago. You will support budgeting, forecasting and management reporting across our business units.

Responsibilities
- Prepare monthly financial reports and variance analysis for leadership
- Build and maintain financial models to support forecasting and budgeting
- Analyze business performance and identify cost-saving opportunities
- Support the annual budgeting process and quarterly forecasts
- Partner with cross-functional teams including operations and procurement
- Reconcile accounts and support month-end close

Requirements
- Bachelor's degree in Finance, Accounting or a related field
- 2+ years of experience in financial analysis, accounting or FP&A
- Advanced Excel skills (pivot tables, lookups, modeling)
- Experience with SQL
- Strong analytical and problem-solving skills
- Excellent communication skills and attention to detail

Nice to have
- Experience with Power BI or Tableau
- Knowledge of Python for data analysis
- ERP experience (SAP or NetSuite)`;

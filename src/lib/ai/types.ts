import { z } from "zod";
import type { Bullet, Skill } from "@/lib/cv/schema";

/* Structured AI contracts. Every AI response — local engine or Claude —
   is validated against these schemas before the UI trusts it. */

export const SENIORITY = ["Internship", "Entry-level", "Junior", "Mid-level", "Senior", "Managerial", "Unspecified"] as const;
export const DEGREE_LEVELS = ["none", "associate", "bachelor", "master", "phd"] as const;

export const JobAnalysisSchema = z.object({
  jobTitle: z.string(),
  company: z.string(),
  seniority: z.enum(SENIORITY),
  industry: z.string(),
  jobFunction: z.string(),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  responsibilities: z.array(z.string()),
  qualifications: z.array(z.string()),
  softSkills: z.array(z.string()),
  keywords: z.array(z.string()),
  yearsExperience: z.number().nullable(),
  degreeLevel: z.enum(DEGREE_LEVELS),
  educationFields: z.array(z.string()),
  /* Job metadata & company info — informs analysis, NEVER inserted into CV content */
  location: z.string().nullable(),
  employmentType: z.string().nullable(),
  workArrangement: z.string().nullable(),
  salary: z.string().nullable(),
  applicationInstructions: z.array(z.string()),
  companyDescription: z.string().nullable(),
});
export type JobAnalysis = z.infer<typeof JobAnalysisSchema>;

export type Importance = "required" | "preferred" | "keyword";

export interface KeywordHit {
  term: string;
  importance: Importance;
  /** Where in the CV this was found (FACT) */
  evidence?: string;
  /** Related things the CV does show (basis for INFERENCE) */
  related?: string[];
}

export type RequirementKind = "skill" | "tool" | "experience" | "education" | "certification" | "responsibility";
export type RequirementStatus = "matched" | "partial" | "missing";

/** One job requirement mapped to evidence in the CV. */
export interface RequirementEvidence {
  requirement: string;
  kind: RequirementKind;
  importance: Importance;
  status: RequirementStatus;
  evidence?: string;
  reason: string;
}

export interface MatchResult {
  overall: number;
  breakdown: {
    keyword: number;
    skills: number;
    experience: number;
    education: number;
    formatting: number;
    /* multi-dimensional scoring (optional for results saved by older versions) */
    required?: number;
    preferred?: number | null;
    responsibilities?: number;
    certifications?: number | null;
    industry?: number | null;
    structure?: number;
  };
  requirements?: RequirementEvidence[];
  educationApplicable: boolean;
  strongMatches: string[];
  weakAreas: string[];
  keywords: {
    have: KeywordHit[];
    canAdd: KeywordHit[];
    doNotAdd: KeywordHit[];
  };
}

export type ChangeKind =
  | "summary"
  | "bullet"
  | "bullet-order"
  | "skills"
  | "add-skill"
  | "add-bullet"
  | "section-order"
  | "item-order";

export type ChangeCategory = "safe" | "clarify" | "blocked";
/** FACT = supported by the CV, USER = user confirmed it, INFERENCE = plausible but unconfirmed */
export type ChangeBasis = "fact" | "user" | "inference";

export interface Change {
  id: string;
  kind: ChangeKind;
  section: string;
  label: string;
  target: { itemId?: string; bulletId?: string };
  before: string;
  after: string;
  original: string; // the AI's first proposal, to allow "restore suggestion"
  beforeList?: string[];
  afterList?: string[];
  payload?: { skills?: Skill[]; order?: string[]; skill?: Skill; bullet?: Bullet };
  reasons: string[];
  basis: ChangeBasis;
  category: ChangeCategory;
  status: "pending" | "accepted" | "rejected";
  warning?: string;
}

export interface QuestionOption {
  value: string;
  label: string;
}

export interface Question {
  id: string;
  kind: "metric" | "skill";
  prompt: string;
  context?: string;
  options: QuestionOption[];
  /** metric questions */
  section?: string;
  itemId?: string;
  bulletId?: string;
  unit?: "count" | "percent" | "money" | "people";
  noun?: string;
  frequency?: string;
  /** skill clarification questions */
  keyword?: string;
  importance?: Importance;
  answer?: string;
  detail?: string;
  detailItemId?: string;
}

export interface RejectedSuggestion {
  label: string;
  text: string;
  reason: string;
}

export interface OptimizationPlan {
  changes: Change[];
  questions: Question[];
  doNotAdd: KeywordHit[];
  notes: string[];
  /** Suggestions the quality check filtered out (transparency) */
  rejected?: RejectedSuggestion[];
}

export type OptimizeMode = "conservative" | "balanced" | "aggressive";
export type EngineKind = "local" | "claude";

export interface OptimizeSession {
  cvId: string;
  jobText: string;
  jobTitle: string;
  company: string;
  analysis: JobAnalysis | null;
  match: MatchResult | null;
  mode: OptimizeMode;
  plan: OptimizationPlan | null;
  step: "job" | "analysis" | "review" | "done";
  versionName: string;
  engine: EngineKind;
  createdVersionId?: string;
  scoreAfter?: number;
  updatedAt: number;
}

/* ───────── Review ───────── */
export interface ReviewItem {
  id: string;
  severity: "good" | "warn" | "issue";
  category: string;
  title: string;
  detail: string;
  section?: string;
  examples?: string[];
}
export interface ReviewResult {
  score: number;
  categories: { name: string; score: number }[];
  items: ReviewItem[];
}

export const ReviewResultSchema = z.object({
  score: z.number(),
  categories: z.array(z.object({ name: z.string(), score: z.number() })),
  items: z.array(
    z.object({
      id: z.string(),
      severity: z.enum(["good", "warn", "issue"]),
      category: z.string(),
      title: z.string(),
      detail: z.string(),
      section: z.string().optional(),
      examples: z.array(z.string()).optional(),
    }),
  ),
});

/* ───────── Interview prep ───────── */
export const InterviewQuestionSchema = z.object({
  question: z.string(),
  why: z.string(),
  talkingPoints: z.array(z.string()),
});
export const InterviewPrepSchema = z.object({
  technical: z.array(InterviewQuestionSchema),
  behavioral: z.array(InterviewQuestionSchema),
  experience: z.array(InterviewQuestionSchema),
  gaps: z.array(InterviewQuestionSchema),
  askThem: z.array(z.string()),
});
export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>;
export type InterviewPrep = z.infer<typeof InterviewPrepSchema>;

/* ───────── Assistant chat ───────── */

/** A structured, reviewable change the assistant proposes. Never applied without the user's approval.
    Flat shape (unused fields are "") so it works cleanly with structured outputs and validation. */
export const ASSISTANT_ACTION_TYPES = ["replace_summary", "update_bullet", "add_bullet", "add_skill", "update_headline"] as const;
export const AssistantActionSchema = z.object({
  type: z.enum(ASSISTANT_ACTION_TYPES),
  section: z.string(),
  itemId: z.string(),
  bulletId: z.string(),
  oldText: z.string(),
  newText: z.string(),
  label: z.string(),
});
export type AssistantAction = z.infer<typeof AssistantActionSchema>;

/** What the user is currently working on in the editor (GLOBAL vs SECTION-SPECIFIC requests). */
export interface AssistantSelection {
  scope: "global" | "section" | "entry" | "bullet";
  section?: string;
  itemId?: string;
  bulletId?: string;
  label?: string;
}

export interface AssistantJobContext {
  title: string;
  company: string;
  analysis: JobAnalysis;
  match: MatchResult | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: AssistantAction[];
  actionState?: Record<number, "applied" | "rejected">;
  followUps?: string[];
  note?: string;
  error?: boolean;
}

export const ChatReplySchema = z.object({
  reply: z.string(),
  actions: z.array(AssistantActionSchema),
  followUps: z.array(z.string()),
});
export type ChatReply = z.infer<typeof ChatReplySchema>;

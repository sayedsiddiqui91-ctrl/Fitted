import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { CVContent, Design, Layout } from "@/lib/cv/schema";
import { emptyContent, newAward, newBullet, newCertification, newCustomItem, newCustomSection, newEducation, newExperience, newLanguage, newProject, newSkill, newVolunteer } from "@/lib/cv/defaults";
import {
  ChatReplySchema,
  InterviewPrepSchema,
  JobAnalysisSchema,
  type ChatMessage,
  type ChatReply,
  type Change,
  type InterviewPrep,
  type JobAnalysis,
  type MatchResult,
  type OptimizationPlan,
  type OptimizeMode,
  type Question,
  type ReviewResult,
} from "@/lib/ai/types";
import { analyzeCV } from "@/lib/engine/cvAnalysis";
import { validateAction } from "@/lib/engine/assistantActions";
import type { AssistantSelection } from "@/lib/ai/types";
import { guardPlan, makeChange, optimizeStructure } from "@/lib/engine/optimize";
import { validatePlan } from "@/lib/engine/sectionValidator";
import { reviewCV } from "@/lib/engine/review";
import type { ParseResult } from "@/lib/engine/parseResume";
import { uid } from "@/lib/utils";
import { ANALYZE_JOB_SYSTEM, CHAT_SYSTEM, INTERVIEW_SYSTEM, OPTIMIZE_SYSTEM, PARSE_SYSTEM, REVIEW_SYSTEM } from "./prompts";

/* Claude provider. Each task is a separate, focused function with a
   structured (zod-validated) output. Output is never trusted blindly:
   every text change is re-checked by the local truthfulness guard. */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export function claudeEnabled(): boolean {
  if (process.env.FITTED_DISABLE_CLAUDE === "1") return false;
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
export const claudeModel = () => MODEL;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ maxRetries: 2, timeout: 150_000 }));

export class AIError extends Error {}

async function structured<S extends z.ZodType>(schema: S, system: string, user: string, effort: "low" | "medium" | "high" = "medium"): Promise<z.infer<S>> {
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // Server-side fallbacks: if a request is declined, the API re-routes it automatically.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort, format: betaZodOutputFormat(schema) },
  });
  if (res.stop_reason === "refusal") throw new AIError("refused");
  if (res.stop_reason === "max_tokens") throw new AIError("truncated");
  if (res.parsed_output == null) throw new AIError("unparseable");
  return schema.parse(res.parsed_output);
}

/* Compact, id-annotated CV representation for prompts */
function cvForPrompt(c: CVContent) {
  return JSON.stringify({
    headline: c.personal.headline,
    summary: c.summary,
    experience: c.experience.map((e) => ({ id: e.id, role: e.role, company: e.company, dates: `${e.startDate} – ${e.current ? "Present" : e.endDate}`, bullets: e.bullets.filter((b) => b.text.trim()).map((b) => ({ bulletId: b.id, text: b.text })) })),
    projects: c.projects.map((p) => ({ id: p.id, name: p.name, role: p.role, bullets: p.bullets.filter((b) => b.text.trim()).map((b) => ({ bulletId: b.id, text: b.text })) })),
    volunteer: c.volunteer.map((v) => ({ id: v.id, role: v.role, organization: v.organization, bullets: v.bullets.filter((b) => b.text.trim()).map((b) => ({ bulletId: b.id, text: b.text })) })),
    education: c.education.map((e) => ({ degree: e.degree, field: e.field, school: e.school, dates: `${e.startDate} – ${e.endDate}`, details: e.bullets.map((b) => b.text) })),
    skills: c.skills.map((s) => ({ id: s.id, name: s.name })),
    certifications: c.certifications.map((x) => `${x.name} ${x.issuer}`.trim()),
    awards: c.awards.map((x) => x.title),
    languages: c.languages.map((l) => `${l.name} ${l.proficiency}`.trim()),
  });
}

/* ───────── analyzeJobDescription ───────── */
export function analyzeJobDescription(text: string): Promise<JobAnalysis> {
  return structured(JobAnalysisSchema, ANALYZE_JOB_SYSTEM, `<job_description>\n${text}\n</job_description>`, "low");
}

/* ───────── generateOptimizationSuggestions ───────── */
const ClaudeOptimizeSchema = z.object({
  summary: z.object({ after: z.string(), reasons: z.array(z.string()) }).nullable(),
  bullets: z.array(z.object({ bulletId: z.string(), after: z.string(), reasons: z.array(z.string()), basis: z.enum(["fact", "inference"]) })),
  skillOrder: z.array(z.string()),
  addSkills: z.array(z.object({ name: z.string(), evidence: z.string() })),
  questions: z.array(z.object({ keyword: z.string(), prompt: z.string(), context: z.string() })),
  metricQuestions: z.array(z.object({ bulletId: z.string(), prompt: z.string(), options: z.array(z.string()), unit: z.enum(["count", "percent", "people", "money"]), noun: z.string() })),
});

export async function generateOptimizationSuggestions(input: { content: CVContent; layout: Layout; design: Design; job: JobAnalysis; match: MatchResult; mode: OptimizeMode; jobText: string }): Promise<OptimizationPlan> {
  const { content, job, match, mode } = input;
  // Only candidate-relevant parts of the job go to the model; metadata is listed as off-limits
  const { location, salary, employmentType, workArrangement, applicationInstructions, companyDescription, ...candidateRelevant } = job;
  void companyDescription;
  const user = `Optimization mode: ${mode}

<job_analysis>${JSON.stringify(candidateRelevant)}</job_analysis>
<never_put_in_cv>${JSON.stringify({ company: job.company, location, salary, employmentType, workArrangement, applicationInstructions })}</never_put_in_cv>
<requirement_evidence>${JSON.stringify((match.requirements ?? []).map((r) => ({ requirement: r.requirement, status: r.status, evidence: r.evidence ?? null })))}</requirement_evidence>

<keyword_insights>
Already in CV: ${match.keywords.have.map((k) => k.term).join(", ") || "none"}
Possibly related (ask, don't add): ${match.keywords.canAdd.map((k) => k.term).join(", ") || "none"}
Not in CV (never add): ${match.keywords.doNotAdd.map((k) => k.term).join(", ") || "none"}
</keyword_insights>

<cv>${cvForPrompt(content)}</cv>`;
  const out = await structured(ClaudeOptimizeSchema, OPTIMIZE_SYSTEM, user, mode === "aggressive" ? "high" : "medium");

  const facts = analyzeCV(content);
  const changes: Change[] = [];
  if (out.summary && out.summary.after.trim() && out.summary.after.trim() !== content.summary.trim()) {
    changes.push(makeChange({ kind: "summary", section: "summary", label: content.summary ? "Professional summary" : "New professional summary", target: {}, before: content.summary, after: out.summary.after.trim(), reasons: out.summary.reasons.slice(0, 3), basis: "fact", category: "safe" }));
  }
  for (const b of out.bullets) {
    const ref = facts.bullets.find((x) => x.bulletId === b.bulletId);
    if (!ref || ref.section === "education" || b.after.trim() === ref.text.trim()) continue;
    const inference = b.basis === "inference";
    changes.push(
      makeChange({
        kind: "bullet",
        section: ref.section,
        label: ref.label,
        target: { itemId: ref.itemId, bulletId: ref.bulletId },
        before: ref.text,
        after: b.after.trim(),
        reasons: b.reasons.slice(0, 3),
        basis: inference ? "inference" : "fact",
        category: inference ? "clarify" : "safe",
        warning: inference ? "This rewrite includes an assumption. Only accept it if it's accurate." : undefined,
      }),
    );
  }
  const ids = content.skills.map((s) => s.id);
  const order = out.skillOrder.filter((id) => ids.includes(id));
  if (order.length >= Math.min(ids.length, 2) && order.some((id, i) => id !== ids[i]) && !content.skills.some((s) => s.group.trim())) {
    const sorted = [...order.map((id) => content.skills.find((s) => s.id === id)!), ...content.skills.filter((s) => !order.includes(s.id))];
    changes.push(makeChange({ kind: "skills", section: "skills", label: "Skills order", target: {}, before: content.skills.map((s) => s.name).join(", "), after: sorted.map((s) => s.name).join(", "), beforeList: content.skills.map((s) => s.name), afterList: sorted.map((s) => s.name), payload: { skills: sorted }, reasons: ["Puts the skills this job asks for first"], basis: "fact", category: "safe" }));
  }
  for (const s of out.addSkills) {
    if (content.skills.some((x) => x.name.toLowerCase() === s.name.toLowerCase())) continue;
    changes.push(makeChange({ kind: "add-skill", section: "skills", label: "Add skill", target: {}, before: "", after: s.name, payload: { skill: newSkill(s.name) }, reasons: [`Already shown in your CV: “${s.evidence.slice(0, 90)}”`], basis: "fact", category: "safe" }));
  }
  changes.push(...optimizeStructure({ content: input.content, layout: input.layout, design: input.design }, facts, job, mode));

  const questions: Question[] = [
    ...out.questions.slice(0, 5).map((q) => ({ id: uid("q"), kind: "skill" as const, keyword: q.keyword, prompt: q.prompt, context: q.context, importance: job.requiredSkills.includes(q.keyword) ? ("required" as const) : ("preferred" as const), options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" }] })),
    ...out.metricQuestions
      .slice(0, 4)
      .map((q) => {
        const ref = facts.bullets.find((x) => x.bulletId === q.bulletId);
        if (!ref) return null;
        return { id: uid("q"), kind: "metric" as const, prompt: q.prompt, context: ref.text, section: ref.section, itemId: ref.itemId, bulletId: ref.bulletId, unit: q.unit, noun: q.noun, options: [...q.options.slice(0, 5).map((o) => ({ value: o, label: o })), { value: "unknown", label: "I don't know" }] };
      })
      .filter((q): q is NonNullable<typeof q> => q !== null),
  ];

  // Never trust raw model output: truth guard, then section-aware quality check
  return validatePlan(guardPlan({ changes, questions, doNotAdd: match.keywords.doNotAdd, notes: [] }, content, job), content, job);
}

/* ───────── reviewCV ───────── */
const ClaudeReviewSchema = z.object({
  score: z.number(),
  items: z.array(z.object({ severity: z.enum(["good", "warn", "issue"]), category: z.string(), title: z.string(), detail: z.string(), section: z.string(), examples: z.array(z.string()) })),
});

export async function reviewCVWithClaude(content: CVContent, design: Design, pages: number): Promise<ReviewResult> {
  const local = reviewCV(content, design, pages);
  const out = await structured(ClaudeReviewSchema, REVIEW_SYSTEM, `Estimated page count: ${pages}\n<cv>${cvForPrompt(content)}</cv>\n<contact>${JSON.stringify({ name: !!content.personal.fullName, email: !!content.personal.email, phone: !!content.personal.phone, location: !!content.personal.location, linkedin: !!content.personal.linkedin })}</contact>`, "medium");
  const objective = local.items.filter((i) => ["Completeness", "ATS", "Length"].includes(i.category));
  const items = [...out.items.map((i) => ({ ...i, id: uid("r"), section: i.section || undefined })), ...objective.filter((o) => !out.items.some((i) => i.title.toLowerCase() === o.title.toLowerCase()))];
  const order = { issue: 0, warn: 1, good: 2 };
  items.sort((a, b) => order[a.severity] - order[b.severity]);
  const score = Math.round((Math.max(0, Math.min(100, out.score)) + local.score) / 2);
  return { score, categories: local.categories, items };
}

/* ───────── generateInterviewQuestions ───────── */
export function generateInterviewQuestions(content: CVContent, job: JobAnalysis, jobText: string): Promise<InterviewPrep> {
  return structured(InterviewPrepSchema, INTERVIEW_SYSTEM, `<job_description>\n${jobText.slice(0, 20000)}\n</job_description>\n<job_analysis>${JSON.stringify(job)}</job_analysis>\n<cv>${cvForPrompt(content)}</cv>`, "medium");
}

/* ───────── assistant chat ───────── */
export interface ChatJob {
  title: string;
  company: string;
  analysis: Partial<JobAnalysis>;
  match: { overall?: number; breakdown?: unknown; weakAreas?: string[]; keywords?: { have?: { term: string }[]; canAdd?: { term: string }[]; doNotAdd?: { term: string }[] } } | null;
}

export async function assistantChat(history: ChatMessage[], content: CVContent, selection: AssistantSelection, job: ChatJob | null, template: string): Promise<ChatReply> {
  const transcript = history.map((m) => `${m.role === "user" ? "Candidate" : "Assistant"}: ${m.content}`).join("\n\n");
  // Resolve the selection to real CV text so the model knows exactly what "this" means
  const facts = analyzeCV(content);
  const sel = {
    ...selection,
    text: selection.bulletId ? facts.bullets.find((b) => b.bulletId === selection.bulletId)?.text : selection.section === "summary" ? content.summary : undefined,
  };
  const jobCtx = job
    ? {
        title: job.title,
        company: job.company,
        seniority: job.analysis.seniority,
        requiredSkills: job.analysis.requiredSkills,
        preferredSkills: job.analysis.preferredSkills,
        responsibilities: job.analysis.responsibilities,
        yearsExperience: job.analysis.yearsExperience,
        degreeLevel: job.analysis.degreeLevel,
        estimatedMatch: job.match?.overall,
        matchBreakdown: job.match?.breakdown,
        weakAreas: job.match?.weakAreas,
        keywordsInCV: job.match?.keywords?.have?.map((k) => k.term),
        relatedButUnconfirmed: job.match?.keywords?.canAdd?.map((k) => k.term),
        notInCV: job.match?.keywords?.doNotAdd?.map((k) => k.term),
      }
    : null;
  const user = `<cv>${cvForPrompt(content)}</cv>
<selection>${JSON.stringify(sel)}</selection>
<job>${jobCtx ? JSON.stringify(jobCtx) : "none"}</job>
<template>${template}</template>
<conversation>
${transcript}
</conversation>
Reply to the candidate's last message.`;
  const out = await structured(ChatReplySchema, CHAT_SYSTEM, user, "low");

  // Server-side validation of every proposed action
  const userFacts = history.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const forbidden = job ? [job.company, job.analysis.location ?? ""].filter((x): x is string => !!x) : [];
  const valid = [];
  const dropped: string[] = [];
  for (const a of out.actions) {
    const v = validateAction(a, content, userFacts, forbidden);
    if (v.ok) valid.push(v.action);
    else if (v.problem && v.problem !== "No change.") dropped.push(v.problem);
  }
  const note = dropped.length ? `\n\n(I held back ${dropped.length} suggestion${dropped.length === 1 ? "" : "s"}: ${dropped[0]})` : "";
  return { reply: out.reply + note, actions: valid, followUps: out.followUps.slice(0, 4) };
}

/* ───────── CV import structuring ───────── */
const ImportSchema = z.object({
  personal: z.object({ fullName: z.string(), headline: z.string(), email: z.string(), phone: z.string(), location: z.string(), website: z.string(), linkedin: z.string() }),
  summary: z.string(),
  experience: z.array(z.object({ role: z.string(), company: z.string(), location: z.string(), startDate: z.string(), endDate: z.string(), current: z.boolean(), bullets: z.array(z.string()) })),
  education: z.array(z.object({ degree: z.string(), field: z.string(), school: z.string(), location: z.string(), startDate: z.string(), endDate: z.string(), grade: z.string(), details: z.array(z.string()) })),
  skills: z.array(z.object({ name: z.string(), group: z.string() })),
  projects: z.array(z.object({ name: z.string(), role: z.string(), link: z.string(), startDate: z.string(), endDate: z.string(), bullets: z.array(z.string()) })),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string(), date: z.string() })),
  awards: z.array(z.object({ title: z.string(), issuer: z.string(), date: z.string(), description: z.string() })),
  volunteer: z.array(z.object({ role: z.string(), organization: z.string(), location: z.string(), startDate: z.string(), endDate: z.string(), current: z.boolean(), bullets: z.array(z.string()) })),
  languages: z.array(z.object({ name: z.string(), proficiency: z.string() })),
  customSections: z.array(z.object({ title: z.string(), items: z.array(z.string()) })),
});

export async function parseResumeWithClaude(text: string): Promise<ParseResult> {
  const d = await structured(ImportSchema, PARSE_SYSTEM, `<resume_text>\n${text.slice(0, 60000)}\n</resume_text>`, "low");
  const c = emptyContent();
  c.personal = { ...c.personal, ...d.personal, links: [] };
  c.summary = d.summary;
  c.experience = d.experience.map((e) => ({ ...newExperience(), ...e, bullets: e.bullets.map((b) => newBullet(b)) }));
  c.education = d.education.map((e) => ({ ...newEducation(), degree: e.degree, field: e.field, school: e.school, location: e.location, startDate: e.startDate, endDate: e.endDate, grade: e.grade, bullets: e.details.map((b) => newBullet(b)) }));
  c.skills = d.skills.map((s) => newSkill(s.name, s.group));
  c.projects = d.projects.map((p) => ({ ...newProject(), ...p, bullets: p.bullets.map((b) => newBullet(b)) }));
  c.certifications = d.certifications.map((x) => ({ ...newCertification(), ...x }));
  c.awards = d.awards.map((x) => ({ ...newAward(), ...x }));
  c.volunteer = d.volunteer.map((v) => ({ ...newVolunteer(), ...v, bullets: v.bullets.map((b) => newBullet(b)) }));
  c.languages = d.languages.map((l) => ({ ...newLanguage(), ...l }));
  c.custom = d.customSections.map((s) => ({ ...newCustomSection(s.title), items: s.items.map((t) => ({ ...newCustomItem(), description: t })) }));
  const warnings: string[] = [];
  if (!c.personal.fullName) warnings.push("We couldn't detect your name — please add it.");
  if (!c.experience.length) warnings.push("No work experience was detected.");
  return { content: c, warnings, stats: { sections: 0, experience: c.experience.length, education: c.education.length, skills: c.skills.length } };
}

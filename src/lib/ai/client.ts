"use client";

import type { z } from "zod";
import type { CVContent, CVDoc, Design } from "@/lib/cv/schema";
import { useStore } from "@/lib/store";
import { calculateJobMatch } from "@/lib/engine/match";
import { validateAction } from "@/lib/engine/assistantActions";
import { validatePlan } from "@/lib/engine/sectionValidator";
import {
  type AssistantJobContext,
  type AssistantSelection,
  ChatReplySchema,
  InterviewPrepSchema,
  JobAnalysisSchema,
  ReviewResultSchema,
  type ChatMessage,
  type ChatReply,
  type EngineKind,
  type InterviewPrep,
  type JobAnalysis,
  type MatchResult,
  type OptimizationPlan,
  type OptimizeMode,
  type ReviewResult,
} from "./types";
import { analyzeJobDescription } from "@/lib/engine/jobAnalysis";
import { generateOptimizationSuggestions, guardPlan } from "@/lib/engine/optimize";
import { reviewCV } from "@/lib/engine/review";
import { generateInterviewQuestions } from "@/lib/engine/interview";
import { localAssistant } from "@/lib/engine/assistant";
import { keepUncovered, layoutFromSections, parseResumeText, type ParseResult } from "@/lib/engine/parseResume";
import { CVContentSchema } from "@/lib/cv/schema";

/* Hybrid AI facade.
   - If the server has an Anthropic key and the user hasn't chosen on-device mode,
     tasks run on Claude via /api/ai/<task>.
   - Otherwise (or on any failure) the on-device engine runs instantly and privately.
   Every response is schema-validated before use. */

export interface AIStatus {
  claude: boolean;
  model: string | null;
}

let statusPromise: Promise<AIStatus> | null = null;
export function getAIStatus(): Promise<AIStatus> {
  if (!statusPromise) {
    statusPromise = fetch("/api/ai/status", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<AIStatus>) : { claude: false, model: null }))
      .catch(() => ({ claude: false, model: null }));
  }
  return statusPromise;
}

export interface AIResult<T> {
  result: T;
  engine: EngineKind;
  fellBack: boolean;
}

async function run<T>(task: string, payload: unknown, local: () => T, validate?: z.ZodType<T>, timeoutMs = 120_000): Promise<AIResult<T>> {
  const pref = useStore.getState().settings.aiEngine;
  if (pref === "local") return { result: local(), engine: "local", fellBack: false };
  const status = await getAIStatus();
  if (!status.claude) return { result: local(), engine: "local", fellBack: false };
  try {
    const res = await fetch(`/api/ai/${task}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`ai ${res.status}`);
    const json = (await res.json()) as { result: unknown };
    const result = validate ? validate.parse(json.result) : (json.result as T);
    return { result, engine: "claude", fellBack: false };
  } catch {
    return { result: local(), engine: "local", fellBack: true };
  }
}

/** Minimum duration so staged progress feels deliberate rather than flickering. */
export async function withMinDuration<T>(p: Promise<T>, ms = 900): Promise<T> {
  const [r] = await Promise.all([p, new Promise((res) => setTimeout(res, ms))]);
  return r;
}

export function analyzeJob(text: string) {
  return run<JobAnalysis>("analyze-job", { text }, () => analyzeJobDescription(text), JobAnalysisSchema, 60_000);
}

export function optimizeCV(doc: Pick<CVDoc, "content" | "layout" | "design">, job: JobAnalysis, match: MatchResult, mode: OptimizeMode, jobText: string) {
  return run<OptimizationPlan>(
    "optimize",
    { content: doc.content, layout: doc.layout, design: doc.design, job, match, mode, jobText },
    () => generateOptimizationSuggestions(doc, job, match, mode),
    undefined,
    150_000,
  ).then((r) => ({ ...r, result: validatePlan(guardPlan(r.result, doc.content, job), doc.content, job) }));
}

export function reviewMyCV(content: CVContent, design: Design, pages: number) {
  return run<ReviewResult>("review", { content, design, pages }, () => reviewCV(content, design, pages), ReviewResultSchema as z.ZodType<ReviewResult>, 90_000);
}

export function interviewPrep(content: CVContent, job: JobAnalysis, match: MatchResult | null, jobText: string) {
  return run<InterviewPrep>("interview", { content, job, match, jobText }, () => generateInterviewQuestions(content, job, match), InterviewPrepSchema, 90_000);
}

export interface AssistantRequest {
  content: CVContent;
  design: Design;
  selection: AssistantSelection;
  job: AssistantJobContext | null;
}

/** Sends the assistant structured context (CV, selection, job, template) — not one text blob. */
export async function assistantReply(history: ChatMessage[], req: AssistantRequest): Promise<AIResult<ChatReply>> {
  const job = req.job ? { ...req.job, match: req.job.match ?? calculateJobMatch(req.content, req.design, req.job.analysis) } : null;
  const clean = history.filter((m) => !m.error).slice(-12).map((m) => ({ role: m.role, content: m.content }));
  const r = await run<ChatReply>(
    "chat",
    { history: clean, content: req.content, selection: req.selection, job, template: req.design.template },
    () => localAssistant(clean, { content: req.content, selection: req.selection, job, design: req.design }),
    ChatReplySchema,
    60_000,
  );
  // Never trust actions blindly — re-validate against the CV as it is right now.
  const facts = clean.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const forbidden = job ? [job.company, job.analysis.location ?? ""].filter(Boolean) : [];
  const actions = r.result.actions.map((a) => validateAction(a, req.content, facts, forbidden)).filter((v) => v.ok).map((v) => v.action);
  return { ...r, result: { ...r.result, actions } };
}

export async function parseResume(text: string): Promise<AIResult<ParseResult>> {
  const local = () => parseResumeText(text);
  const r = await run<ParseResult>("parse", { text }, local, undefined, 90_000);
  if (r.engine === "claude") {
    const ok = CVContentSchema.safeParse(r.result.content);
    if (!ok.success) return { result: local(), engine: "local", fellBack: true };
    // Keep the original's section order/titles, and anything the model left out
    const loc = local();
    const content = r.result.content;
    const kept = keepUncovered(text, content);
    const sections = [...(loc.sections ?? []), ...(kept.customId ? [{ kind: "custom" as const, title: "Additional Information", customId: kept.customId }] : [])];
    const warnings = [...(r.result.warnings ?? []), ...(kept.count ? [`${kept.count} line${kept.count === 1 ? "" : "s"} weren't placed in a section, so we kept them under “Additional Information”.`] : [])];
    return { ...r, result: { ...r.result, content, warnings, sections, layout: layoutFromSections(sections, content) } };
  }
  return r;
}

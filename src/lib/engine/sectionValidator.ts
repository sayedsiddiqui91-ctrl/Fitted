import type { CVContent } from "@/lib/cv/schema";
import type { Change, JobAnalysis, OptimizationPlan, RejectedSuggestion } from "@/lib/ai/types";
import { forbiddenJobTerms, JOB_META_PHRASES } from "./jobMeta";
import { indexText, lookupTerm, textHasTerm, wordCount } from "./text";
import { verbFromAny } from "./verbs";
import { addedContactDetail } from "./personalInfo";

/* Section-aware quality check. Every proposed change must pass:
   1 true · 2 supported by the CV (checked by guard.ts) · 3 relevant · 4 belongs in this section ·
   5 natural · 6 readable · 7 not repetitive · 8 not keyword stuffing · 9 useful to a recruiter. */

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function jobKeywordCount(text: string, job: JobAnalysis): number {
  const idx = indexText(text);
  const terms = [...new Set([...job.requiredSkills, ...job.preferredSkills, ...job.keywords])];
  return terms.filter((t) => textHasTerm(idx, t)).length;
}

function repeatsTerm(text: string): string | null {
  const words = norm(text).match(/[a-z][a-z&+#-]{3,}/g) ?? [];
  const seen = new Map<string, number>();
  const STOP = new Set(["with", "from", "that", "this", "their", "including", "across", "experience", "years"]);
  for (const w of words) if (!STOP.has(w)) seen.set(w, (seen.get(w) ?? 0) + 1);
  const rep = [...seen.entries()].find(([, n]) => n >= 3);
  return rep ? rep[0] : null;
}

export interface SectionCheck {
  ok: boolean;
  reason?: string;
}

export function validateSectionChange(c: Change, content: CVContent, job: JobAnalysis): SectionCheck {
  if (c.kind === "bullet-order" || c.kind === "section-order" || c.kind === "item-order") return { ok: true };
  const after = c.after.trim();
  const before = c.before.trim();
  const fail = (reason: string): SectionCheck => ({ ok: false, reason });

  // Q4 (all sections): job metadata never belongs in the CV
  const forbidden = forbiddenJobTerms(job);
  const leaked = forbidden.find((f) => norm(after).includes(norm(f)) && !norm(before).includes(norm(f)));
  if (leaked) return fail(`It would add “${leaked}” from the job posting (company/location/salary details don't belong in your CV).`);
  if (JOB_META_PHRASES.test(after) && !JOB_META_PHRASES.test(before)) return fail("It contains job-posting wording (salary, location or application details).");
  // Q4: the candidate's own address/contact details belong in the header, never in summary/bullets/skills
  if (c.kind !== "skills") {
    const personal = addedContactDetail(after, before, content);
    if (personal) return fail(`It would put your address or contact details (“${personal}”) into the ${c.kind === "summary" ? "summary" : "CV text"} — those belong in the header only.`);
  }
  if (job.jobTitle && c.kind !== "skills" && norm(after).includes(norm(job.jobTitle)) && !norm(before).includes(norm(job.jobTitle)) && !content.experience.some((e) => norm(e.role) === norm(job.jobTitle))) {
    return fail(`It names the target job title (“${job.jobTitle}”), which you haven't held.`);
  }

  switch (c.kind) {
    case "summary": {
      const wc = wordCount(after);
      if (wc < 12) return fail("The summary would be too thin.");
      if (wc > 110) return fail("The summary would be too long for a recruiter to skim.");
      if (/\b(i|my|me)\b/i.test(after)) return fail("Summaries shouldn't use first person.");
      if (/\b(seeking|looking for|looking to join|apply(?:ing)? for)\b.*\b(role|position|job|opportunity)\b/i.test(after)) return fail("It turns the summary into a job application statement.");
      const rep = repeatsTerm(after);
      if (rep) return fail(`It repeats “${rep}” too often.`);
      // Q8: keyword stuffing — too large a share of the words are job keywords
      const kwAdded = jobKeywordCount(after, job) - jobKeywordCount(before, job);
      if (kwAdded > 7) return fail("It packs in too many job keywords to read naturally.");
      return { ok: true };
    }
    case "bullet": {
      const first = after.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
      if (!verbFromAny(first)) return fail("The rewritten bullet doesn't start with an action verb.");
      if (wordCount(after) > 40) return fail("The rewritten bullet is too long.");
      if (wordCount(after) > wordCount(before) + 12) return fail("It adds a lot of words without adding facts.");
      if (jobKeywordCount(after, job) - jobKeywordCount(before, job) > 2) return fail("It inserts job keywords the bullet didn't need (keyword stuffing).");
      const rep = repeatsTerm(after);
      if (rep && !repeatsTerm(before)) return fail(`It repeats “${rep}”.`);
      return { ok: true };
    }
    case "add-bullet": {
      if (wordCount(after) > 45) return fail("The new bullet is too long.");
      return { ok: true };
    }
    case "add-skill": {
      const name = after;
      if (wordCount(name) > 4 || name.length > 40) return fail(`“${name}” isn't a concise skill.`);
      if (/\d{2,}|[@/]|\b(street|road|office|company|inc|ltd|pty)\b/i.test(name)) return fail(`“${name}” isn't a skill.`);
      if (content.skills.some((s) => norm(s.name) === norm(name))) return fail(`“${name}” is already in your skills.`);
      const known = !!lookupTerm(name) || [...job.requiredSkills, ...job.preferredSkills].some((t) => norm(t) === norm(name));
      if (!known && c.basis !== "user") return fail(`“${name}” isn't a recognizable skill for this job.`);
      return { ok: true };
    }
    case "skills":
      return { ok: true };
    default:
      return { ok: true };
  }
}

/** Filters a plan through the section-aware quality check; rejected suggestions are kept for transparency. */
export function validatePlan(plan: OptimizationPlan, content: CVContent, job: JobAnalysis): OptimizationPlan {
  const rejected: RejectedSuggestion[] = [...(plan.rejected ?? [])];
  const changes = plan.changes.filter((c) => {
    const v = validateSectionChange(c, content, job);
    if (!v.ok) rejected.push({ label: c.label, text: c.after, reason: v.reason ?? "Didn't pass the quality check." });
    return v.ok;
  });
  return { ...plan, changes, rejected };
}

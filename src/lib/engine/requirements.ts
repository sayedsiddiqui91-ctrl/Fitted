import type { CVContent } from "@/lib/cv/schema";
import type { Importance, JobAnalysis, RequirementEvidence } from "@/lib/ai/types";
import { degreeRank, evidenceFor, type CVFacts } from "./cvAnalysis";
import { INDUSTRIES } from "./lexicon";
import { findTerms, indexText, lookupTerm, relatedTerms, similarity } from "./text";

/* Requirement → evidence mapping.
   Each important job requirement is classified MATCHED / PARTIAL / MISSING
   with the CV evidence (or its absence) that justifies the call. */

const clip = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function responsibilityFit(resp: string, facts: CVFacts, summary: string): { score: number; best?: string } {
  let bestSim = similarity(resp, summary);
  let best: string | undefined;
  for (const b of facts.bullets) {
    const s = similarity(resp, b.text);
    if (s > bestSim) {
      bestSim = s;
      best = b.text;
    }
  }
  const terms = [...findTerms(indexText(resp), (t) => t.category === "tool" || t.category === "domain").keys()];
  const coverage = terms.length ? terms.filter((t) => evidenceFor(facts, t).status === "strong").length / terms.length : 0;
  return { score: Math.max(Math.min(1, bestSim / 0.36), coverage), best: bestSim > 0.12 ? best : undefined };
}

export function mapRequirements(content: CVContent, facts: CVFacts, job: JobAnalysis): RequirementEvidence[] {
  const out: RequirementEvidence[] = [];

  const skillReq = (t: string, importance: Importance) => {
    const lex = lookupTerm(t);
    const kind = lex?.category === "tool" ? "tool" : "skill";
    const ev = evidenceFor(facts, t);
    if (ev.status === "strong") return out.push({ requirement: t, kind, importance, status: "matched", evidence: ev.snippet ? clip(ev.snippet) : undefined, reason: "Shown in your experience" });
    if (ev.status === "listed") return out.push({ requirement: t, kind, importance, status: "partial", reason: "Listed in your skills, but not shown in any achievement" });
    if (ev.status === "mentioned") return out.push({ requirement: t, kind, importance, status: "partial", reason: `Mentioned in your ${ev.where}, not in your experience` });
    const related = lex ? relatedTerms(lex.canonical).filter((r) => evidenceFor(facts, r).status !== "none").slice(0, 2) : [];
    out.push({ requirement: t, kind, importance, status: "missing", reason: related.length ? `Not in your CV (you do show related ${related.join(" and ")})` : "Not found in your CV" });
  };
  job.requiredSkills.forEach((t) => skillReq(t, "required"));
  job.preferredSkills.forEach((t) => skillReq(t, "preferred"));

  if (job.yearsExperience != null) {
    const y = facts.years;
    const need = job.yearsExperience;
    out.push({
      requirement: `${need}+ years of experience`,
      kind: "experience",
      importance: "required",
      status: y >= need ? "matched" : y >= need / 2 ? "partial" : "missing",
      evidence: facts.months ? `About ${y >= 1 ? `${y} year${y === 1 ? "" : "s"}` : `${facts.months} months`} across ${content.experience.length} position${content.experience.length === 1 ? "" : "s"}` : undefined,
      reason: y >= need ? "Your dates show enough experience" : "Your CV dates show less experience than requested",
    });
  }

  if (job.degreeLevel !== "none" || job.educationFields.length) {
    const levelOk = job.degreeLevel === "none" || degreeRank(facts.degreeLevel) >= degreeRank(job.degreeLevel);
    const fieldText = content.education.map((e) => `${e.degree} ${e.field}`).join(" ");
    const fieldOk = !job.educationFields.length || job.educationFields.some((f) => similarity(f, fieldText) > 0.3 || fieldText.toLowerCase().includes(f.toLowerCase()));
    const label = [job.degreeLevel !== "none" ? `${job.degreeLevel === "phd" ? "PhD" : `${job.degreeLevel[0].toUpperCase()}${job.degreeLevel.slice(1)}'s`} degree` : "Degree", job.educationFields.length ? `in ${job.educationFields.slice(0, 3).join(" / ")}` : ""].filter(Boolean).join(" ");
    const e = content.education[0];
    out.push({
      requirement: label,
      kind: "education",
      importance: "required",
      status: !facts.hasEducation ? "missing" : levelOk && fieldOk ? "matched" : levelOk || fieldOk ? "partial" : "missing",
      evidence: e ? [e.degree, e.field, e.school].filter(Boolean).join(", ") : undefined,
      reason: !facts.hasEducation ? "No education listed" : levelOk && fieldOk ? "Meets the education requirement" : levelOk ? "Degree level fits; field differs" : "Degree level below the requirement",
    });
  }

  const certTerms = [...findTerms(indexText(job.qualifications.join("\n")), (t) => t.category === "certification").values()].map((v) => v.term.canonical);
  const certText = indexText(content.certifications.map((c) => `${c.name} ${c.issuer}`).join("\n") + "\n" + content.education.map((e) => e.degree).join(" "));
  for (const c of certTerms) {
    const has = findTerms(certText, (t) => t.canonical === c).size > 0;
    out.push({ requirement: c, kind: "certification", importance: "required", status: has ? "matched" : "missing", reason: has ? "Listed in your certifications" : "Not in your certifications" });
  }

  for (const r of job.responsibilities.slice(0, 8)) {
    const fit = responsibilityFit(r, facts, content.summary);
    out.push({
      requirement: r,
      kind: "responsibility",
      importance: "keyword",
      status: fit.score >= 0.8 ? "matched" : fit.score >= 0.45 ? "partial" : "missing",
      evidence: fit.best ? clip(fit.best) : undefined,
      reason: fit.score >= 0.8 ? "Closely matches something you've done" : fit.score >= 0.45 ? "Related to your experience" : "Your CV doesn't show this yet",
    });
  }
  return out;
}

/** Share of the job's industry vocabulary present in the CV (null if the industry is unclear). */
export function industryScore(job: JobAnalysis, facts: CVFacts): number | null {
  const words = INDUSTRIES[job.industry];
  if (!words) return null;
  const text = facts.fullText.toLowerCase();
  const hits = words.filter((w) => new RegExp(`(^|[^a-z])${w.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(text)).length;
  return hits >= 2 ? 100 : hits === 1 ? 75 : 45;
}

/** How complete and well-structured the CV is (sections a recruiter expects). */
export function structureScore(content: CVContent): number {
  let s = 0;
  if (content.summary.trim().split(/\s+/).length >= 15) s += 20;
  else if (content.summary.trim()) s += 10;
  if (content.experience.length) s += content.experience.every((e) => e.startDate.trim()) ? 25 : 15;
  const bulletCounts = content.experience.map((e) => e.bullets.filter((b) => b.text.trim()).length);
  if (bulletCounts.length && bulletCounts.every((n) => n >= 2)) s += 20;
  else if (bulletCounts.some((n) => n >= 1)) s += 10;
  if (content.education.length) s += 15;
  if (content.skills.length >= 4) s += 20;
  else if (content.skills.length) s += 10;
  return s;
}

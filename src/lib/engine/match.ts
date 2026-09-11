import type { CVContent, Design } from "@/lib/cv/schema";
import type { Importance, JobAnalysis, KeywordHit, MatchResult } from "@/lib/ai/types";
import { analyzeCV, degreeRank, evidenceFor, type CVFacts } from "./cvAnalysis";
import { findTerms, lookupTerm, relatedTerms, similarity, stemSet, indexText, uniqueBy } from "./text";
import { formattingScore } from "./review";
import { industryScore, mapRequirements, structureScore } from "./requirements";

const W: Record<Importance, number> = { required: 3, preferred: 1.5, keyword: 1 };
const EV_SCORE = { strong: 1, listed: 0.8, mentioned: 0.65, none: 0 } as const;

interface TermEntry {
  term: string;
  importance: Importance;
  soft?: boolean;
}

function termUniverse(job: JobAnalysis): TermEntry[] {
  const all: TermEntry[] = [
    ...job.requiredSkills.map((t) => ({ term: t, importance: "required" as const })),
    ...job.preferredSkills.map((t) => ({ term: t, importance: "preferred" as const })),
    ...job.keywords.map((t) => ({ term: t, importance: "keyword" as const })),
    ...job.softSkills.map((t) => ({ term: t, importance: "keyword" as const, soft: true })),
  ];
  // The employer's own name is never a skill or keyword gap
  const company = (job.company ?? "").trim().toLowerCase();
  const notCompany = (e: TermEntry) => {
    const t = e.term.trim().toLowerCase();
    return !company || company.length < 3 || (t !== company && !(t.length >= 4 && company.includes(t)) && !t.includes(company));
  };
  return uniqueBy(all.filter(notCompany), (e) => (lookupTerm(e.term)?.canonical ?? e.term).toLowerCase());
}

/** Classifies every job keyword into: have (FACT) / can incorporate (INFERENCE — ask) / do not add. */
export function identifyMissingKeywords(facts: CVFacts, job: JobAnalysis): MatchResult["keywords"] {
  const have: KeywordHit[] = [];
  const canAdd: KeywordHit[] = [];
  const doNotAdd: KeywordHit[] = [];

  for (const { term, importance, soft } of termUniverse(job)) {
    const ev = evidenceFor(facts, term);
    if (ev.status !== "none") {
      have.push({ term, importance, evidence: ev.snippet ?? (ev.where === "skills" ? "Listed in your skills" : `Mentioned in your ${ev.where}`) });
      continue;
    }
    // Soft skills are shown through achievements, not keywords — don't list them as gaps
    if (soft || lookupTerm(term)?.category === "soft") continue;
    const lex = lookupTerm(term);
    const related = lex ? relatedTerms(lex.canonical).filter((r) => evidenceFor(facts, r).status !== "none") : [];
    // Unknown multi-word phrase whose words all appear in a single bullet → related wording exists
    let phraseEvidence: string | undefined;
    if (!lex) {
      const words = stemSet(term);
      if (words.size >= 2) {
        const b = facts.bullets.find((x) => {
          const s = stemSet(x.text);
          return [...words].every((w) => s.has(w));
        });
        phraseEvidence = b?.text;
      }
    }
    if (related.length || phraseEvidence) {
      canAdd.push({ term, importance, related: related.slice(0, 3), evidence: phraseEvidence });
    } else {
      doNotAdd.push({ term, importance });
    }
  }
  const byImp = (a: KeywordHit, b: KeywordHit) => W[b.importance] - W[a.importance];
  return { have: have.sort(byImp), canAdd: canAdd.sort(byImp), doNotAdd: doNotAdd.sort(byImp) };
}

export function calculateJobMatch(content: CVContent, design: Design, job: JobAnalysis, pages = 1): MatchResult {
  const facts = analyzeCV(content);
  const keywords = identifyMissingKeywords(facts, job);
  const universe = termUniverse(job);

  // Keyword match — weighted by importance and strength of evidence
  let num = 0;
  let den = 0;
  for (const e of universe) {
    const w = W[e.importance] * (e.soft ? 0.5 : 1);
    den += w;
    num += w * EV_SCORE[evidenceFor(facts, e.term).status];
  }
  const keyword = den ? (num / den) * 100 : 70;

  // Skills match — required coverage dominates
  const cov = (list: string[]) =>
    list.length ? list.reduce((s, t) => s + EV_SCORE[evidenceFor(facts, t).status], 0) / list.length : null;
  const req = cov(job.requiredSkills);
  const pref = cov(job.preferredSkills);
  const skills = req == null && pref == null ? keyword : ((req ?? pref ?? 0) * (pref == null || req == null ? 1 : 0.8) + (req != null && pref != null ? pref * 0.2 : 0)) * 100;

  // Experience relevance — responsibilities vs. bullets, adjusted for years
  let experience: number;
  if (!facts.bullets.length) {
    experience = job.seniority === "Internship" || job.seniority === "Entry-level" ? 45 : 15;
  } else if (job.responsibilities.length) {
    const scores = job.responsibilities.map((r) => {
      const best = Math.max(...facts.bullets.map((b) => similarity(r, b.text)), similarity(r, content.summary));
      // also credit responsibilities whose skills are evidenced in the CV's experience
      const terms = [...findTerms(indexText(r), (t) => t.category === "tool" || t.category === "domain").keys()];
      const coverage = terms.length ? terms.filter((t) => evidenceFor(facts, t).status === "strong").length / terms.length : 0;
      return Math.max(Math.min(1, best / 0.36), coverage);
    });
    experience = (scores.reduce((a, b) => a + b, 0) / scores.length) * 100;
  } else {
    experience = keyword * 0.9;
  }
  let yearsNote: string | null = null;
  if (job.yearsExperience && facts.years < job.yearsExperience) {
    const ratio = facts.years / job.yearsExperience;
    experience *= 0.65 + 0.35 * ratio;
    yearsNote = `The role asks for ${job.yearsExperience}+ years of experience; your CV shows about ${facts.years > 0 ? `${facts.years} year${facts.years === 1 ? "" : "s"}` : "less than a year"}.`;
  }

  // Education match
  const educationApplicable = job.degreeLevel !== "none" || job.educationFields.length > 0;
  let education = 100;
  let eduStrong: string | null = null;
  let eduWeak: string | null = null;
  if (educationApplicable) {
    const levelOk = job.degreeLevel === "none" || degreeRank(facts.degreeLevel) >= degreeRank(job.degreeLevel);
    const fieldText = facts.degreeFields.join(" ") + " " + content.education.map((e) => e.degree).join(" ");
    const fieldOk = !job.educationFields.length || job.educationFields.some((f) => similarity(f, fieldText) > 0.3 || indexText(fieldText).lower.includes(f.toLowerCase()));
    if (!facts.hasEducation) {
      education = 30;
      eduWeak = "The role lists education requirements, but your CV has no education section.";
    } else if (levelOk && fieldOk) {
      education = 100;
      const e = content.education[0];
      eduStrong = [e?.degree, e?.field].filter(Boolean).join(" in ") || "Education meets the requirement";
    } else if (levelOk) {
      education = 78;
      eduWeak = `The role prefers a background in ${job.educationFields.join(" / ")}.`;
    } else if (facts.degreeLevel === "none") {
      education = 55;
      eduWeak = `The role asks for a ${job.degreeLevel}'s degree; your CV doesn't state the degree level clearly.`;
    } else {
      education = 40;
      eduWeak = `The role asks for a ${job.degreeLevel}'s degree.`;
    }
  }

  const formatting = formattingScore(content, design, pages);

  // Multi-dimensional estimate — not a keyword count
  const requirements = mapRequirements(content, facts, job);
  const pct = (list: typeof requirements) =>
    list.length ? (list.reduce((s, r) => s + (r.status === "matched" ? 1 : r.status === "partial" ? 0.5 : 0), 0) / list.length) * 100 : null;
  const required = pct(requirements.filter((r) => r.importance === "required" && (r.kind === "skill" || r.kind === "tool"))) ?? skills;
  const preferred = pct(requirements.filter((r) => r.importance === "preferred"));
  const responsibilities = pct(requirements.filter((r) => r.kind === "responsibility")) ?? experience;
  const certifications = pct(requirements.filter((r) => r.kind === "certification"));
  const industry = industryScore(job, facts);
  const structure = structureScore(content);

  const dims: [number | null, number][] = [
    [required, 0.22],
    [preferred, 0.06],
    [experience, 0.16],
    [responsibilities, 0.14],
    [educationApplicable ? education : null, 0.08],
    [certifications, 0.04],
    [industry, 0.05],
    [keyword, 0.12],
    [structure, 0.06],
    [formatting, 0.07],
  ];
  const active = dims.filter((d): d is [number, number] => d[0] != null);
  const wsum = active.reduce((s, d) => s + d[1], 0);
  const overall = active.reduce((s, [v, w]) => s + v * w, 0) / wsum;

  // Human-readable strengths & gaps
  const strongMatches: string[] = [];
  for (const k of keywords.have) {
    const ev = evidenceFor(facts, k.term);
    if (ev.status === "strong" && k.importance !== "keyword") strongMatches.push(k.term);
  }
  for (const k of keywords.have) if (strongMatches.length < 7 && !strongMatches.includes(k.term) && k.importance === "keyword") strongMatches.push(k.term);
  if (eduStrong) strongMatches.push(eduStrong);
  if (job.yearsExperience && facts.years >= job.yearsExperience) strongMatches.push(`${facts.years}+ years of experience`);

  const weakAreas: string[] = [];
  for (const t of job.requiredSkills) {
    const ev = evidenceFor(facts, t);
    if (ev.status === "listed") weakAreas.push(`${t} appears in your skills but isn't connected to any achievement.`);
  }
  for (const k of keywords.canAdd.filter((k) => k.importance === "required").slice(0, 3)) weakAreas.push(`${k.term} is not clearly demonstrated in your CV.`);
  for (const k of keywords.doNotAdd.filter((k) => k.importance === "required").slice(0, 3)) weakAreas.push(`${k.term} is required but doesn't appear in your CV.`);
  if (yearsNote) weakAreas.push(yearsNote);
  if (eduWeak) weakAreas.push(eduWeak);

  const r = (n: number) => Math.round(Math.max(0, Math.min(100, n)));
  const rn = (n: number | null) => (n == null ? null : r(n));
  return {
    overall: r(overall),
    breakdown: {
      keyword: r(keyword),
      skills: r(skills),
      experience: r(experience),
      education: r(education),
      formatting: r(formatting),
      required: r(required),
      preferred: rn(preferred),
      responsibilities: r(responsibilities),
      certifications: rn(certifications),
      industry: rn(industry),
      structure: r(structure),
    },
    requirements,
    educationApplicable,
    strongMatches: strongMatches.slice(0, 8),
    weakAreas: weakAreas.slice(0, 7),
    keywords,
  };
}

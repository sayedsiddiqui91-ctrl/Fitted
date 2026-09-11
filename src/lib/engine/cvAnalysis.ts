import type { CVContent } from "@/lib/cv/schema";
import { monthsBetween, parseLooseDate } from "@/lib/cv/dates";
import type { JobAnalysis } from "@/lib/ai/types";
import { findTerms, indexText, lookupTerm, textHasTerm, type TextIndex } from "./text";

export type Where = "experience" | "projects" | "volunteer" | "skills" | "summary" | "education" | "certifications" | "other";

export interface BulletRef {
  section: "experience" | "projects" | "volunteer" | "education";
  itemId: string;
  bulletId: string;
  text: string;
  label: string;
  current: boolean;
  itemIndex: number;
}

export interface CVFacts {
  fullText: string;
  idx: TextIndex;
  parts: Record<Where, TextIndex>;
  bullets: BulletRef[];
  terms: Map<string, { surface: string; where: Where[] }>;
  months: number;
  years: number;
  degreeLevel: JobAnalysis["degreeLevel"];
  degreeFields: string[];
  hasEducation: boolean;
}

const DEGREE_RANK: Record<JobAnalysis["degreeLevel"], number> = { none: 0, associate: 1, bachelor: 2, master: 3, phd: 4 };
export const degreeRank = (d: JobAnalysis["degreeLevel"]) => DEGREE_RANK[d];

export function degreeLevelOf(s: string): JobAnalysis["degreeLevel"] {
  const t = s.toLowerCase();
  if (/ph\.?\s?d|doctor/.test(t)) return "phd";
  if (/master|\bmsc\b|\bm\.s\.?|\bmba\b|\bma\b|\bmeng\b|\bmphil\b/.test(t)) return "master";
  if (/bachelor|\bbsc\b|\bb\.?s\.?\b|\bb\.?a\.?\b|\bbeng\b|\bbcom\b|\bbba\b|undergraduate|\bllb\b/.test(t)) return "bachelor";
  if (/associate/.test(t)) return "associate";
  return "none";
}

/** Flattens CV content to plain text (also used by the guard and AI prompts). */
export function cvToText(c: CVContent): string {
  const out: string[] = [];
  const p = c.personal;
  out.push([p.fullName, p.headline, p.location].filter(Boolean).join(" · "));
  if (c.summary) out.push(c.summary);
  for (const e of c.experience) out.push([e.role, e.company, e.location].join(" "), ...e.bullets.map((b) => b.text));
  for (const e of c.education) out.push([e.degree, e.field, e.school, e.grade].join(" "), ...e.bullets.map((b) => b.text));
  out.push(c.skills.map((s) => s.name).join(", "));
  for (const pr of c.projects) out.push([pr.name, pr.role].join(" "), ...pr.bullets.map((b) => b.text));
  for (const x of c.certifications) out.push([x.name, x.issuer].join(" "));
  for (const x of c.awards) out.push([x.title, x.issuer, x.description].join(" "));
  for (const v of c.volunteer) out.push([v.role, v.organization].join(" "), ...v.bullets.map((b) => b.text));
  out.push(c.languages.map((l) => l.name).join(", "));
  for (const s of c.custom) for (const i of s.items) out.push([i.title, i.subtitle, i.description].join(" "));
  return out.filter((x) => x.trim()).join("\n");
}

export function analyzeCV(c: CVContent): CVFacts {
  const bullets: BulletRef[] = [];
  c.experience.forEach((e, i) =>
    e.bullets.forEach((b) => b.text.trim() && bullets.push({ section: "experience", itemId: e.id, bulletId: b.id, text: b.text, label: [e.role, e.company].filter(Boolean).join(" · "), current: e.current, itemIndex: i })),
  );
  c.projects.forEach((p, i) =>
    p.bullets.forEach((b) => b.text.trim() && bullets.push({ section: "projects", itemId: p.id, bulletId: b.id, text: b.text, label: p.name, current: false, itemIndex: i })),
  );
  c.volunteer.forEach((v, i) =>
    v.bullets.forEach((b) => b.text.trim() && bullets.push({ section: "volunteer", itemId: v.id, bulletId: b.id, text: b.text, label: [v.role, v.organization].filter(Boolean).join(" · "), current: v.current, itemIndex: i })),
  );
  c.education.forEach((e, i) =>
    e.bullets.forEach((b) => b.text.trim() && bullets.push({ section: "education", itemId: e.id, bulletId: b.id, text: b.text, label: e.school, current: false, itemIndex: i })),
  );

  const partsText: Record<Where, string> = {
    experience: c.experience.map((e) => [e.role, ...e.bullets.map((b) => b.text)].join("\n")).join("\n"),
    projects: c.projects.map((p) => [p.name, p.role, ...p.bullets.map((b) => b.text)].join("\n")).join("\n"),
    volunteer: c.volunteer.map((v) => [v.role, ...v.bullets.map((b) => b.text)].join("\n")).join("\n"),
    skills: c.skills.map((s) => s.name).join(", "),
    summary: `${c.personal.headline}\n${c.summary}`,
    education: c.education.map((e) => [e.degree, e.field, ...e.bullets.map((b) => b.text)].join("\n")).join("\n"),
    certifications: c.certifications.map((x) => `${x.name} ${x.issuer}`).join("\n"),
    other: [...c.awards.map((a) => `${a.title} ${a.description}`), ...c.custom.flatMap((s) => s.items.map((i) => `${i.title} ${i.subtitle} ${i.description}`))].join("\n"),
  };
  const parts = Object.fromEntries(Object.entries(partsText).map(([k, v]) => [k, indexText(v)])) as Record<Where, TextIndex>;

  const terms = new Map<string, { surface: string; where: Where[] }>();
  for (const [where, idx] of Object.entries(parts) as [Where, TextIndex][]) {
    for (const [canon, { surface }] of findTerms(idx)) {
      const cur = terms.get(canon) ?? { surface, where: [] };
      cur.where.push(where);
      terms.set(canon, cur);
    }
  }

  // Total experience: union of months so overlapping jobs aren't double counted
  const monthSet = new Set<number>();
  for (const e of c.experience) {
    const a = parseLooseDate(e.startDate);
    if (!a) continue;
    const len = monthsBetween(e.startDate, e.endDate, e.current);
    for (let k = 0; k < len && k < 600; k++) monthSet.add(a.year * 12 + a.month + k);
  }
  const months = monthSet.size;

  let degreeLevel: JobAnalysis["degreeLevel"] = "none";
  for (const e of c.education) {
    const d = degreeLevelOf(`${e.degree} ${e.field}`);
    if (DEGREE_RANK[d] > DEGREE_RANK[degreeLevel]) degreeLevel = d;
  }

  const fullText = cvToText(c);
  return {
    fullText,
    idx: indexText(fullText),
    parts,
    bullets,
    terms,
    months,
    years: Math.floor(months / 12),
    degreeLevel,
    degreeFields: c.education.map((e) => e.field).filter(Boolean),
    hasEducation: c.education.some((e) => e.degree || e.school),
  };
}

export interface Evidence {
  status: "strong" | "listed" | "mentioned" | "none";
  where?: Where;
  snippet?: string;
  surface?: string;
}

/** Where (if anywhere) does the CV support this term? Achievements > skills list > mentions. */
export function evidenceFor(facts: CVFacts, term: string): Evidence {
  const lex = lookupTerm(term);
  const key = lex?.canonical ?? term;
  const hit = facts.terms.get(key);
  const search = (where: Where) => textHasTerm(facts.parts[where], term);

  for (const where of ["experience", "projects", "volunteer"] as Where[]) {
    const surface = hit?.where.includes(where) ? hit.surface : search(where);
    if (surface) {
      const b = facts.bullets.find((x) => x.section === where && textHasTerm(indexText(x.text), term));
      return { status: "strong", where, snippet: b?.text, surface };
    }
  }
  const listed = search("skills");
  if (listed) return { status: "listed", where: "skills", surface: listed };
  for (const where of ["summary", "education", "certifications", "other"] as Where[]) {
    const s = search(where);
    if (s) return { status: "mentioned", where, surface: s };
  }
  return { status: "none" };
}

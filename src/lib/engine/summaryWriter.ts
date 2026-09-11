import type { CVContent } from "@/lib/cv/schema";
import type { JobAnalysis } from "@/lib/ai/types";
import { evidenceFor, type BulletRef, type CVFacts } from "./cvAnalysis";
import { looksLikeTitle } from "./personalInfo";
import { rewriteBullet, toGerundClause } from "./rewrite";
import { indexText, joinList, lookupTerm, lowerFirst, similarity, textHasTerm, wordCount } from "./text";
import { STRONG_VERBS } from "./verbs";

/* Tailored professional summary (on-device), written the way a good recruiter-facing summary is:
   - 2–3 sentences, ~40–60 words
   - who the candidate is (a real title) + how much experience + the CV's strongest overlap with the job
   - one concrete point from the EXPERIENCE section, chosen for relevance to the job
   - job-relevant tools (and the degree when the job asks for one)
   - job wording only where the CV supports it; no generic filler; nothing invented. */

export type SummaryJob = Pick<JobAnalysis, "jobTitle" | "requiredSkills" | "preferredSkills" | "keywords" | "responsibilities" | "degreeLevel" | "educationFields">;

export const GENERIC_RE =
  /\b(results?[- ]driven|results?[- ]oriented|detail[- ]oriented|hard[- ]?working|team player|self[- ]motivated|highly motivated|passionate|dynamic|go[- ]getter|proven track record|think outside the box|synergy|dedicated|enthusiastic|motivated individual|fast learner|excellent communication skills|strong analytical (?:thinking )?skills)\b/gi;
const INTERNISH = /\b(intern(ship)?|trainee|volunteer|student|apprentice)\b/i;
const GENERIC_TERMS = /^(reporting|management|analysis|operations|communication|documentation|coordination)$/i;

const cleanRole = (r: string) => r.replace(/\s*\([^)]*\)?/g, "").replace(/\s+[-–—|]\s+.*$/, "").replace(/\s{2,}/g, " ").trim();
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const domainCase = (t: string) => (/[A-Z]{2,}/.test(t) ? t : t.toLowerCase());
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** How relevant a piece of CV text is to the job (skills it shows + similarity to a responsibility). */
export function relevanceTo(text: string, job: SummaryJob | null): number {
  if (!job) return 0;
  const idx = indexText(text);
  let s = 0;
  for (const t of job.requiredSkills) if (textHasTerm(idx, t)) s += 3;
  for (const t of job.preferredSkills) if (textHasTerm(idx, t)) s += 1.5;
  for (const t of job.keywords) if (textHasTerm(idx, t)) s += 1;
  const resp = job.responsibilities.length ? Math.max(...job.responsibilities.map((r) => similarity(r, text))) : 0;
  return s + resp * 6;
}

/** The professional identity that opens the summary: a real title, preferring the one closest to the target job. */
function identity(content: CVContent, job: SummaryJob | null): string {
  const cands: { t: string; score: number }[] = [];
  const near = (t: string) => (job?.jobTitle ? similarity(t, job.jobTitle) * 3 : 0);
  const h = content.personal.headline.trim();
  if (looksLikeTitle(h) && !/^(professional|graduate|student|candidate|job seeker)$/i.test(h)) cands.push({ t: h, score: 1.5 + near(h) });
  content.experience.forEach((e, i) => {
    const t = cleanRole(e.role);
    if (!t || !looksLikeTitle(t) || INTERNISH.test(t)) return;
    cands.push({ t, score: 1.2 - i * 0.15 + near(t) });
  });
  cands.sort((a, b) => b.score - a.score);
  const pick = cands[0]?.t ?? (content.education.some((e) => e.degree.trim()) ? "Graduate" : "Professional");
  return pick === pick.toUpperCase() ? titleCase(pick) : pick;
}

function experiencePhrase(facts: CVFacts): string {
  if (facts.months >= 24) return `${facts.years}+ years of experience`;
  if (facts.months >= 12) return "over a year of experience";
  if (facts.months >= 3) return "hands-on experience";
  return "";
}

/** Job requirements the CV genuinely shows (domains from experience; tools from experience or skills), topped up from the CV. */
function overlap(facts: CVFacts, job: SummaryJob | null, content: CVContent) {
  const domains: string[] = [];
  const tools: string[] = [];
  const fromJob: string[] = [];
  const push = (list: string[], t: string, max: number) => {
    const low = t.toLowerCase();
    if (list.length >= max || list.some((x) => x.toLowerCase().includes(low) || low.includes(x.toLowerCase()))) return false;
    list.push(t);
    return true;
  };
  const ordered = job ? [...new Set([...job.requiredSkills, ...job.preferredSkills, ...job.keywords])] : [];
  for (const term of ordered) {
    const lex = lookupTerm(term);
    if (lex?.category === "soft" || lex?.category === "certification" || GENERIC_TERMS.test(term)) continue;
    const ev = evidenceFor(facts, term);
    const name = lex?.canonical ?? term;
    if (lex?.category === "tool") {
      if ((ev.status === "strong" || ev.status === "listed") && push(tools, name, 4)) fromJob.push(name);
    } else if (ev.status === "strong" && (ev.where === "experience" || ev.where === "projects") && push(domains, domainCase(name), 4)) fromJob.push(domainCase(name));
  }
  // Top up with the CV's own strongest experience topics / tools
  const cvTerms = [...facts.terms.entries()].filter(([, v]) => v.where.includes("experience")).sort((a, b) => b[1].where.length - a[1].where.length);
  for (const [canon] of cvTerms) {
    const lex = lookupTerm(canon);
    if (!lex || GENERIC_TERMS.test(canon)) continue;
    if (lex.category === "domain" && domains.length < 3) push(domains, domainCase(canon), 3);
    // With a job attached, only name tools the job asks for — padding with unrelated tools dilutes the summary
    else if (!job && lex.category === "tool" && tools.length < 2) push(tools, canon, 3);
  }
  if (!job && tools.length < 2) for (const s of content.skills) if (lookupTerm(s.name)?.category === "tool") push(tools, s.name, 3);
  return { domains, tools, fromJob };
}

/** Shortens a long achievement clause at a natural break, never dropping its number. */
function trimClause(c: string): string {
  let t = c.replace(/[.;]+$/, "").trim();
  if (wordCount(t) > 20) {
    const m = t.slice(20).search(/\s+(?:through|by|while|resulting in|which|leading to|to ensure|in order to|across)\s|,\s/);
    const cut = m < 0 ? -1 : m + 20;
    if (cut > 0 && (!/\d/.test(t) || /\d/.test(t.slice(0, cut)))) t = t.slice(0, cut);
  }
  return t.trim();
}

/** The single most job-relevant achievement from the experience section (projects only if there's no experience). */
function bestAchievement(facts: CVFacts, job: SummaryJob | null): { clause: string; bullet: BulletRef; numeric: boolean } | null {
  const exp = facts.bullets.filter((b) => b.section === "experience");
  const pool = exp.length ? exp : facts.bullets.filter((b) => b.section === "projects");
  const scored = pool
    .map((b) => {
      const t = rewriteBullet(b.text, { current: false, mode: "conservative", endWithPeriod: false }).text;
      const rel = relevanceTo(b.text, job);
      const numeric = /\d/.test(b.text);
      return { b, t, rel, numeric, score: rel + (numeric ? 2.5 : 0) - b.itemIndex * 0.3 };
    })
    .filter((x) => STRONG_VERBS.has(x.t.split(/\s+/)[0]?.toLowerCase() ?? "") && (!job || x.rel > 0))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const clause = best ? toGerundClause(best.t) : null;
  return best && clause ? { clause: lowerFirst(trimClause(clause)), bullet: best.b, numeric: best.numeric } : null;
}

function degreeCredential(content: CVContent): string {
  const ed = content.education.find((e) => /bachelor|master|mba|ph\.?d|doctor|\bbba\b|\bbsc\b|\bb\.?com\b|\bba\b|\bma\b|\bmsc\b|degree/i.test(e.degree));
  if (!ed) return "";
  const d = `${ed.degree.trim()}${ed.field && !ed.degree.toLowerCase().includes(ed.field.toLowerCase()) ? ` in ${ed.field.trim()}` : ""}`;
  return `${/^[aeiou]/i.test(d) ? "an" : "a"} ${d}`;
}

export interface SummaryDraft {
  text: string;
  reasons: string[];
  bullet?: BulletRef;
}

export function buildTailoredSummary(content: CVContent, facts: CVFacts, job: SummaryJob | null, mode: "conservative" | "balanced" | "aggressive" = "balanced"): SummaryDraft | null {
  const lead = identity(content, job);
  const exp = experiencePhrase(facts);
  const { domains, tools, fromJob } = overlap(facts, job, content);
  const ach = bestAchievement(facts, job);
  const cred = degreeCredential(content);
  const credWanted = !job || job.degreeLevel !== "none" || job.educationFields.length > 0;
  if (!domains.length && !ach && !tools.length) return null;

  const build = (nd: number, nt: number, withAch: boolean, withCred: boolean) => {
    const s: string[] = [];
    const d = domains.slice(0, nd);
    const withWhat = exp || (facts.months ? "experience" : "a background");
    s.push(d.length ? `${lead} with ${withWhat} in ${joinList(d)}.` : exp ? `${lead} with ${exp}.` : `${lead}.`);
    if (withAch && ach) s.push(`${ach.numeric ? "Achievements include" : "Experience includes"} ${ach.clause}.`);
    const t = tools.slice(0, nt);
    if (t.length) s.push(`Proficient in ${joinList(t)}${withCred && cred ? `, with ${cred}` : ""}.`);
    else if (withCred && cred) s.push(`Holds ${cred}.`);
    return s.join(" ").replace(/\s{2,}/g, " ").trim();
  };
  const maxD = mode === "aggressive" ? 4 : 3;
  // Richest version that fits 60 words; if it's under 40, add the degree
  const tries: [number, number, boolean, boolean][] = [
    [maxD, 3, true, credWanted],
    [maxD, 3, true, false],
    [3, 2, true, false],
    [2, 2, true, false],
    [2, 2, false, false],
  ];
  let text = "";
  for (const t of tries) {
    text = build(...t);
    if (wordCount(text) <= 60) break;
  }
  if (wordCount(text) < 40 && cred && !text.includes(cred)) {
    const richer = build(maxD, 3, true, true);
    if (wordCount(richer) <= 62) text = richer;
  }

  const reasons: string[] = [];
  if (fromJob.length) reasons.push(`Leads with your strongest overlap with this job: ${joinList(fromJob.slice(0, 3))}`);
  if (ach && text.includes(ach.clause)) reasons.push(`Includes a concrete point from your experience (${ach.bullet.label})`);
  reasons.push(`${wordCount(text)} words, no generic phrases — built only from facts in your CV`);
  return { text, reasons, bullet: ach?.bullet };
}

/** Rough quality score used to decide whether a new summary is actually better than the user's own. */
export function summaryScore(text: string, facts: CVFacts, job: SummaryJob | null): number {
  const t = text.trim();
  if (!t) return -99;
  let s = 0;
  if (job) {
    const idx = indexText(t);
    const seen = new Set<string>();
    const add = (terms: string[], w: number) => {
      for (const term of terms) {
        const k = (lookupTerm(term)?.canonical ?? term).toLowerCase();
        if (seen.has(k) || !textHasTerm(idx, term) || evidenceFor(facts, term).status === "none") continue;
        seen.add(k);
        s += w;
      }
    };
    add(job.requiredSkills, 3);
    add(job.preferredSkills, 2);
    add(job.keywords, 1);
  }
  s += Math.min(2, (t.match(/\d+/g) ?? []).length) * 1.5;
  s -= (t.match(GENERIC_RE) ?? []).length * 1.5;
  if (/\b(i|my|me)\b/i.test(t)) s -= 2;
  if (!/[.!?]["”)]?$/.test(t)) s -= 4; // unfinished (often cut off during import)
  const wc = wordCount(t);
  if (wc < 30 || wc > 80) s -= 2;
  return s;
}

/** Light clean-up that keeps the user's own words: first person, broken hyphenation, an unfinished last sentence. */
export function polishSummary(s: string): string {
  let t = s
    .replace(/(\w)-\s+(?=[a-z])/g, "$1-")
    .replace(/\bI am an?\s+/gi, "")
    .replace(/\bI have\s+/gi, "")
    .replace(/\bI\s+/g, "")
    .replace(/\bmy\s+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (t && !/[.!?]["”)]?$/.test(t)) {
    const stop = t.lastIndexOf(". ");
    const head = stop >= 0 ? t.slice(0, stop + 1).trim() : "";
    let tail = stop >= 0 ? t.slice(stop + 2).trim() : t;
    tail = tail.replace(/\s+\S*-$/, ""); // "…in fast-" → drop the broken word
    const cut = Math.max(tail.lastIndexOf(" and "), tail.lastIndexOf(", "));
    if (cut > 20 && /\s(in|to|of|with|for|at|on)\s*$|\s(in|to|of|with|for|at|on)\s\S*$/.test(tail.slice(cut))) {
      // the last list item is incomplete ("…and continuously learn in") → end at the previous item
      tail = tail.slice(0, cut).trim();
      const c = tail.lastIndexOf(", ");
      if (c > 0 && !/\band\b/.test(tail.slice(c))) tail = `${tail.slice(0, c)} and ${tail.slice(c + 2)}`;
    }
    t = `${head} ${tail.replace(/[,;:\s]+$/, "")}.`.trim();
  }
  return cap(t);
}

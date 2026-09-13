import type { CVContent, CVDoc, Skill } from "@/lib/cv/schema";
import type { Change, JobAnalysis, KeywordHit, MatchResult, OptimizationPlan, OptimizeMode, Question } from "@/lib/ai/types";
import { newBullet, newSkill } from "@/lib/cv/defaults";
import { uid } from "@/lib/utils";
import { analyzeCV, evidenceFor, type BulletRef, type CVFacts } from "./cvAnalysis";
import { guardText } from "./guard";
import { buildTailoredSummary, polishSummary, summaryScore } from "./summaryWriter";
import { validatePlan } from "./sectionValidator";
import { noteToBullet, prefersPresent, rewriteBullet, toGerundClause } from "./rewrite";
import { indexText, joinList, lookupTerm, lowerFirst, sentenceCase, similarity, textHasTerm } from "./text";
import { STRONG_VERBS } from "./verbs";

type Doc = Pick<CVDoc, "content" | "layout" | "design">;

const LIMITS: Record<OptimizeMode, { metric: number; clarify: number }> = {
  conservative: { metric: 2, clarify: 3 },
  balanced: { metric: 3, clarify: 4 },
  aggressive: { metric: 4, clarify: 6 },
};

function mk(partial: Omit<Change, "id" | "status" | "original">): Change {
  return { id: uid("chg"), status: "pending", original: partial.after, ...partial };
}
export const makeChange = mk;

function jobTerms(job: JobAnalysis) {
  return [...job.requiredSkills, ...job.preferredSkills, ...job.keywords];
}

function bulletRelevance(text: string, job: JobAnalysis): number {
  const idx = indexText(text);
  let s = 0;
  for (const t of job.requiredSkills) if (textHasTerm(idx, t)) s += 3;
  for (const t of job.preferredSkills) if (textHasTerm(idx, t)) s += 1.5;
  for (const t of job.keywords) if (textHasTerm(idx, t)) s += 1;
  const resp = job.responsibilities.length ? Math.max(...job.responsibilities.map((r) => similarity(r, text))) : 0;
  return s + resp * 6 + (/\d/.test(text) ? 0.5 : 0);
}

const endsWithPeriodMajority = (facts: CVFacts) => {
  const b = facts.bullets;
  return b.length ? b.filter((x) => /\.\s*$/.test(x.text)).length >= b.length / 2 : false;
};

/* ───────────── Summary ───────────── */
export function optimizeSummary(content: CVContent, facts: CVFacts, job: JobAnalysis, match: MatchResult, mode: OptimizeMode): Change[] {
  const existing = content.summary.trim();
  const summaryChange = (after: string, reasons: string[]) =>
    mk({ kind: "summary", section: "summary", label: existing ? "Professional summary" : "New professional summary", target: {}, before: existing, after, reasons, basis: "fact", category: "safe" });

  if (mode === "conservative" && existing) {
    const cleaned = polishSummary(existing);
    return cleaned === existing ? [] : [summaryChange(cleaned, ["Light clean-up only: keeps your own wording"])];
  }

  // No "…role at <Company> in <City>" sentence: the summary describes the candidate, not the posting.
  // Relevance comes from WHICH facts lead (see summaryWriter.ts), not from naming the employer.
  const draft = buildTailoredSummary(content, facts, job, mode);
  if (!draft) {
    const cleaned = polishSummary(existing);
    return existing && cleaned !== existing ? [summaryChange(cleaned, ["Light clean-up only: keeps your own wording"])] : [];
  }

  // Don't replace a summary that already fits this job better than what we can write
  if (existing && summaryScore(existing, facts, job) >= summaryScore(draft.text, facts, job) + 1) {
    const cleaned = polishSummary(existing);
    return cleaned !== existing ? [summaryChange(cleaned, ["Your summary already fits this job well — kept your wording and only tidied it"])] : [];
  }
  if (draft.text === existing) return [];
  return [summaryChange(draft.text, draft.reasons)];
}

/* ───────────── Experience ───────────── */
export function optimizeExperience(content: CVContent, facts: CVFacts, job: JobAnalysis, mode: OptimizeMode): Change[] {
  const changes: Change[] = [];
  const period = endsWithPeriodMajority(facts);
  const terms = [...job.requiredSkills, ...job.preferredSkills];

  for (const b of facts.bullets) {
    if (b.section === "education") continue;
    // match the tense the candidate already uses for this role
    const present = b.current && prefersPresent(facts.bullets.filter((x) => x.itemId === b.itemId).map((x) => x.text));
    const r = rewriteBullet(b.text, { current: present, mode, endWithPeriod: period, jobTerms: terms });
    if (r.text.trim() !== b.text.trim() && r.reasons.length) {
      changes.push(mk({ kind: "bullet", section: b.section, label: b.label || "Bullet", target: { itemId: b.itemId, bulletId: b.bulletId }, before: b.text, after: r.text, reasons: r.reasons, basis: "fact", category: "safe" }));
    }
  }

  // Bring the most job-relevant bullets to the top of each role
  if (mode !== "conservative") {
    for (const e of content.experience) {
      const list = e.bullets.filter((x) => x.text.trim());
      if (list.length < 3) continue;
      const scored = list.map((x, i) => ({ x, i, s: bulletRelevance(x.text, job) }));
      const sorted = [...scored].sort((a, b) => b.s - a.s || a.i - b.i);
      if (sorted[0].i === 0 || sorted[0].s - scored[0].s < 1.5) continue;
      changes.push(
        mk({
          kind: "bullet-order",
          section: "experience",
          label: [e.role, e.company].filter(Boolean).join(" · "),
          target: { itemId: e.id },
          before: list.map((x) => x.text).join("\n"),
          after: sorted.map((y) => y.x.text).join("\n"),
          beforeList: list.map((x) => x.text),
          afterList: sorted.map((y) => y.x.text),
          payload: { order: sorted.map((y) => y.x.id) },
          reasons: ["Moves your most job-relevant achievements to the top of this role"],
          basis: "fact",
          category: "safe",
        }),
      );
    }
  }
  return changes;
}

/* ───────────── Skills ───────────── */
export function optimizeSkills(content: CVContent, facts: CVFacts, job: JobAnalysis, match: MatchResult, mode: OptimizeMode): Change[] {
  const changes: Change[] = [];
  const skills = content.skills.filter((s) => s.name.trim());
  const rank = (s: Skill) => {
    const idx = indexText(s.name);
    const hit = (list: string[]) => list.findIndex((t) => textHasTerm(idx, t) || textHasTerm(indexText(t), s.name));
    const r = hit(job.requiredSkills);
    if (r >= 0) return r;
    const p = hit(job.preferredSkills);
    if (p >= 0) return 100 + p;
    const k = hit([...job.keywords, ...job.softSkills]);
    if (k >= 0) return 200 + k;
    return 1000;
  };
  const sorted = skills.map((s, i) => ({ s, i, r: rank(s) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.s);
  const grouped = skills.some((s) => s.group.trim());
  if (!grouped && sorted.some((s, i) => s.id !== skills[i].id)) {
    changes.push(
      mk({
        kind: "skills",
        section: "skills",
        label: "Skills order",
        target: {},
        before: skills.map((s) => s.name).join(", "),
        after: sorted.map((s) => s.name).join(", "),
        beforeList: skills.map((s) => s.name),
        afterList: sorted.map((s) => s.name),
        payload: { skills: sorted },
        reasons: ["Puts the skills this job asks for first"],
        basis: "fact",
        category: "safe",
      }),
    );
  }

  // Skills proven in experience but missing from the skills list (FACT)
  const have = new Set(skills.map((s) => s.name.toLowerCase()));
  const candidates = match.keywords.have.filter((k) => (mode === "conservative" ? k.importance === "required" : k.importance !== "keyword" || mode === "aggressive"));
  for (const k of candidates) {
    const lex = lookupTerm(k.term);
    if (lex?.category === "soft") continue;
    if (skills.some((s) => textHasTerm(indexText(s.name), k.term)) || have.has(k.term.toLowerCase())) continue;
    const ev = evidenceFor(facts, k.term);
    if (ev.status !== "strong") continue;
    const skill = newSkill(k.term);
    changes.push(mk({ kind: "add-skill", section: "skills", label: "Add skill", target: {}, before: "", after: k.term, payload: { skill }, reasons: [`Already shown in your experience: “${truncate(ev.snippet ?? "", 90)}”`], basis: "fact", category: "safe" }));
  }
  return changes;
}

/* ───────────── Structure ───────────── */
export function optimizeStructure(doc: Doc, facts: CVFacts, job: JobAnalysis, mode: OptimizeMode): Change[] {
  const changes: Change[] = [];
  const order = doc.layout.order;
  const iEdu = order.indexOf("education");
  const iExp = order.indexOf("experience");
  if ((job.seniority === "Internship" || job.seniority === "Entry-level") && facts.years < 1 && iEdu > iExp && iExp >= 0 && doc.content.education.length) {
    const next = [...order];
    next.splice(iEdu, 1);
    next.splice(iExp, 0, "education");
    changes.push(mk({ kind: "section-order", section: "layout", label: "Section order", target: {}, before: order.join(","), after: next.join(","), beforeList: order, afterList: next, payload: { order: next }, reasons: ["For early-career roles, recruiters look at education first"], basis: "fact", category: "safe" }));
  }

  if (mode !== "conservative" && doc.content.projects.length >= 2) {
    const scored = doc.content.projects.map((p, i) => ({ p, i, s: bulletRelevance(`${p.name} ${p.role} ${p.bullets.map((b) => b.text).join(" ")}`, job) }));
    const sorted = [...scored].sort((a, b) => b.s - a.s || a.i - b.i);
    if (sorted[0].i !== 0 && sorted[0].s - scored[0].s >= 1.5)
      changes.push(mk({ kind: "item-order", section: "projects", label: "Projects order", target: {}, before: scored.map((x) => x.p.name).join("\n"), after: sorted.map((x) => x.p.name).join("\n"), beforeList: scored.map((x) => x.p.name), afterList: sorted.map((x) => x.p.name), payload: { order: sorted.map((x) => x.p.id) }, reasons: ["Shows your most relevant project first"], basis: "fact", category: "safe" }));
  }
  if (doc.content.certifications.length >= 2) {
    const scored = doc.content.certifications.map((c, i) => ({ c, i, s: bulletRelevance(`${c.name} ${c.issuer}`, job) }));
    const sorted = [...scored].sort((a, b) => b.s - a.s || a.i - b.i);
    if (sorted[0].i !== 0 && sorted[0].s > scored[0].s)
      changes.push(mk({ kind: "item-order", section: "certifications", label: "Certifications order", target: {}, before: scored.map((x) => x.c.name).join("\n"), after: sorted.map((x) => x.c.name).join("\n"), beforeList: scored.map((x) => x.c.name), afterList: sorted.map((x) => x.c.name), payload: { order: sorted.map((x) => x.c.id) }, reasons: ["Puts the most relevant certification first"], basis: "fact", category: "safe" }));
  }
  return changes;
}

/* ───────────── Smart questions ───────────── */
const HIGH_VOLUME = /\b(invoices?|transactions?|tickets?|calls?|queries|inquiries|enquiries|orders?|entries|payments?|requests?|cases?|claims?|shipments?|emails?)\b/i;
const MEDIUM = /\b(reports?|statements?|campaigns?|events?|projects?|applications?|audits?|presentations?|reconciliations?|bugs?|defects?|features?|components?|pages?|pull requests?|articles?|posts?)\b/i;
const PORTFOLIO = /\b(clients?|customers?|accounts?|suppliers?|vendors?|employees?|students?|patients?|candidates?|products?|stakeholders?|stores?|sites?)\b/i;
const TEAM = /\b(led|lead|managed|manage|supervised|supervise|trained|train|mentored|mentor|coached)\b[^.]{0,40}\b(team|staff|people|interns?|associates?|analysts?|colleagues|volunteers?)\b/i;
const IMPROVE = /\b(reduc\w*|improv\w*|increas\w*|cut|decreas\w*|boost\w*|grow|grew|sav\w*|streamlin\w*|accelerat\w*|speed\w* up|shorten\w*)\b/i;

export function metricQuestions(facts: CVFacts, job: JobAnalysis, mode: OptimizeMode): Question[] {
  const out: Question[] = [];
  const candidates = facts.bullets
    .filter((b) => (b.section === "experience" || b.section === "projects") && !/\d/.test(b.text))
    .sort((a, b) => bulletRelevance(b.text, job) - bulletRelevance(a.text, job));
  for (const b of candidates) {
    if (out.length >= LIMITS[mode].metric) break;
    const q = questionFor(b);
    if (q) out.push(q);
  }
  return out;
}

function questionFor(b: BulletRef): Question | null {
  const base = { id: uid("q"), kind: "metric" as const, section: b.section, itemId: b.itemId, bulletId: b.bulletId, context: b.text };
  const tm = b.text.match(TEAM);
  if (tm) return { ...base, unit: "people", noun: "people", prompt: "How many people were on the team?", options: opts(["2–3", "4–6", "7–10", "10+"]) };
  if (IMPROVE.test(b.text)) return { ...base, unit: "percent", prompt: "Roughly how big was the improvement?", options: opts(["Under 10%", "10–25%", "25–50%", "50%+"]) };
  // use the noun that appears first — it's usually the object of the action verb
  const hit = ([
    ["hv", b.text.match(HIGH_VOLUME)],
    ["pf", b.text.match(PORTFOLIO)],
    ["md", b.text.match(MEDIUM)],
  ] as const)
    .filter((x): x is readonly ["hv" | "pf" | "md", RegExpMatchArray] => !!x[1])
    .sort((a, c) => (a[1].index ?? 0) - (c[1].index ?? 0))[0];
  if (!hit) return null;
  const noun = plural(hit[1][1].toLowerCase());
  if (hit[0] === "hv") return { ...base, unit: "count", noun, frequency: "per day", prompt: `Approximately how many ${noun} did you handle per day?`, options: opts(["Under 20", "20–50", "50–100", "100–200", "200+"]) };
  if (hit[0] === "pf") return { ...base, unit: "count", noun, prompt: `Approximately how many ${noun} did this involve?`, options: opts(["Under 10", "10–50", "50–100", "100+"]) };
  return { ...base, unit: "count", noun, frequency: "per month", prompt: `About how many ${noun} per month?`, options: opts(["1–5", "5–10", "10–25", "25+"]) };
}

const opts = (xs: string[]) => [...xs.map((x) => ({ value: x, label: x })), { value: "unknown", label: "I don't know" }];
const plural = (w: string) => (w.endsWith("s") ? w : w.endsWith("y") && !/[aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);

const CLARIFY_PHRASES: Record<string, string> = {
  "Financial Modeling": "built financial models",
  Forecasting: "prepared forecasts",
  Budgeting: "worked on budgets or the budgeting process",
  "Variance Analysis": "done variance analysis (budget vs. actual)",
  "FP&A": "worked in financial planning & analysis",
  Dashboards: "built dashboards",
  "Data Visualization": "created data visualizations",
  "Stakeholder Management": "managed stakeholders directly",
  "Project Management": "managed projects end-to-end",
  "Process Improvement": "improved a process",
  Leadership: "led people or initiatives",
};

export function clarifyQuestions(match: MatchResult, mode: OptimizeMode): Question[] {
  return match.keywords.canAdd.slice(0, LIMITS[mode].clarify).map((k: KeywordHit) => {
    const lex = lookupTerm(k.term);
    const action = CLARIFY_PHRASES[lex?.canonical ?? k.term] ?? (lex?.category === "tool" ? `used ${k.term}` : `hands-on experience with ${lex?.category === "domain" ? k.term.toLowerCase() : k.term}`);
    const verb = action.startsWith("hands-on") ? "Do you have" : "Have you";
    const why = k.related?.length
      ? `Your ${joinList(k.related.slice(0, 2))} experience is relevant, but your CV doesn't currently show ${k.term.toLowerCase() === k.term ? k.term : k.term}.`
      : k.evidence
        ? `Your CV mentions related work (“${truncate(k.evidence, 80)}”), but not ${k.term} specifically.`
        : `The job asks for ${k.term}.`;
    return {
      id: uid("q"),
      kind: "skill" as const,
      keyword: k.term,
      importance: k.importance,
      prompt: `${verb} ${action}?`,
      context: why,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "unsure", label: "Not sure" },
      ],
    };
  });
}

/* ───────────── Orchestrator ───────────── */
export function generateOptimizationSuggestions(doc: Doc, job: JobAnalysis, match: MatchResult, mode: OptimizeMode): OptimizationPlan {
  const facts = analyzeCV(doc.content);
  const changes = [
    ...optimizeSummary(doc.content, facts, job, match, mode),
    ...optimizeExperience(doc.content, facts, job, mode),
    ...optimizeSkills(doc.content, facts, job, match, mode),
    ...optimizeStructure(doc, facts, job, mode),
  ];
  const plan: OptimizationPlan = {
    changes,
    questions: [...clarifyQuestions(match, mode), ...metricQuestions(facts, job, mode)],
    doNotAdd: match.keywords.doNotAdd,
    notes: [],
  };
  // Step 9: validate every proposed change (truth, then section fit / relevance / stuffing)
  return validatePlan(guardPlan(plan, doc.content, job), doc.content, job);
}

/** Runs the truthfulness guard on every text change. */
export function guardPlan(plan: OptimizationPlan, content: CVContent, job: JobAnalysis, extraCorpus = ""): OptimizationPlan {
  const facts = analyzeCV(content);
  const answers = plan.questions.map((q) => `${q.answer ?? ""} ${q.detail ?? ""} ${q.answer === "yes" ? q.keyword ?? "" : ""}`).join(" ");
  const corpus = `${facts.fullText}\n${answers}\n${extraCorpus}`;
  return {
    ...plan,
    changes: plan.changes.map((c) => {
      if (c.kind === "skills" || c.kind === "bullet-order" || c.kind === "section-order" || c.kind === "item-order") return c;
      if (c.basis === "user") return c;
      // years of experience are derived from the CV's own dates, so they count as facts
      const extra = c.kind === "summary" ? `\n${facts.years}+ ${facts.years}` : "";
      const g = guardText(c.after, corpus + extra);
      if (g.ok) return c;
      return { ...c, category: "blocked", warning: g.problems.join(". "), status: c.status === "accepted" ? "pending" : c.status };
    }),
  };
}

/* ───────────── Answer handling ───────────── */
export function applyAnswer(plan: OptimizationPlan, question: Question, content: CVContent): OptimizationPlan {
  const questions = plan.questions.map((q) => (q.id === question.id ? question : q));
  let changes = [...plan.changes];
  const facts = analyzeCV(content);
  const period = facts.bullets.filter((x) => /\.\s*$/.test(x.text)).length >= facts.bullets.length / 2;

  if (question.kind === "metric" && question.bulletId) {
    const val = question.answer && question.answer !== "unknown" ? (question.detail?.trim() || question.answer) : null;
    const existing = changes.find((c) => c.kind === "bullet" && c.target.bulletId === question.bulletId);
    const ref = facts.bullets.find((b) => b.bulletId === question.bulletId);
    if (val && ref) {
      const baseText = existing ? existing.original : ref.text;
      const withMetric = addMetric(baseText, question, val, period);
      if (existing) {
        changes = changes.map((c) =>
          c.id === existing.id ? { ...c, after: withMetric, original: c.original, basis: "user", category: "safe", warning: undefined, reasons: [...new Set([...c.reasons.filter((r) => r !== "Adds the number you provided"), "Adds the number you provided"])] } : c,
        );
      } else {
        changes.push(mk({ kind: "bullet", section: ref.section, label: ref.label, target: { itemId: ref.itemId, bulletId: ref.bulletId }, before: ref.text, after: withMetric, reasons: ["Adds the number you provided"], basis: "user", category: "safe" }));
      }
    }
  }

  if (question.kind === "skill" && question.keyword) {
    const kw = question.keyword;
    changes = changes.filter((c) => !(c.basis === "user" && (c.kind === "add-skill" || c.kind === "add-bullet") && c.payload?.skill?.name === kw) && !(c.kind === "add-bullet" && c.label.endsWith(`· ${kw}`)));
    if (question.answer === "yes") {
      if (!content.skills.some((s) => s.name.toLowerCase() === kw.toLowerCase()))
        changes.push(mk({ kind: "add-skill", section: "skills", label: "Add skill", target: {}, before: "", after: kw, payload: { skill: newSkill(kw) }, reasons: ["You confirmed you have this experience"], basis: "user", category: "safe" }));
      const detail = question.detail?.trim();
      const targetItem = content.experience.find((e) => e.id === question.detailItemId) ?? content.experience[0];
      if (detail && detail.length > 8 && targetItem) {
        // Same writer as "Improve with assistant": a rough note becomes a CV bullet from the user's own words
        const text = noteToBullet(detail, { keyword: kw, current: targetItem.current && prefersPresent(targetItem.bullets.map((x) => x.text)), endWithPeriod: period });
        changes.push(
          mk({
            kind: "add-bullet",
            section: "experience",
            label: `${[targetItem.role, targetItem.company].filter(Boolean).join(" · ")} · ${kw}`,
            target: { itemId: targetItem.id },
            before: "",
            after: text,
            payload: { bullet: newBullet(text) },
            reasons: ["Based on the details you provided"],
            basis: "user",
            category: "safe",
          }),
        );
      }
    }
  }

  return { ...plan, questions, changes };
}

function addMetric(text: string, q: Question, value: string, period: boolean): string {
  const t = text.trim().replace(/[.;]+$/, "");
  const v = value.trim();
  // Read naturally: "under 10%" → "less than 10%", "100+" → "over 100", ranges get "~"
  const approx = /^under\s+/i.test(v) ? `less than ${v.replace(/^under\s+/i, "")}` : /\+$/.test(v) ? `over ${v.replace(/\+$/, "")}` : /^\d/.test(v) && !/[–-]/.test(v) ? v : `~${v}`;
  let out: string;
  if (q.unit === "percent") {
    // A percentage belongs to the RESULT ("…to improve payment accuracy by 10%"), not the first verb
    // ("collaborated by ~<10% with…" was wrong)
    const m = t.match(/\b(improv\w*|increas\w*|reduc\w*|decreas\w*|cut|boost\w*|grow\w*|grew|rais\w*|lower\w*|sav\w*|accelerat\w*|shorten\w*|minimi[sz]\w*|maximi[sz]\w*|speed\w* up)\b/i);
    if (m && m.index != null) {
      const afterVerb = m.index + m[0].length;
      const stop = t.slice(afterVerb).search(/,\s|\s(?:through|using|via|while|by)\s/);
      const end = stop >= 0 ? afterVerb + stop : t.length;
      out = `${t.slice(0, end)} by ${approx}${t.slice(end)}`;
    } else out = `${t} (${approx})`;
  } else if (q.unit === "people") {
    out = t.replace(/\b(team|staff)\b/i, (m) => `${m} of ${approx.replace(/^~/, "")}`);
    if (out === t) out = `${t} (team of ${approx.replace(/^~/, "")})`;
  } else {
    out = `${t} (${approx} ${q.noun ?? ""}${q.frequency ? ` ${q.frequency}` : ""})`.replace(/\s+\)/, ")");
  }
  return period ? `${out}.` : out;
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

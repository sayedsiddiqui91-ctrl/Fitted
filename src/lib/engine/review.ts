import type { CVContent, Design } from "@/lib/cv/schema";
import type { ReviewItem, ReviewResult } from "@/lib/ai/types";
import { templateMeta } from "@/lib/cv/meta";
import { analyzeCV } from "./cvAnalysis";
import { addedContactDetail, looksLikeTitle } from "./personalInfo";
import { contentTokens, GENERIC } from "./reviewData";
import { BUZZWORDS, COMMON_MISSPELLINGS, STRONG_VERBS, WEAK_OPENERS, WEAK_PHRASE_RE, verbFromAny } from "./verbs";
import { wordCount } from "./text";

const hasNumber = (s: string) => /\d/.test(s);
const firstWord = (s: string) => s.trim().split(/\s+/)[0]?.replace(/[^a-zA-Z-]/g, "").toLowerCase() ?? "";

/** ATS / formatting readiness (0-100). Used by both Review and Job Match. */
export function formattingScore(c: CVContent, design: Design, pages = 1): number {
  let s = 100;
  const p = c.personal;
  if (!p.fullName.trim()) s -= 15;
  if (!p.email.trim()) s -= 12;
  if (!p.phone.trim()) s -= 6;
  if (!p.location.trim()) s -= 4;
  if (!templateMeta(design.template).atsFriendly) s -= 12;
  if (design.fontSize < 9) s -= 6;
  if (design.margin < 10) s -= 4;
  if (pages > 2) s -= 10;
  const missingDates = c.experience.filter((e) => !e.startDate.trim()).length;
  s -= Math.min(12, missingDates * 4);
  if (!c.experience.length && !c.education.length) s -= 15;
  if (!c.skills.length) s -= 6;
  return Math.max(0, Math.min(100, s));
}

export function reviewCV(c: CVContent, design: Design, pages = 1): ReviewResult {
  const items: ReviewItem[] = [];
  const facts = analyzeCV(c);
  const bullets = facts.bullets.filter((b) => b.section !== "education");
  let n = 0;
  const add = (it: Omit<ReviewItem, "id">) => items.push({ id: `r${++n}`, ...it });

  /* ── Completeness ── */
  const p = c.personal;
  const missingContact = [!p.email.trim() && "email", !p.phone.trim() && "phone number", !p.location.trim() && "location"].filter(Boolean) as string[];
  if (!p.fullName.trim()) add({ severity: "issue", category: "Completeness", title: "Your name is missing", detail: "Add your full name at the top of the CV.", section: "personal" });
  if (missingContact.length)
    add({ severity: missingContact.includes("email") ? "issue" : "warn", category: "Completeness", title: `Add your ${missingContact.join(", ")}`, detail: "Recruiters need an easy way to contact you. City and country are enough for location.", section: "personal" });
  else if (p.fullName.trim()) add({ severity: "good", category: "Completeness", title: "Contact details are complete", detail: "Recruiters can reach you easily.", section: "personal" });
  if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email.trim()))
    add({ severity: "issue", category: "Completeness", title: "Your email address looks invalid", detail: `Check "${p.email}".`, section: "personal" });
  if (!p.linkedin.trim() && !p.website.trim())
    add({ severity: "warn", category: "Completeness", title: "Consider adding your LinkedIn profile", detail: "Many recruiters check LinkedIn. A short custom URL looks best.", section: "personal" });
  if (p.headline.trim() && !looksLikeTitle(p.headline))
    add({ severity: "issue", category: "Completeness", title: "Your professional title doesn't look like a job title", detail: `“${p.headline.trim()}” looks like an address or contact detail. Move it to Location and use a title such as your current role.`, section: "personal" });
  const summaryContact = c.summary.trim() ? addedContactDetail(c.summary, "", c) : null;
  if (summaryContact)
    add({ severity: "warn", category: "Content", title: "Your summary contains contact details", detail: `Remove “${summaryContact}” — addresses and contact details belong in the header, not the summary.`, section: "summary" });

  if (!c.experience.length)
    add({ severity: "warn", category: "Completeness", title: "No work experience yet", detail: "Add jobs, internships, part-time work or volunteering — anything that shows responsibility.", section: "experience" });
  for (const e of c.experience) {
    const name = e.role || e.company || "a position";
    if (!e.startDate.trim()) add({ severity: "warn", category: "Completeness", title: `Add dates to ${name}`, detail: "Missing dates make recruiters (and ATS) suspicious of gaps.", section: "experience" });
    if (!e.bullets.some((b) => b.text.trim())) add({ severity: "warn", category: "Completeness", title: `${name} has no bullet points`, detail: "Add 2–5 bullets describing what you did and achieved.", section: "experience" });
  }
  if (!c.education.length) add({ severity: "warn", category: "Completeness", title: "Education is missing", detail: "Most roles expect an education section, even a short one.", section: "education" });
  if (!c.skills.length) add({ severity: "issue", category: "Completeness", title: "Add a skills section", detail: "Skills help both recruiters and ATS match you to roles.", section: "skills" });
  else if (c.skills.length > 25) add({ severity: "warn", category: "Content", title: `You list ${c.skills.length} skills`, detail: "Long skill lists dilute your strengths. Keep the 10–20 most relevant.", section: "skills" });
  else if (c.skills.length < 4) add({ severity: "warn", category: "Content", title: "Your skills section is thin", detail: "List the tools and skills you genuinely use — aim for 6–15.", section: "skills" });

  /* ── Summary ── */
  const sw = wordCount(c.summary);
  const buzz = BUZZWORDS.filter((b) => c.summary.toLowerCase().includes(b));
  if (!sw) add({ severity: "warn", category: "Content", title: "Add a professional summary", detail: "2–3 sentences on who you are, your core skills and what you're looking for.", section: "summary" });
  else {
    if (buzz.length >= 2 || (buzz.length === 1 && sw < 30))
      add({ severity: "warn", category: "Content", title: "Your summary is too generic", detail: "Replace buzzwords with specifics: your field, years of experience, key skills and a concrete result.", section: "summary", examples: buzz.map((b) => `“${b}”`) });
    if (sw < 18) add({ severity: "warn", category: "Content", title: "Your summary is very short", detail: "Aim for 30–70 words.", section: "summary" });
    if (sw > 100) add({ severity: "warn", category: "Length", title: "Your summary is long", detail: `It has ${sw} words. Aim for 30–70 so it's read in seconds.`, section: "summary" });
    if (/\b(i|my|me)\b/i.test(c.summary)) add({ severity: "warn", category: "Language", title: "Avoid first-person pronouns in the summary", detail: "CVs are usually written without “I” or “my”.", section: "summary" });
    if (!buzz.length && sw >= 25 && sw <= 90) add({ severity: "good", category: "Content", title: "Your summary is a good length and specific", detail: "Nice — it's concise and avoids buzzwords.", section: "summary" });
  }

  /* ── Bullets ── */
  if (bullets.length) {
    const weak = bullets.filter((b) => WEAK_PHRASE_RE.test(b.text.trim()));
    if (weak.length) {
      const labels = new Map<string, number>();
      for (const b of weak) {
        const op = WEAK_OPENERS.find((o) => o.re.test(b.text.trim()));
        if (op) labels.set(op.label, (labels.get(op.label) ?? 0) + 1);
      }
      const top = [...labels.entries()].sort((a, b) => b[1] - a[1])[0];
      add({
        severity: weak.length >= 3 ? "issue" : "warn",
        category: "Content",
        title: top && top[1] === weak.length ? `${weak.length} bullet${weak.length === 1 ? "" : "s"} start${weak.length === 1 ? "s" : ""} with “${top[0]}”` : `${weak.length} bullets start with weak phrases`,
        detail: "Lead with a strong action verb (Managed, Built, Reduced…) and describe the result.",
        section: "experience",
        examples: weak.slice(0, 3).map((b) => b.text),
      });
    } else add({ severity: "good", category: "Content", title: "Bullets start with action verbs", detail: "No weak openers like “Responsible for”.", section: "experience" });

    const quantified = bullets.filter((b) => hasNumber(b.text));
    const ratio = quantified.length / bullets.length;
    if (ratio >= 0.4) add({ severity: "good", category: "Impact", title: "Your experience contains quantified achievements", detail: `${quantified.length} of ${bullets.length} bullets include numbers — great for credibility.`, section: "experience" });
    else
      add({
        severity: "warn",
        category: "Impact",
        title: `Only ${quantified.length} of ${bullets.length} bullets include numbers`,
        detail: "Where you know them, add real numbers: volume, frequency, team size, time or money saved. Never guess.",
        section: "experience",
        examples: bullets.filter((b) => !hasNumber(b.text) && /\b(process|manag|reduc|increas|improv|handl|led|lead|prepar|support|train|serv)/i.test(b.text)).slice(0, 3).map((b) => b.text),
      });

    // repetition of opening verbs
    const openers = new Map<string, number>();
    for (const b of bullets) {
      const w = firstWord(b.text);
      if (w) openers.set(w, (openers.get(w) ?? 0) + 1);
    }
    const repeated = [...openers.entries()].filter(([w, k]) => k >= 3 && !["responsible"].includes(w));
    if (repeated.length)
      add({ severity: "warn", category: "Language", title: `“${cap(repeated[0][0])}” starts ${repeated[0][1]} bullets`, detail: "Vary your action verbs to keep the CV engaging.", section: "experience" });

    // overused words
    const counts = new Map<string, number>();
    for (const b of bullets) for (const t of new Set(contentTokens(b.text))) if (!GENERIC.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
    const over = [...counts.entries()].filter(([, k]) => k >= 5).sort((a, b) => b[1] - a[1]);
    if (over.length) add({ severity: "warn", category: "Language", title: `The word “${over[0][0]}” is repeated ${over[0][1]} times`, detail: "Use synonyms or combine related bullets.", section: "experience" });

    const long = bullets.filter((b) => wordCount(b.text) > 35);
    if (long.length) add({ severity: "warn", category: "Clarity", title: `${long.length} bullet${long.length === 1 ? " is" : "s are"} over 35 words`, detail: "Long bullets get skimmed. Split them or cut filler.", section: "experience", examples: long.slice(0, 2).map((b) => b.text) });
    const short = bullets.filter((b) => wordCount(b.text) < 5);
    if (short.length) add({ severity: "warn", category: "Clarity", title: `${short.length} bullet${short.length === 1 ? " is" : "s are"} very short`, detail: "Add what you did, how, and the result.", section: "experience", examples: short.slice(0, 2).map((b) => b.text) });

    const firstPerson = bullets.filter((b) => /\b(i|my|me|we|our)\b/i.test(b.text));
    if (firstPerson.length) add({ severity: "warn", category: "Language", title: "Remove first-person pronouns from bullets", detail: "Write “Managed…”, not “I managed…”.", section: "experience", examples: firstPerson.slice(0, 2).map((b) => b.text) });

    const passive = bullets.filter((b) => /\b(was|were|been|being)\s+\w+ed\b/i.test(b.text));
    if (passive.length) add({ severity: "warn", category: "Language", title: `${passive.length} bullet${passive.length === 1 ? " uses" : "s use"} passive voice`, detail: "Active voice sounds more confident: “Reduced costs” instead of “Costs were reduced”.", section: "experience", examples: passive.slice(0, 2).map((b) => b.text) });

    // tense in past roles
    const presentInPast = bullets.filter((b) => {
      if (b.current || b.section !== "experience") return false;
      const v = verbFromAny(firstWord(b.text));
      return !!v && (firstWord(b.text) === v.base || firstWord(b.text) === v.third) && v.base !== v.past;
    });
    if (presentInPast.length) add({ severity: "warn", category: "Language", title: "Use past tense for previous roles", detail: "Bullets for jobs you've left should read “Managed”, not “Manage”.", section: "experience", examples: presentInPast.slice(0, 2).map((b) => b.text) });

    const strong = bullets.filter((b) => STRONG_VERBS.has(firstWord(b.text)));
    if (strong.length / bullets.length < 0.5 && !weak.length)
      add({ severity: "warn", category: "Content", title: "Use more specific action verbs", detail: "Verbs like Reconciled, Automated, Negotiated say more than Did or Worked.", section: "experience" });

    // consistency: trailing periods
    const withPeriod = bullets.filter((b) => /\.\s*$/.test(b.text)).length;
    if (withPeriod > 0 && withPeriod < bullets.length)
      add({ severity: "warn", category: "Formatting", title: "Inconsistent punctuation", detail: `${withPeriod} of ${bullets.length} bullets end with a period. Pick one style.`, section: "experience" });
    const lowerStart = bullets.filter((b) => /^[a-z]/.test(b.text.trim()));
    if (lowerStart.length) add({ severity: "warn", category: "Formatting", title: `${lowerStart.length} bullet${lowerStart.length === 1 ? " starts" : "s start"} with a lowercase letter`, detail: "Capitalize the first word of each bullet.", section: "experience" });
  }

  /* ── Spelling ── */
  const words = facts.fullText.toLowerCase().match(/[a-z]+/g) ?? [];
  const typos = [...new Set(words.filter((w) => COMMON_MISSPELLINGS[w]))];
  if (typos.length)
    add({ severity: "issue", category: "Language", title: `Possible spelling mistake${typos.length > 1 ? "s" : ""}`, detail: typos.map((t) => `“${t}” → “${COMMON_MISSPELLINGS[t]}”`).join(", "), examples: [] });
  if (/ {2,}/.test(facts.fullText)) add({ severity: "warn", category: "Formatting", title: "Double spaces found", detail: "Small thing, but it looks cleaner without them." });

  /* ── Dates consistency ── */
  const dateStyles = new Set(
    [...c.experience, ...c.education].flatMap((e) => [e.startDate, e.endDate]).filter((d) => d.trim()).map((d) => (/^\d{4}$/.test(d.trim()) ? "Y" : /^\d{1,2}[/.-]\d{4}$/.test(d.trim()) ? "N" : /[a-z]/i.test(d) ? "M" : "O")),
  );
  if (dateStyles.size > 1 && dateStyles.has("N")) add({ severity: "warn", category: "Formatting", title: "Mixed date formats", detail: "Use one style throughout, e.g. “Mar 2022 – Present”." });

  /* ── Length ── */
  const totalWords = wordCount(facts.fullText);
  if (pages > 2) add({ severity: "issue", category: "Length", title: `Your CV is currently ${pages} pages`, detail: "Consider reducing it to 1–2 pages. Trim older roles to 1–2 bullets and remove less relevant items — you decide what goes.", examples: [] });
  else if (pages === 2 && facts.years < 5) add({ severity: "warn", category: "Length", title: "Your CV is 2 pages", detail: "With under 5 years of experience, a 1-page CV is usually stronger." });
  else if (totalWords > 80) add({ severity: "good", category: "Length", title: `Good length (${pages} page${pages === 1 ? "" : "s"})`, detail: "Your CV is a comfortable length." });

  /* ── ATS ── */
  const tm = templateMeta(design.template);
  if (!tm.atsFriendly) add({ severity: "warn", category: "ATS", title: `The ${tm.name} template uses two columns`, detail: "Some applicant tracking systems read columns out of order. Use an ATS-friendly template for online applications." });
  else add({ severity: "good", category: "ATS", title: "ATS-friendly template", detail: `${tm.name} uses a clean single-column layout with real text.` });
  if (design.fontSize < 9) add({ severity: "warn", category: "ATS", title: "Font size is very small", detail: "Use at least 9.5pt for readability." });
  if (design.margin < 10) add({ severity: "warn", category: "ATS", title: "Margins are very narrow", detail: "Margins under 10mm can be clipped when printed." });

  /* ── Scoring ── */
  const penalty = { issue: 9, warn: 3.5, good: 0 };
  const score = Math.round(Math.max(18, 100 - items.reduce((s, i) => s + penalty[i.severity], 0)));
  const catNames = ["Content", "Impact", "Language", "Clarity", "Completeness", "Formatting", "ATS", "Length"];
  const categories = catNames
    .map((name) => {
      const list = items.filter((i) => i.category === name);
      if (!list.length) return null;
      return { name, score: Math.round(Math.max(20, 100 - list.reduce((s, i) => s + penalty[i.severity] * 2.2, 0))) };
    })
    .filter(Boolean) as { name: string; score: number }[];

  const order = { issue: 0, warn: 1, good: 2 };
  items.sort((a, b) => order[a.severity] - order[b.severity]);
  return { score, categories, items };
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

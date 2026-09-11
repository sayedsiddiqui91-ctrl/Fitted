import type { CVContent, Design } from "@/lib/cv/schema";
import { DEFAULT_DESIGN } from "@/lib/cv/defaults";
import type { AssistantAction, AssistantJobContext, AssistantSelection, ChatMessage, ChatReply } from "@/lib/ai/types";
import { analyzeCV, cvToText, evidenceFor, type BulletRef, type CVFacts } from "./cvAnalysis";
import { calculateJobMatch } from "./match";
import { reviewCV } from "./review";
import { prefersPresent, rewriteBullet, shorten, toGerundClause } from "./rewrite";
import { findTerms, indexText, joinList, lookupTerm, lowerFirst, sentenceCase, similarity, textHasTerm, wordCount } from "./text";
import { BUZZWORDS, COMMON_MISSPELLINGS, STRONG_VERBS, verbFromAny, WEAK_OPENERS, WEAK_PHRASE_RE } from "./verbs";
import { emptyAction, itemLabel, findItem, validateAction } from "./assistantActions";
import { summaryLead } from "./personalInfo";
import { buildTailoredSummary } from "./summaryWriter";

/* On-device CV assistant.
   Every answer is computed from the user's actual CV (and job, if one is attached).
   Proposed edits are returned as structured actions — the UI asks before applying,
   and every action passes the truthfulness validator. */

export interface AssistantInput {
  content: CVContent;
  selection: AssistantSelection;
  job: AssistantJobContext | null;
  design?: Design;
}

type Target =
  | { kind: "global" }
  | { kind: "summary" }
  | { kind: "skills" }
  | { kind: "section"; section: string }
  | { kind: "entry"; section: string; itemId: string; label: string; bullets: BulletRef[] }
  | { kind: "bullet"; ref: BulletRef }
  | { kind: "text"; text: string };

const ALTERNATIVES: Record<string, string[]> = {
  managed: ["Oversaw", "Coordinated", "Ran", "Directed"],
  helped: ["Supported", "Contributed to", "Enabled"],
  supported: ["Assisted", "Enabled", "Facilitated"],
  worked: ["Collaborated", "Partnered", "Contributed"],
  made: ["Created", "Built", "Produced"],
  did: ["Completed", "Delivered", "Executed"],
  used: ["Applied", "Worked with", "Leveraged"],
  improved: ["Streamlined", "Strengthened", "Optimized"],
  created: ["Built", "Designed", "Developed"],
  built: ["Developed", "Created", "Designed"],
  led: ["Headed", "Directed", "Steered"],
  prepared: ["Produced", "Compiled", "Drafted"],
  analyzed: ["Evaluated", "Assessed", "Examined"],
  handled: ["Managed", "Processed", "Resolved"],
  processed: ["Handled", "Administered", "Executed"],
  reconciled: ["Balanced", "Verified", "Matched"],
  contributed: ["Supported", "Helped deliver", "Participated in"],
};
const OVERCLAIM = /\b(world[- ]class|best[- ]in[- ]class|single[- ]handedly|revolutioni[sz]ed|transformed the (company|business)|guru|ninja|rockstar|unparalleled|flawless(ly)?|always|never failed|100% (accuracy|success))\b/i;

const norm = (s: string) => s.replace(/[“”"]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const bulletLabel = (b: BulletRef, facts: CVFacts) => {
  const idx = facts.bullets.filter((x) => x.itemId === b.itemId).findIndex((x) => x.bulletId === b.bulletId);
  return `${b.label || b.section} — bullet ${idx + 1}`;
};
const action = (p: Partial<AssistantAction> & Pick<AssistantAction, "type" | "newText">): AssistantAction => ({ ...emptyAction(), ...p });

function resolveTarget(msg: string, input: AssistantInput, facts: CVFacts): Target {
  const lower = msg.toLowerCase();
  const quoted = msg.match(/[“"']([^”"']{8,})[”"']/)?.[1];
  if (quoted) {
    const b = facts.bullets.find((x) => norm(x.text) === norm(quoted) || norm(x.text).includes(norm(quoted)));
    if (b) return { kind: "bullet", ref: b };
    if (norm(input.content.summary).includes(norm(quoted))) return { kind: "summary" };
    return { kind: "text", text: quoted };
  }
  if (/\b(summary|profile|about me|personal statement)\b/.test(lower)) return { kind: "summary" };
  if (/\b(experience section|my experience|work experience|work history|my jobs|my roles|all (my )?bullets)\b/.test(lower)) return { kind: "section", section: "experience" };
  if (/\bskills? (section|list)\b|\bmy skills\b/.test(lower)) return { kind: "skills" };
  if (/\b(my (whole |entire )?(cv|resume)|overall|everything|whole cv)\b/.test(lower)) return { kind: "global" };

  const s = input.selection;
  if (s.scope === "bullet" && s.bulletId) {
    const b = facts.bullets.find((x) => x.bulletId === s.bulletId);
    if (b) return { kind: "bullet", ref: b };
  }
  if ((s.scope === "entry" || s.scope === "bullet") && s.itemId && s.section) {
    const item = findItem(input.content, s.section, s.itemId);
    if (item) return { kind: "entry", section: s.section, itemId: s.itemId, label: itemLabel(item), bullets: facts.bullets.filter((b) => b.itemId === s.itemId) };
  }
  if (s.scope === "section" && s.section) {
    if (s.section === "summary") return { kind: "summary" };
    if (s.section === "skills") return { kind: "skills" };
    return { kind: "section", section: s.section };
  }
  return { kind: "global" };
}

function bulletProblems(text: string): string[] {
  const p: string[] = [];
  const t = text.trim();
  const op = WEAK_OPENERS.find((o) => o.re.test(t));
  if (op) p.push(`starts with “${op.label}”`);
  else if (!verbFromAny(t.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "")) p.push("doesn't start with an action verb");
  if (wordCount(t) > 35) p.push(`is long (${wordCount(t)} words)`);
  if (wordCount(t) < 5) p.push("is very short");
  if (/\b(i|my|we|our)\b/i.test(t)) p.push("uses first person");
  return p;
}

function improveBullet(b: BulletRef, input: AssistantInput, facts: CVFacts, mode: "balanced" | "aggressive" = "balanced") {
  const roleBullets = facts.bullets.filter((x) => x.itemId === b.itemId).map((x) => x.text);
  const period = facts.bullets.filter((x) => /\.\s*$/.test(x.text)).length >= facts.bullets.length / 2;
  const jobTerms = input.job ? [...input.job.analysis.requiredSkills, ...input.job.analysis.preferredSkills] : [];
  return rewriteBullet(b.text, { current: b.current && prefersPresent(roleBullets), mode, endWithPeriod: period, jobTerms });
}

/* ───────── Summary building (facts only) ───────── */
function summaryFacts(content: CVContent, facts: CVFacts, job: AssistantJobContext | null) {
  const headline = summaryLead(content);
  const relevance = (term: string) => (job ? (job.analysis.requiredSkills.includes(term) ? 3 : job.analysis.preferredSkills.includes(term) ? 2 : job.analysis.keywords.includes(term) ? 1 : 0) : 0);
  const domains: string[] = [];
  const tools: string[] = [];
  const entries = [...facts.terms.entries()]
    .filter(([canon]) => {
      const lex = lookupTerm(canon);
      return lex && lex.category !== "soft" && lex.category !== "certification";
    })
    .sort((a, b) => relevance(b[0]) - relevance(a[0]) || b[1].where.length - a[1].where.length);
  for (const [canon, v] of entries) {
    const lex = lookupTerm(canon)!;
    if (lex.category === "tool") tools.push(canon);
    else if (v.where.some((w) => w === "experience" || w === "projects" || w === "summary")) {
      const d = /^[A-Z&]{2,}$|&/.test(canon) ? canon : canon.toLowerCase();
      if (d === "reporting" || domains.some((x) => x.includes(d) || d.includes(x))) continue;
      domains.push(d);
    }
  }
  for (const s of content.skills) if (!tools.includes(s.name) && lookupTerm(s.name)?.category === "tool") tools.push(s.name);
  // Quantified achievements, read through the conservative rewrite so weak openers don't disqualify them
  const rel = (t: string) => (job ? Math.max(0, ...job.analysis.responsibilities.map((r) => similarity(r, t))) : 0);
  const best = facts.bullets
    .filter((b) => b.section !== "education" && /\d/.test(b.text))
    .map((b) => rewriteBullet(b.text, { current: false, mode: "conservative", endWithPeriod: false }).text)
    .filter((t) => STRONG_VERBS.has(t.split(/\s+/)[0].toLowerCase()))
    .sort((a, b) => rel(b) - rel(a))[0];
  const achievement = best ? toGerundClause(best) : null;
  const years = facts.years >= 1 ? `${facts.years}+ year${facts.years === 1 ? "" : "s"} of experience` : facts.months >= 3 ? "hands-on experience" : "";
  const companies = [...new Set(content.experience.map((e) => e.company.trim()).filter(Boolean))];
  return { headline: sentenceCase(headline), domains, tools, achievement, years, companies };
}

export function summaryVariants(content: CVContent, facts: CVFacts, job: AssistantJobContext | null): { label: string; text: string }[] {
  const f = summaryFacts(content, facts, job);
  const d3 = joinList(f.domains.slice(0, 3));
  const t3 = joinList(f.tools.slice(0, 3));
  const out: { label: string; text: string }[] = [];
  const lead = f.years ? `${f.headline} with ${f.years}` : f.headline;
  // 1. Tailored (job attached) or recruiter-style concise summary: overlap + a real point from experience, 40–60 words
  const tailored = buildTailoredSummary(content, facts, job?.analysis ?? null);
  out.push({
    label: job ? "Tailored to the job" : "Concise",
    text: tailored?.text ?? [d3 ? `${lead} in ${d3}.` : `${lead}.`, t3 ? `Skilled in ${t3}.` : ""].filter(Boolean).join(" "),
  });
  // 2. Achievement-led
  if (f.achievement)
    out.push({
      label: "Achievement-led",
      text: [f.domains.length ? `${lead} in ${joinList(f.domains.slice(0, 2))}.` : `${lead}.`, `Highlights include ${lowerFirst(f.achievement)}.`, t3 ? `Works confidently with ${t3}.` : ""].filter(Boolean).join(" "),
    });
  // 3. Experience-led (employers are facts from the CV)
  if (f.companies.length && f.domains.length)
    out.push({
      label: "Experience-led",
      text: `${f.headline} with ${f.years || "experience"} at ${joinList(f.companies.slice(0, 2))}, covering ${joinList(f.domains.slice(0, 3))}.${f.tools.length ? ` Proficient in ${joinList(f.tools.slice(0, 3))}.` : ""}`,
    });
  // 4. Skills-led
  if (f.domains.length >= 2 || f.tools.length >= 3)
    out.push({
      label: "Skills-led",
      text: `${f.headline}${f.domains.length ? ` experienced in ${joinList(f.domains.slice(0, 4))}` : ""}${f.tools.length ? `, with hands-on skills in ${joinList(f.tools.slice(0, 4))}` : ""}.${f.years ? ` Brings ${f.years.replace("of experience", "of relevant experience")}.` : ""}`,
    });
  return out.filter((v) => v.text.split(/\s+/).length >= 6 && norm(v.text) !== norm(content.summary)).slice(0, 3);
}

/* ───────── Main entry ───────── */
export function localAssistant(history: ChatMessage[], input: AssistantInput): ChatReply {
  const content = input.content;
  const design = input.design ?? DEFAULT_DESIGN;
  const facts = analyzeCV(content);
  const last = history[history.length - 1]?.content.trim() ?? "";
  const lower = last.toLowerCase();
  const target = resolveTarget(last, input, facts);
  const userFacts = history.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const forbidden = input.job ? [input.job.company, input.job.analysis.location ?? ""].filter(Boolean) : [];
  const finalize = (reply: string, actions: AssistantAction[] = [], followUps: string[] = []): ChatReply => {
    const valid: AssistantAction[] = [];
    const dropped: string[] = [];
    for (const a of actions) {
      const v = validateAction(a, content, userFacts, forbidden);
      if (v.ok) valid.push(v.action);
      else if (v.problem && v.problem !== "No change.") dropped.push(v.problem);
    }
    const note = dropped.length ? `\n\n(I held back ${dropped.length} suggestion${dropped.length === 1 ? "" : "s"} because ${lowerFirst(dropped[0].replace(/\.$/, ""))}.)` : "";
    return { reply: reply + note, actions: valid, followUps: followUps.slice(0, 4) };
  };
  const targetText = target.kind === "bullet" ? target.ref.text : target.kind === "summary" ? content.summary : target.kind === "text" ? target.text : "";

  if (!last) return finalize("Ask me anything about your CV.");

  /* User supplies a fact ("I managed a team of 4", "add Tableau to my skills") */
  const addSkill = last.match(/\badd\s+(.+?)\s+(?:to|in)\s+(?:my\s+)?skills?\b/i);
  if (addSkill) {
    const names = addSkill[1].split(/,|\band\b/).map((s) => s.trim().replace(/^["“']|["”']$/g, "")).filter(Boolean);
    // Anything after the skills clause ("…and say I increased revenue by 40%") must not be dropped silently
    const rest = last
      .slice((addSkill.index ?? 0) + addSkill[0].length)
      .replace(/^[\s,;.]*(?:and|also|then)?\s*(?:say|mention|add|write|put|include)?\s*(?:that\s+)?/i, "")
      .replace(/[.!?\s]+$/, "")
      .trim();
    const restNote =
      rest.split(/\s+/).length >= 2
        ? `\n\nI didn't add “${rest}”. Tell me which role it belongs to and where it comes from — select that job or bullet, then tell me again in your own words and I'll add it as you describe it.`
        : "";
    return finalize(
      (names.length === 1 ? `Sure — since you've told me you have it, I can add “${names[0]}” to your skills.` : `Sure — I can add these to your skills since you've confirmed them:`) + restNote,
      names.map((n) => action({ type: "add_skill", newText: n })),
      ["Which parts of my CV are weak?"],
    );
  }
  /* Team / people management claims without specifics → ask, never invent */
  if (/\b(team|people|staff|reports|direct reports)\b/.test(lower) && /\b(manag|lead|led|supervis|oversaw)/.test(lower) && !/\d/.test(lower)) {
    const has = facts.bullets.some((b) => /\b(led|managed|supervised|trained|mentored)\b[^.]{0,40}\b(team|staff|people|interns?|analysts?)\b/i.test(b.text));
    // No follow-up chip with an example claim: one click would put words in the user's mouth.
    if (!has)
      return finalize("Your CV doesn't mention team management. If you managed people, tell me the team size and what the team did (e.g. “I led a team of 4 AP clerks”), and I can incorporate it. I won't add it without those details.", [], ["Which parts of my CV are weak?"]);
  }

  const statement = last.match(/^(?:(?:please\s+)?add\s+(?:that\s+)?)?(?:i|we)\s+(?:have\s+|also\s+|recently\s+)?([a-z]+)\s+(.{6,})$/i);
  if (statement && verbFromAny(statement[1].toLowerCase())) {
    const period = /\.\s*$/.test(facts.bullets[0]?.text ?? "");
    const text = rewriteBullet(`${statement[1]} ${statement[2]}`, { current: false, mode: "balanced", endWithPeriod: period }).text;
    const entry = target.kind === "bullet" ? { section: target.ref.section, itemId: target.ref.itemId } : target.kind === "entry" ? { section: target.section, itemId: target.itemId } : content.experience[0] ? { section: "experience", itemId: content.experience[0].id } : null;
    const item = entry ? findItem(content, entry.section, entry.itemId) : undefined;
    // A figure given while a bullet is selected → offer to fold it into that bullet
    const fig = statement[2].match(/(?:(about|around|roughly|approximately|approx\.?|nearly|over|~)\s*)?(\d[\d,.]*\s?(?:%|\+|k)?)\s*(.*)$/i);
    if (target.kind === "bullet" && fig) {
      const phrase = `${fig[1] ? (/over/i.test(fig[1]) ? "over " : "~") : ""}${fig[2].trim()}${fig[3] && !/%/.test(fig[2]) ? ` ${fig[3].replace(/[.!]+$/, "").split(/\s+/).slice(0, 5).join(" ")}` : ""}`;
      const merged = `${target.ref.text.replace(/[.]\s*$/, "")} (${phrase})${/\.\s*$/.test(target.ref.text) ? "." : ""}`;
      return finalize(
        "Thanks — I can fold that figure into the bullet you selected, or add it as a separate bullet. Only apply it if the number is accurate.",
        [action({ type: "update_bullet", section: target.ref.section, itemId: target.ref.itemId, bulletId: target.ref.bulletId, newText: merged, label: `${bulletLabel(target.ref, facts)} (with your figure)` }), ...(entry ? [action({ type: "add_bullet", section: entry.section, itemId: entry.itemId, newText: text })] : [])],
      );
    }
    if (entry) return finalize(`Got it. Here's a bullet based on what you told me, for ${itemLabel(item) || "your most recent role"}:`, [action({ type: "add_bullet", section: entry.section, itemId: entry.itemId, newText: text })], ["Make it shorter", "Does this sound exaggerated?"]);
    return finalize("Add a position in the Experience section first, then I can turn that into a bullet for it.");
  }

  /* Three versions of the summary */
  if (/\b(three|3|several|multiple|some|few)\b.*\b(versions?|options?|variations?|alternatives?|drafts?)\b|\b(versions?|options?|variations?)\b.*\bsummary\b/.test(lower) && (target.kind === "summary" || /summary|profile/.test(lower))) {
    const vars = summaryVariants(content, facts, input.job);
    if (!vars.length) return finalize("I need a bit more in your CV to write summaries — add at least one position or a few skills first.");
    return finalize(
      `Here are ${vars.length} versions, built only from your CV${input.job ? ` and prioritizing what the ${input.job.title || "target"} role asks for` : ""}:\n${vars.map((v, i) => `${i + 1}. ${v.label}`).join("\n")}`,
      vars.map((v) => action({ type: "replace_summary", newText: v.text, label: `Summary — ${v.label}` })),
      ["Make it shorter", "Which parts of my CV are weak?"],
    );
  }

  /* Exaggeration check */
  if (/(exaggerat|overclaim|too much|honest|believ|credible|sound (too|over))/.test(lower)) {
    const text = targetText || (target.kind === "entry" ? target.bullets.map((b) => b.text).join(" ") : content.summary);
    if (!text) return finalize("Select a bullet (click into it in the editor) or quote the text, and I'll check it.");
    const flags: string[] = [];
    if (OVERCLAIM.test(text)) flags.push(`“${text.match(OVERCLAIM)![0]}” is a very strong claim — be ready to prove it.`);
    if (/\b(spearheaded|led|owned|drove|headed)\b/i.test(text)) flags.push("“Led/spearheaded” implies you were in charge. If you contributed as part of a team, “contributed to” or “supported” is more accurate.");
    const buzz = BUZZWORDS.filter((b) => text.toLowerCase().includes(b));
    if (buzz.length) flags.push(`Generic phrases (${buzz.map((b) => `“${b}”`).join(", ")}) read as filler — specifics are more credible.`);
    const nums = text.match(/\d[\d,.]*\s?(%|\+|k|m)?/gi);
    if (nums) flags.push(`Be ready to explain how you measured ${nums.map((n) => `“${n.trim()}”`).join(", ")}.`);
    return finalize(flags.length ? `A few things to check:\n• ${flags.join("\n• ")}` : "This reads as credible — it's specific and doesn't claim more than it describes.");
  }

  /* Better verbs */
  if (/\b(verbs?|synonyms?|word instead|alternative words?)\b/.test(lower)) {
    if (target.kind !== "bullet") return finalize("Click into a bullet in the editor (or quote it) and I'll suggest stronger, accurate verbs for it.");
    const r = improveBullet(target.ref, input, facts);
    const base = r.text;
    const first = base.split(/\s+/)[0];
    const alts = ALTERNATIVES[(verbFromAny(first.toLowerCase())?.past ?? first).toLowerCase()] ?? ["Delivered", "Coordinated", "Streamlined"];
    const acts = [norm(base) !== norm(target.ref.text) ? base : null, ...alts.slice(0, 2).map((v) => `${v}${base.slice(first.length)}`)].filter((x): x is string => !!x);
    return finalize(`Options for “${first}” — pick the one that most accurately describes what you did:`, acts.map((t) => action({ type: "update_bullet", section: target.ref.section, itemId: target.ref.itemId, bulletId: target.ref.bulletId, newText: t })));
  }

  /* Shorter */
  if (/\b(short|shorter|concise|trim|cut down|brief|tighten)\b/.test(lower)) {
    if (target.kind === "bullet") {
      const s = shorten(target.ref.text);
      if (norm(s) === norm(target.ref.text)) return finalize(`It's already tight at ${wordCount(target.ref.text)} words. The only option is dropping a clause — tell me which detail matters least.`);
      return finalize(`Shorter version (${wordCount(target.ref.text)} → ${wordCount(s)} words, same facts):`, [action({ type: "update_bullet", section: target.ref.section, itemId: target.ref.itemId, bulletId: target.ref.bulletId, newText: s })]);
    }
    if (target.kind === "summary" || (target.kind === "global" && /summary/.test(lower))) {
      const sents = content.summary.split(/(?<=[.!?])\s+/).filter(Boolean);
      const s = sents.length > 2 ? sents.slice(0, 2).join(" ") : shorten(content.summary);
      if (!content.summary.trim() || norm(s) === norm(content.summary)) return finalize("Your summary is already short. Want me to make it stronger instead?", [], ["Make my summary stronger"]);
      return finalize(`Shorter summary (${wordCount(content.summary)} → ${wordCount(s)} words):`, [action({ type: "replace_summary", newText: s })]);
    }
    const pool = target.kind === "entry" ? target.bullets : facts.bullets.filter((b) => b.section !== "education");
    const long = pool.filter((b) => wordCount(b.text) > 22);
    if (!long.length) return finalize("None of your bullets are long — they're all under 23 words.");
    return finalize(`${long.length} bullet${long.length === 1 ? " is" : "s are"} on the long side. Shorter versions:`, long.slice(0, 5).map((b) => action({ type: "update_bullet", section: b.section, itemId: b.itemId, bulletId: b.bulletId, newText: shorten(b.text) })));
  }

  /* Job fit */
  if (/(enough experience|qualified|good fit|right fit|a fit|match (for|this)|suitable|should i apply|chance|do i meet)/.test(lower)) {
    if (!input.job) return finalize("I don't have a job description for this CV yet. Use “Optimize for a Job” to paste one, and I'll compare your experience with what the employer is asking for.", [], ["Which parts of my CV are weak?"]);
    const j = input.job;
    const m = j.match ?? calculateJobMatch(content, design, j.analysis);
    const req = j.analysis.requiredSkills;
    const status = req.map((t) => ({ t, ev: evidenceFor(facts, t) }));
    const strong = status.filter((s) => s.ev.status === "strong").map((s) => s.t);
    const listed = status.filter((s) => s.ev.status === "listed" || s.ev.status === "mentioned").map((s) => s.t);
    const missing = status.filter((s) => s.ev.status === "none").map((s) => s.t);
    const coverage = req.length ? (strong.length + listed.length * 0.6) / req.length : 1;
    const yrs = j.analysis.yearsExperience;
    const yearsOk = yrs == null || facts.years >= yrs;
    const verdict = coverage >= 0.7 && yearsOk ? "On paper, yes — you cover most of what this role asks for." : coverage >= 0.4 ? "Partly. You have a solid base, but there are real gaps." : "It's a stretch based on what your CV shows today.";
    const lines = [
      verdict,
      yrs != null ? `• Experience: the role asks for ${yrs}+ years; your CV shows about ${facts.years} year${facts.years === 1 ? "" : "s"}${yearsOk ? " ✓" : " — below the ask"}.` : "",
      strong.length ? `• Shown in your experience: ${strong.slice(0, 6).join(", ")}.` : "",
      listed.length ? `• Listed but not backed by an achievement: ${listed.slice(0, 5).join(", ")} — add a bullet showing how you used them, if you can.` : "",
      missing.length ? `• Not in your CV: ${missing.slice(0, 6).join(", ")}. Only add these if you genuinely have the experience.` : "",
      `Estimated job match: ${m.overall}%.`,
    ].filter(Boolean);
    return finalize(lines.join("\n"), [], ["Why is my CV match score low?", "Improve my experience section"]);
  }

  /* Why is the score low */
  if (/(score|match).*(low|bad|poor|improve|why|higher)|why.*(score|match)|increase (my )?(score|match)/.test(lower)) {
    if (!input.job) {
      const r = reviewCV(content, design, 1);
      return finalize(`There's no job attached, so there's no job match score yet. Your general CV quality score is about ${r.score}/100. The main things holding it back:\n${r.items.filter((i) => i.severity !== "good").slice(0, 4).map((i) => `• ${i.title}`).join("\n") || "• Nothing major."}`, [], ["Which parts of my CV are weak?"]);
    }
    const m = input.job.match ?? calculateJobMatch(content, design, input.job.analysis);
    const dims: [string, number][] = [["keyword coverage", m.breakdown.keyword], ["required/preferred skills", m.breakdown.skills], ["experience relevance", m.breakdown.experience], ...(m.educationApplicable ? [["education", m.breakdown.education] as [string, number]] : []), ["formatting/ATS readiness", m.breakdown.formatting]];
    dims.sort((a, b) => a[1] - b[1]);
    const missingReq = m.keywords.doNotAdd.filter((k) => k.importance === "required").map((k) => k.term);
    const askable = m.keywords.canAdd.slice(0, 4).map((k) => k.term);
    const lines = [
      `Your estimated job match is ${m.overall}%. The weakest areas are ${dims[0][0]} (${dims[0][1]}%) and ${dims[1][0]} (${dims[1][1]}%).`,
      m.weakAreas.length ? m.weakAreas.slice(0, 3).map((w) => `• ${w}`).join("\n") : "",
      askable.length ? `Related experience you might be under-selling: ${askable.join(", ")}. If you've done these, say so (e.g. “I prepared monthly forecasts”) and I'll add it truthfully.` : "",
      missingReq.length ? `Genuinely missing requirements: ${missingReq.join(", ")}. Don't add them unless you have them — they'll come up in interviews.` : "",
    ].filter(Boolean);
    return finalize(lines.join("\n\n"), [], ["Improve my experience section", "Make my summary stronger"]);
  }

  /* Weak parts / review */
  if (/(weak|weakest|what'?s wrong|problems?|issues?|feedback|review|critique|how (good|is) my|improve my (cv|resume)|what (should|can) i improve)/.test(lower)) {
    const r = reviewCV(content, design, 1);
    const pool = target.kind === "entry" ? target.bullets : facts.bullets.filter((b) => b.section !== "education");
    const weak = pool.map((b) => ({ b, p: bulletProblems(b.text) })).filter((x) => x.p.length);
    const lines: string[] = [];
    if (target.kind !== "entry") {
      const summaryIssues = r.items.filter((i) => i.section === "summary" && i.severity !== "good");
      if (summaryIssues.length) lines.push(`• Summary: ${summaryIssues.map((i) => lowerFirst(i.title)).join("; ")}.`);
    }
    for (const w of weak.slice(0, 5)) lines.push(`• “${w.b.text.length > 70 ? `${w.b.text.slice(0, 68)}…` : w.b.text}” (${w.b.label}) ${w.p.join(", ")}.`);
    const noNums = pool.filter((b) => !/\d/.test(b.text));
    if (noNums.length && pool.length) lines.push(`• ${noNums.length} of ${pool.length} bullets have no numbers. Where you know them, volume, frequency or results make bullets far stronger.`);
    if (target.kind !== "entry") for (const i of r.items.filter((x) => x.severity === "issue" && !x.section?.includes("experience") && x.section !== "summary").slice(0, 2)) lines.push(`• ${i.title}.`);
    const fixes = weak
      .slice(0, 4)
      .map(({ b }) => ({ b, r: improveBullet(b, input, facts) }))
      .filter((x) => norm(x.r.text) !== norm(x.b.text))
      .map((x) => action({ type: "update_bullet", section: x.b.section, itemId: x.b.itemId, bulletId: x.b.bulletId, newText: x.r.text }));
    if (!lines.length) return finalize(`${target.kind === "entry" ? `This entry (${target.label})` : "Your CV"} is in good shape: bullets start with action verbs and nothing is too long. The next step up is adding real numbers where you have them.`, [], ["Make my summary stronger"]);
    return finalize(`Here's what's weakest${target.kind === "entry" ? ` in ${target.label}` : " in your CV"}, based on what it actually says:\n${lines.join("\n")}${fixes.length ? "\n\nI've drafted fixes for the weak bullets below — review each one." : ""}`, fixes, ["Make my summary stronger", "Give me three versions of my summary"]);
  }

  /* Improve / strengthen */
  if (/\b(strong|stronger|better|improve|rewrite|polish|punch|impact|enhance|fix|tailor|optimi[sz]e)\b/.test(lower)) {
    if (target.kind === "summary" || (target.kind === "global" && /summary/.test(lower))) {
      const vars = summaryVariants(content, facts, input.job);
      if (!vars.length) return finalize("Add at least one position or some skills first — a summary has to be built from real facts in your CV.");
      const buzz = BUZZWORDS.filter((b) => content.summary.toLowerCase().includes(b));
      const why = [content.summary.trim() ? "" : "You don't have a summary yet.", buzz.length ? `It replaces generic wording (${buzz.map((b) => `“${b}”`).join(", ")}) with specifics from your experience.` : "It leads with your role, experience and strongest skills from your CV."].filter(Boolean).join(" ");
      return finalize(`Here's a stronger summary. ${why} Nothing in it is invented.`, [action({ type: "replace_summary", newText: vars[0].text, label: "Summary" })], ["Give me three versions of my summary", "Make it shorter"]);
    }
    if (target.kind === "bullet") {
      const r = improveBullet(target.ref, input, facts, "aggressive");
      if (norm(r.text) === norm(target.ref.text)) {
        return finalize(`This bullet already starts with a strong verb.${/\d/.test(target.ref.text) ? " It's in good shape." : " The biggest upgrade is a real number — how many, how often, or what changed? Tell me (e.g. “about 150 a day”) and I'll add it. I won't invent one."}`, [], ["Suggest better verbs", "Make it shorter"]);
      }
      return finalize(`Stronger version — ${r.reasons.map((x) => lowerFirst(x)).join("; ")}.${/\d/.test(target.ref.text) ? "" : " If you know a real number (volume, frequency, time saved), tell me and I'll work it in."}`, [action({ type: "update_bullet", section: target.ref.section, itemId: target.ref.itemId, bulletId: target.ref.bulletId, newText: r.text })], ["Make it shorter", "Does this sound exaggerated?"]);
    }
    if (target.kind === "text") {
      const r = rewriteBullet(target.text, { current: false, mode: "aggressive", endWithPeriod: /\.$/.test(target.text) });
      return finalize("Here's a stronger version of that text (copy it where you need it):\n" + r.text);
    }
    if (target.kind === "skills") {
      const skills = content.skills.map((s) => s.name);
      const demonstrated = [...facts.terms.entries()].filter(([c, v]) => v.where.includes("experience") && lookupTerm(c)?.category !== "soft" && !skills.some((s) => textHasTerm(indexText(s), c)));
      return finalize(
        demonstrated.length ? `Your experience shows skills that aren't in your skills list yet. Add them?` : `Your skills list covers what your experience shows. ${skills.length > 20 ? "It's long — consider trimming to your 10–20 most relevant." : ""}`,
        demonstrated.slice(0, 6).map(([c]) => action({ type: "add_skill", newText: c })),
      );
    }
    // entry or experience section or global → improve bullets
    const pool = target.kind === "entry" ? target.bullets : facts.bullets.filter((b) => (target.kind === "section" ? b.section === target.section : b.section === "experience"));
    const fixes = pool
      .map((b) => ({ b, r: improveBullet(b, input, facts) }))
      .filter((x) => norm(x.r.text) !== norm(x.b.text));
    const noNums = pool.filter((b) => !/\d/.test(b.text));
    const where = target.kind === "entry" ? target.label : "your experience section";
    if (!fixes.length) {
      return finalize(`The bullets in ${where} already start with action verbs. ${noNums.length ? `The next improvement is numbers — ${noNums.length} bullet${noNums.length === 1 ? " has" : "s have"} none. For example: “${noNums[0].text}” — roughly how many, how often, or what changed?` : "They also include numbers — nice."}`);
    }
    return finalize(
      `I rewrote ${fixes.length} bullet${fixes.length === 1 ? "" : "s"} in ${where} using only what they already say (stronger verbs, correct tense, less filler).${noNums.length ? ` ${noNums.length} bullet${noNums.length === 1 ? " still has" : "s still have"} no numbers — tell me any real figures and I'll add them.` : ""}`,
      fixes.slice(0, 8).map((x) => action({ type: "update_bullet", section: x.b.section, itemId: x.b.itemId, bulletId: x.b.bulletId, newText: x.r.text })),
      ["Which parts of my CV are weak?", "Make my summary stronger"],
    );
  }

  /* Grammar / spelling */
  if (/(grammar|spell|typo|proofread|mistakes?)/.test(lower)) {
    const words = facts.fullText.toLowerCase().match(/[a-z]+/g) ?? [];
    const typos = [...new Set(words.filter((w) => COMMON_MISSPELLINGS[w]))];
    const issues = typos.map((t) => `“${t}” → “${COMMON_MISSPELLINGS[t]}”`);
    if (/ {2,}/.test(facts.fullText)) issues.push("double spaces");
    const lowerStart = facts.bullets.filter((b) => /^[a-z]/.test(b.text.trim()));
    if (lowerStart.length) issues.push(`${lowerStart.length} bullet${lowerStart.length === 1 ? " starts" : "s start"} with a lowercase letter`);
    return finalize(issues.length ? `I found: ${issues.join(", ")}.` : "I didn't find common spelling or formatting mistakes. (I check a list of frequent CV typos — it's not a full spellchecker.)");
  }

  /* Numbers */
  if (/(metric|number|quantif|measur|numbers)/.test(lower)) {
    const noNums = facts.bullets.filter((b) => b.section !== "education" && !/\d/.test(b.text));
    if (!noNums.length) return finalize("All your bullets already include numbers. 👍".replace(" 👍", ""));
    return finalize(`${noNums.length} bullet${noNums.length === 1 ? " has" : "s have"} no numbers:\n${noNums.slice(0, 5).map((b) => `• “${b.text}” (${b.label})`).join("\n")}\n\nClick into one and tell me a real figure (e.g. “I processed about 150 a day”) — I'll add it. Estimates are fine if you mark them with “~”.`);
  }

  /* Missing information */
  if (/(missing|what should i add|what else|complete|gaps?)/.test(lower)) {
    const r = reviewCV(content, design, 1);
    const miss = r.items.filter((i) => i.category === "Completeness" && i.severity !== "good");
    return finalize(miss.length ? `Missing or incomplete:\n${miss.map((i) => `• ${i.title} — ${i.detail}`).join("\n")}` : "Nothing essential is missing: contact details, experience, education and skills are all there.");
  }

  /* Contextual fallback */
  const weakCount = facts.bullets.filter((b) => WEAK_PHRASE_RE.test(b.text.trim())).length;
  const ctxLine =
    target.kind === "bullet" ? `You're working on: “${target.ref.text}”.` : target.kind === "entry" ? `You're working on ${target.label}.` : `Your CV has ${content.experience.length} position${content.experience.length === 1 ? "" : "s"}, ${facts.bullets.length} bullet${facts.bullets.length === 1 ? "" : "s"} and ${content.skills.length} skills${weakCount ? `; ${weakCount} bullet${weakCount === 1 ? " starts" : "s start"} with a weak phrase` : ""}.`;
  return finalize(
    `${ctxLine} I can help with things like:`,
    [],
    target.kind === "bullet"
      ? ["Make this stronger", "Make it shorter", "Does this sound exaggerated?", "Suggest better verbs"]
      : input.job
        ? ["Do I have enough experience for this job?", "Why is my CV match score low?", "Which parts of my CV are weak?", "Make my summary stronger"]
        : ["Which parts of my CV are weak?", "Make my summary stronger", "Give me three versions of my summary", "Improve my experience section"],
  );
}

/** Convenience used by the job-match UI and tests. */
export function jobTermsInText(text: string): string[] {
  return [...findTerms(indexText(text)).keys()];
}
export { cvToText };

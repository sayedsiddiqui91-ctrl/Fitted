import type { CVContent, Design } from "@/lib/cv/schema";
import { clone } from "@/lib/utils";
import { findItem, itemLabel, validateAction } from "./assistantActions";
import { analyzeCV, cvToText } from "./cvAnalysis";
import { looksLikeAddress, looksLikeTitle } from "./personalInfo";
import { reviewCV } from "./review";
import { prefersPresent, rewriteBullet } from "./rewrite";
import { buildTailoredSummary, polishSummary, summaryScore } from "./summaryWriter";
import { BUZZWORDS, COMMON_MISSPELLINGS, WEAK_PHRASE_RE } from "./verbs";

/* "Fix it for me" in Review My CV.
   Only SAFE, fact-preserving fixes: wording, tense, spelling, punctuation, consistency, duplicate skills,
   date style, a generic summary rewritten from the CV's own facts, a title taken from the CV's latest role.
   Every text change passes the same truth check as the assistant (no new numbers, tools or skills).
   Things only the user can supply (real numbers, LinkedIn, missing sections) are never "fixed" — the review
   keeps listing them. Bigger changes (whole-summary rewrite, adding a title) are opt-in. */

export type FixKind = "bullet" | "summary" | "title" | "spelling" | "skills" | "dates";

export interface AutoFix {
  id: string;
  kind: FixKind;
  /** Where it applies, e.g. "Summary" or "Accounts Executive · SMAC — bullet 2" */
  where: string;
  reason: string;
  before: string;
  after: string;
  /** Bigger change — not selected by default */
  optional?: boolean;
  apply: (c: CVContent) => void;
}

export interface AutoFixPlan {
  fixes: AutoFix[];
  scoreBefore: number;
  /** Estimated score with the default (non-optional) fixes applied */
  scoreAfter: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type BulletSection = "experience" | "projects" | "volunteer";
const BULLET_SECTIONS: BulletSection[] = ["experience", "projects", "volunteer"];

/** Corrects known misspellings (keeping capitalization) and double spaces. */
export function fixSpelling(text: string): string {
  return text
    .replace(/[A-Za-z]+/g, (w) => {
      const fix = COMMON_MISSPELLINGS[w.toLowerCase()];
      if (!fix) return w;
      return w === w.toUpperCase() && w.length > 1 ? fix.toUpperCase() : /^[A-Z]/.test(w) ? fix[0].toUpperCase() + fix.slice(1) : fix;
    })
    .replace(/ {2,}/g, " ");
}

export function applyAutoFixes(content: CVContent, fixes: AutoFix[]): CVContent {
  const c = clone(content);
  for (const f of fixes) f.apply(c);
  return c;
}

export function planAutoFixes(content: CVContent, design: Design, pages = 1): AutoFixPlan {
  const fixes: AutoFix[] = [];
  const facts = analyzeCV(content);
  let n = 0;
  const id = () => `fx${++n}`;
  // The truth check compares against the CV with spelling corrected: "financila anaylis" → "financial analysis"
  // is the same fact, not a new skill
  const spelledFacts = fixSpelling(cvToText(content));
  const allBullets = facts.bullets.filter((b) => b.section !== "education");
  const period = allBullets.length ? allBullets.filter((b) => /\.\s*$/.test(b.text)).length >= allBullets.length / 2 : true;

  /* 1. Bullets: stronger verbs, right tense, no filler/first person, consistent punctuation, spelling */
  for (const section of BULLET_SECTIONS) {
    for (const item of content[section] as { id: string; current?: boolean; bullets: { id: string; text: string }[] }[]) {
      const current = !!item.current && prefersPresent(item.bullets.map((b) => b.text));
      item.bullets.forEach((b, i) => {
        const before = b.text.trim();
        if (!before) return;
        const spelled = fixSpelling(before);
        const r = rewriteBullet(spelled, { current, mode: "balanced", endWithPeriod: period });
        let after = r.text.trim();
        if (/^[a-z]/.test(after)) after = after[0].toUpperCase() + after.slice(1);
        if (!after || after === before) return;
        const v = validateAction({ type: "update_bullet", section, itemId: item.id, bulletId: b.id, oldText: before, newText: after, label: "" }, content, spelledFacts);
        if (!v.ok) return;
        const reasons = [...(spelled !== before ? ["Fixes spelling"] : []), ...r.reasons];
        if (!reasons.length && WEAK_PHRASE_RE.test(before)) reasons.push("Leads with an action verb");
        fixes.push({
          id: id(),
          kind: "bullet",
          where: `${itemLabel(findItem(content, section, item.id)) || section} — bullet ${i + 1}`,
          reason: reasons.slice(0, 2).join(" · ") || "Clearer, more consistent wording",
          before,
          after,
          apply: (c) => {
            const bb = findItem(c, section, item.id)?.bullets.find((x) => x.id === b.id);
            if (bb) bb.text = after;
          },
        });
      });
    }
  }

  /* 2. Summary */
  const s = content.summary.trim();
  const buzz = BUZZWORDS.filter((w) => s.toLowerCase().includes(w));
  let summaryAfter = "";
  let summaryReason = "";
  let summaryOptional = false;
  if (!s) {
    const draft = facts.bullets.length ? buildTailoredSummary(content, facts, null) : null;
    if (draft) {
      summaryAfter = draft.text;
      summaryReason = "Adds a short summary built only from your experience";
      summaryOptional = true;
    }
  } else {
    const polished = polishSummary(fixSpelling(s));
    const draft = buzz.length ? buildTailoredSummary(content, facts, null) : null;
    if (draft && summaryScore(draft.text, facts, null) > summaryScore(polished, facts, null) + 1) {
      summaryAfter = draft.text;
      summaryReason = `Replaces generic wording (${buzz.slice(0, 2).map((w) => `“${w}”`).join(", ")}) with specifics from your CV`;
      summaryOptional = true; // a full rewrite is the user's call
    } else if (polished !== s) {
      summaryAfter = polished;
      summaryReason = "Fixes first person, spelling or an unfinished sentence — keeps your words";
    }
  }
  if (summaryAfter && summaryAfter !== s) {
    const v = validateAction({ type: "replace_summary", section: "summary", itemId: "", bulletId: "", oldText: s, newText: summaryAfter, label: "" }, content, spelledFacts);
    if (v.ok) fixes.push({ id: id(), kind: "summary", where: "Summary", reason: summaryReason, before: s || "(empty)", after: summaryAfter, optional: summaryOptional, apply: (c) => void (c.summary = summaryAfter) });
  }

  /* 3. Professional title from the CV's own latest role */
  const h = content.personal.headline.trim();
  const role = content.experience
    .map((e) => e.role.trim().replace(/\s*\([^)]*\)\s*$/, ""))
    .find((r) => r && looksLikeTitle(r) && !/\bintern(ship)?\b/i.test(r));
  if (role && (!h || !looksLikeTitle(h))) {
    const moveToLocation = !!h && looksLikeAddress(h) && !content.personal.location.trim();
    fixes.push({
      id: id(),
      kind: "title",
      where: "Professional title",
      reason: !h ? "Adds your current job title under your name" : moveToLocation ? "Moves the address to Location and uses your job title" : "Replaces text that isn't a job title with your current role",
      before: h || "(empty)",
      after: role,
      optional: !h,
      apply: (c) => {
        if (moveToLocation) c.personal.location = h;
        c.personal.headline = role;
      },
    });
  }

  /* 4. Spelling in titles, companies, education, projects, certifications, custom sections */
  const spellField = (where: string, get: (c: CVContent) => string | undefined, set: (c: CVContent, v: string) => void) => {
    const before = get(content) ?? "";
    const after = fixSpelling(before);
    if (before && after !== before) fixes.push({ id: id(), kind: "spelling", where, reason: "Fixes spelling", before, after, apply: (c) => set(c, fixSpelling(get(c) ?? "")) });
  };
  content.experience.forEach((e) => {
    spellField("Job title", (c) => c.experience.find((x) => x.id === e.id)?.role, (c, v) => void (c.experience.find((x) => x.id === e.id)!.role = v));
    spellField("Company", (c) => c.experience.find((x) => x.id === e.id)?.company, (c, v) => void (c.experience.find((x) => x.id === e.id)!.company = v));
  });
  content.education.forEach((e) => {
    for (const k of ["degree", "field", "school"] as const)
      spellField("Education", (c) => c.education.find((x) => x.id === e.id)?.[k], (c, v) => void (c.education.find((x) => x.id === e.id)![k] = v));
  });
  content.projects.forEach((p) => spellField("Project", (c) => c.projects.find((x) => x.id === p.id)?.name, (c, v) => void (c.projects.find((x) => x.id === p.id)!.name = v)));
  content.certifications.forEach((x0) => spellField("Certification", (c) => c.certifications.find((x) => x.id === x0.id)?.name, (c, v) => void (c.certifications.find((x) => x.id === x0.id)!.name = v)));
  content.custom.forEach((sec) =>
    sec.items.forEach((it) => spellField(sec.title || "Other section", (c) => c.custom.find((x) => x.id === sec.id)?.items.find((x) => x.id === it.id)?.description, (c, v) => void (c.custom.find((x) => x.id === sec.id)!.items.find((x) => x.id === it.id)!.description = v))),
  );

  /* 5. Skills: duplicates and spelling */
  const seen = new Set<string>();
  const dups: string[] = [];
  const keep = content.skills.filter((sk) => {
    const k = fixSpelling(sk.name).trim().toLowerCase();
    if (!k) return false;
    if (seen.has(k)) {
      dups.push(sk.name);
      return false;
    }
    seen.add(k);
    return true;
  });
  const misspelt = content.skills.some((sk) => fixSpelling(sk.name).trim() !== sk.name);
  if (dups.length || misspelt) {
    const keepIds = new Set(keep.map((sk) => sk.id));
    fixes.push({
      id: id(),
      kind: "skills",
      where: "Skills",
      reason: dups.length ? `Removes duplicate skill${dups.length > 1 ? "s" : ""}: ${dups.slice(0, 3).join(", ")}` : "Fixes spelling in skill names",
      before: content.skills.map((sk) => sk.name).join(", "),
      after: keep.map((sk) => fixSpelling(sk.name).trim()).join(", "),
      apply: (c) => void (c.skills = c.skills.filter((sk) => keepIds.has(sk.id)).map((sk) => ({ ...sk, name: fixSpelling(sk.name).trim() }))),
    });
  }

  /* 6. One date style: "02/2026" → "Feb 2026" when styles are mixed */
  const dated = [...content.experience, ...content.education, ...content.projects, ...content.volunteer];
  const allDates = dated.flatMap((e) => [e.startDate, e.endDate]).filter((d) => d && d.trim());
  const style = (d: string) => (/^\d{4}$/.test(d.trim()) ? "Y" : /^\d{1,2}[/.-]\d{4}$/.test(d.trim()) ? "N" : /[a-z]/i.test(d) ? "M" : "O");
  const styles = new Set(allDates.map(style));
  if (styles.size > 1 && styles.has("N")) {
    const conv = (d: string) => {
      const m = d.trim().match(/^(\d{1,2})[/.-](\d{4})$/);
      return m && +m[1] >= 1 && +m[1] <= 12 ? `${MONTHS[+m[1] - 1]} ${m[2]}` : d;
    };
    const changed = allDates.filter((d) => conv(d) !== d);
    if (changed.length)
      fixes.push({
        id: id(),
        kind: "dates",
        where: "Dates",
        reason: "Uses one date style throughout (e.g. “Feb 2026”)",
        before: changed.slice(0, 3).join(", "),
        after: changed.slice(0, 3).map(conv).join(", "),
        apply: (c) => {
          for (const e of [...c.experience, ...c.education, ...c.projects, ...c.volunteer]) {
            e.startDate = conv(e.startDate);
            e.endDate = conv(e.endDate);
          }
        },
      });
  }

  const scoreBefore = reviewCV(content, design, pages).score;
  const scoreAfter = reviewCV(applyAutoFixes(content, fixes.filter((f) => !f.optional)), design, pages).score;
  return { fixes, scoreBefore, scoreAfter };
}

/** Estimated review score with a chosen set of fixes applied. */
export function scoreWithFixes(content: CVContent, design: Design, pages: number, fixes: AutoFix[]): number {
  return reviewCV(applyAutoFixes(content, fixes), design, pages).score;
}

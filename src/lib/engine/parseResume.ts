import type { BuiltinSection, CVContent, Layout } from "@/lib/cv/schema";
import { SECTION_LABELS } from "@/lib/cv/meta";
import { uid } from "@/lib/utils";
import { looksLikeAddress, looksLikeTitle, ROLE_WORD } from "./personalInfo";
import { verbFromAny } from "./verbs";
import { DEFAULT_ORDER, emptyContent, newAward, newBullet, newCertification, newCustomItem, newCustomSection, newEducation, newExperience, newLanguage, newProject, newSkill, newVolunteer } from "@/lib/cv/defaults";

/* Heuristic resume parser (on-device). Turns extracted text into structured
   CV content. The user always reviews and edits the result. */

export type SectionKind = "summary" | "experience" | "education" | "skills" | "projects" | "certifications" | "awards" | "volunteer" | "languages" | "custom";

const SECTION_RES: { kind: SectionKind; re: RegExp }[] = [
  { kind: "summary", re: /^(professional\s+)?(summary|profile|about me|objective|career objective|personal statement|professional profile|career summary|executive summary|overview)$/i },
  { kind: "experience", re: /^((relevant|professional|work|employment|career)\s+)?(experience|employment( history)?|work history|career history|professional background)$/i },
  { kind: "education", re: /^(education|academic background|academic qualifications|education (and|&) training|qualifications|academics)$/i },
  { kind: "skills", re: /^((technical|core|key|professional|relevant)\s+)?(skills|competencies|expertise|skills (and|&) (tools|abilities|competencies|technologies)|tools|technologies|technical proficiencies|skill set)$/i },
  { kind: "projects", re: /^((key|academic|personal|selected|relevant)\s+)?projects$/i },
  { kind: "certifications", re: /^(certifications?|certificates|licen[cs]es( (and|&) certifications)?|certifications (and|&) licen[cs]es|courses|training|professional development)$/i },
  { kind: "awards", re: /^(awards?|honou?rs|achievements|awards (and|&) honou?rs|honou?rs (and|&) awards|accomplishments)$/i },
  { kind: "volunteer", re: /^(volunteer(ing)?( experience| work)?|community (involvement|service)|extracurricular( activities)?|leadership (and|&) activities|activities)$/i },
  { kind: "languages", re: /^languages?$/i },
  { kind: "custom", re: /^(interests|hobbies|publications|references|additional information|memberships|affiliations|conferences)$/i },
];

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const YEAR = "(?:19|20)\\d{2}";
const DATE = `(?:${MONTH}\\s*,?\\s*${YEAR}|\\d{1,2}[/.-]${YEAR}|${YEAR})`;
const RANGE_RE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|until|›)\\s*(${DATE}|present|current|now|today|ongoing)`, "i");
const SINGLE_DATE_RE = new RegExp(`\\b(${DATE})\\b`, "i");
const BULLET_RE = /^[\s]*[•·▪‣◦●■□➢►▶✓✔*\-–—]\s*/;
const EMAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[\w\-%]+\/?/i;
// Subdomains included: "sayedhasansiddiqui.lovable.app" must not shrink to "lovable.app"
const URL_RE = /(?:https?:\/\/)?(?:www\.)?(?:[\w-]+\.)+(?:com|io|dev|me|net|org|co|app|site|xyz|ai|design|portfolio|info|biz|tech|online|page|link|bd|in|uk|us|edu)\b(?:\/[\w\-./]*)?/i;
const COMPANY_HINT = /\b(inc|ltd|llc|llp|plc|corp|corporation|company|co\.|group|bank|partners|holdings|gmbh|s\.a\.|limited|technologies|solutions|consulting|agency|hospital|university|college|school|institute|foundation|council|ministry|accountants|chartered|advisory)\b/i;
const SCHOOL_HINT = /\b(university|college|institute|school|academy|polytechnic|conservatory)\b/i;
const DEGREE_HINT = /\b(bachelor|master|mba|ph\.?d|doctor|diploma|associate|b\.?\s?sc|m\.?\s?sc|b\.?a\b|b\.?s\b|m\.?a\b|m\.?s\b|beng|meng|bcom|bba|llb|a-levels?|gcse|high school|certificate|degree)\b/i;
const LOCATION_RE = /^[A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z .'-]+$/;

export interface ParsedSection {
  kind: SectionKind;
  title: string;
  customId?: string;
}

export interface ParseOptions {
  /** User's corrections from the review step: section title (lower-case) → the kind it should be parsed as */
  kindOverrides?: Record<string, SectionKind>;
}

export interface ParseResult {
  content: CVContent;
  warnings: string[];
  stats: { sections: number; experience: number; education: number; skills: number };
  /** Sections in the order, and with the titles, the original CV used */
  sections?: ParsedSection[];
  /** Layout that reproduces the original's section order and titles */
  layout?: Layout;
}

function headingKind(line: string): { kind: SectionKind; title: string } | null {
  const l = line.replace(BULLET_RE, "").replace(/[:：|]+\s*$/, "").trim();
  if (!l || l.length > 45 || /[.,;]$/.test(l) || /\d{3,}/.test(l)) return null;
  for (const s of SECTION_RES) if (s.re.test(l)) return { kind: s.kind, title: titleCase(l) };
  return fuzzyHeading(l);
}

/* Non-standard headings: "SKILLS & TOOLS PROFICIENCY", "Areas of Expertise", "Academic Qualifications & Training".
   Must look like a heading (short, Title/UPPER case, no punctuation) and end in a section noun, so
   job titles such as "Customer Experience Specialist" or "Project Manager" aren't mistaken for headings. */
const FUZZY_HEADINGS: { kind: SectionKind; re: RegExp }[] = [
  { kind: "volunteer", re: /\b(volunteer\w*|extra-?curricular|community)\b/i },
  { kind: "skills", re: /\b(skills?|competenc(?:y|ies)|expertise|proficienc(?:y|ies)|toolkit|tools|technolog(?:y|ies)|capabilities|strengths)\b/i },
  { kind: "education", re: /\b(education|academics?|qualifications?|schooling)\b/i },
  { kind: "experience", re: /\b(experience|employment|work history|career history)\b/i },
  { kind: "projects", re: /\bprojects\b/i },
  { kind: "certifications", re: /\b(certifications?|certificates|licen[cs]es?|courses|trainings?)\b/i },
  { kind: "awards", re: /\b(awards?|honou?rs|achievements|accomplishments)\b/i },
  { kind: "languages", re: /\blanguages?\b/i },
  // Last, so "Skills Summary" stays skills; catches "PROFESSION SUMMARY", "Career Profile", "Personal Overview"
  { kind: "summary", re: /\b(summary|profile|objective|overview)\b/i },
];

function fuzzyHeading(l: string): { kind: SectionKind; title: string } | null {
  const words = l.split(/\s+/);
  if (words.length > 5 || /[,:;()]/.test(l) || /\d/.test(l) || ROLE_WORD.test(l)) return null;
  if (words.some((w) => /^[a-z]/.test(w) && !/^(and|of|the|in|for|to|with|&)$/.test(w))) return null;
  const last = words[words.length - 1];
  if (!FUZZY_HEADINGS.some((f) => f.re.test(last))) return null;
  const hit = FUZZY_HEADINGS.find((f) => f.re.test(l));
  return hit ? { kind: hit.kind, title: titleCase(l) } : null;
}

/** True when a line is a recognizable CV section heading (used to learn a PDF's heading style). */
export function isSectionHeading(line: string): boolean {
  return !!headingKind(line);
}

/** Prefix the PDF/DOCX readers put on lines styled like the CV's headings. */
export const HEADING_MARK = "§§ ";

/** Plain-text fallback: an unknown ALL-CAPS line (2–5 words) is a custom heading — unless it looks like an
    employer/school/role/place, or sits next to a date line (then it's an entry heading, e.g. "KPMG IN BANGLADESH"). */
function capsHeading(l: string, prev: string, next: string): { kind: SectionKind; title: string } | null {
  const t = l.replace(/[:：]\s*$/, "").trim();
  const words = t.split(/\s+/);
  if (words.length < 2 || words.length > 5 || t !== t.toUpperCase() || !/[A-Z]{3}/.test(t)) return null;
  if (/\d|@|\/|[.,;]$/.test(t) || COMPANY_HINT.test(t) || SCHOOL_HINT.test(t) || ROLE_WORD.test(t) || DEGREE_STRONG.test(t) || looksLikeAddress(t)) return null;
  if (RANGE_RE.test(next) || RANGE_RE.test(prev)) return null;
  return { kind: "custom", title: titleCase(t) };
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function splitRange(line: string): { rest: string; start: string; end: string; current: boolean } | null {
  const m = line.match(RANGE_RE);
  if (!m) return null;
  // Guard against digits either side: "+880 1613-142805" is a phone number, not 1613–1428
  const before = line[(m.index ?? 0) - 1];
  const after = line[(m.index ?? 0) + m[0].length];
  if ((before && /[\d/.-]/.test(before)) || (after && /\d/.test(after))) return null;
  const end = m[2];
  const current = /present|current|now|today|ongoing/i.test(end);
  // Drop empty "( )" left by "(2019 – 2025)" and dangling separators, but keep closing brackets: "(HSC)" stays intact
  const rest = (line.slice(0, m.index) + " " + line.slice((m.index ?? 0) + m[0].length))
    .replace(/\(\s*\)/g, " ")
    .replace(/[|,–—(\s-]+$/g, "")
    .replace(/^[|,–—)\s-]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { rest, start: tidyDate(m[1]), end: current ? "" : tidyDate(end), current };
}

function tidyDate(d: string) {
  return d.replace(/\s*,\s*/, " ").replace(/\b(\w)(\w*)\.?/, (_m, a: string, b: string) => a.toUpperCase() + b.toLowerCase()).trim();
}

function splitParts(line: string): string[] {
  return line
    .split(/\s+[|•·–—]\s+|\s+-\s+|\s{3,}|\t|\s+at\s+|,\s+(?=[A-Z][a-z]+,?\s+[A-Z]{2}\b)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* A line that stops on a conjunction, preposition, article or open punctuation is unfinished, so the
   next line belongs to it. Used to re-join a bullet the PDF wrapped across two lines. */
const DANGLING_END_RE = /(?:\b(?:and|or|nor|but|the|an?|to|for|of|in|on|at|by|as|with|via|from|into|onto|upon|using|include|including|between|across|through|during|over|under|about|per|plus|toward|towards|within|without|against|alongside|among|after|before|while|when|where|which|that|who|whose|whom|than|then|both|either|neither|its|their|our|your|his|her)|[,;:&/(\[\u2013\u2014-])\s*$/i;

interface Block {
  head: string[];
  bullets: string[];
  /** true where a body line had no bullet glyph in the original (plain text, not a bullet point) */
  plain: boolean[];
  start: string;
  end: string;
  current: boolean;
}

/** Groups section lines into entries: heading lines (role/company/dates) + bullets. */
export function toBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let gap = false;
  const flush = () => {
    if (cur && (cur.head.length || cur.bullets.length)) blocks.push(cur);
    cur = null;
  };
  const nextText = (i: number) => {
    for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return lines[j];
    return "";
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const isBullet = BULLET_RE.test(raw);
    const text = raw.replace(BULLET_RE, "").trim();
    if (!text) {
      // A blank line (a real vertical gap in the PDF) separates entries
      if (!isBullet) gap = true;
      continue;
    }
    const afterGap = gap;
    gap = false;
    const range = splitRange(text);
    const nextHasRange = !!splitRange(nextText(i).replace(BULLET_RE, ""));
    const words = text.split(/\s+/).length;

    if (isBullet) {
      if (!cur) cur = { head: [], bullets: [], plain: [], start: "", end: "", current: false };
      cur.bullets.push(text);
      cur.plain.push(false);
      continue;
    }
    const looksLikeHeader = !!range || (words <= 9 && !/[.;]$/.test(text)) || nextHasRange;
    const prevBullet = cur?.bullets[cur.bullets.length - 1] ?? "";
    // A bullet that stops mid-sentence ("…via Google OAuth and") is continued by the next line, however short
    // or capitalised that line looks ("Meta Auth."). Only a blank line, or a date range on the line itself,
    // starts a new entry there — without this, wrapped bullets in dense CVs became phantom job titles.
    const danglingTail = !!prevBullet && (DANGLING_END_RE.test(prevBullet) || /\w-$/.test(prevBullet));
    const continuation =
      !afterGap &&
      cur &&
      cur.bullets.length &&
      !range &&
      (danglingTail ||
        /^[a-z(&]/.test(text) ||
        (!/[.;:]$/.test(prevBullet) && words > 3 && !nextHasRange && !/^[A-Z][a-z]+\s+[A-Z]/.test(text)));
    if (continuation && !range) {
      // "…strategic decision-" + "making skills" → "decision-making" (a line break at a hyphen isn't a space)
      const k = cur!.bullets.length - 1;
      cur!.bullets[k] = /\w-$/.test(cur!.bullets[k]) && /^[a-z]/.test(text) ? `${cur!.bullets[k]}${text}` : `${cur!.bullets[k]} ${text}`;
      continue;
    }
    if (looksLikeHeader) {
      // After a gap, a heading-like line starts a new entry (an undated "ACCA …" line must not swallow the next degree)
      if (!cur || cur.bullets.length || (range && cur.start) || cur.head.length >= 3 || (afterGap && cur.head.length)) {
        flush();
        cur = { head: [], bullets: [], plain: [], start: "", end: "", current: false };
      }
      if (range) {
        cur!.start = range.start;
        cur!.end = range.end;
        cur!.current = range.current;
        if (range.rest) cur!.head.push(range.rest);
      } else cur!.head.push(text);
    } else {
      if (!cur) cur = { head: [], bullets: [], plain: [], start: "", end: "", current: false };
      cur.bullets.push(text);
      cur.plain.push(true);
    }
  }
  flush();
  return blocks;
}

const STRONG_LOCATION_RE = /,\s*([A-Z]{2}|UK|USA|U\.S\.|UAE|[A-Z][a-z]+land|Germany|France|Spain|Italy|India|Canada|Australia|Remote)\s*$/;

function pickRoleCompany(head: string[]): { role: string; company: string; location: string; extra: string[] } {
  let parts = head.flatMap(splitParts);
  // "Role, Company" on a single line
  if (parts.length === 1 && parts[0].includes(", ") && !STRONG_LOCATION_RE.test(parts[0])) {
    const i = parts[0].indexOf(", ");
    parts = [parts[0].slice(0, i), parts[0].slice(i + 2)];
  }
  let location = "";
  const rest: string[] = [];
  for (const p of parts) {
    const looksLikePlace = STRONG_LOCATION_RE.test(p) || /\b(remote|hybrid|on-site)\b/i.test(p) || (parts.length > 2 && LOCATION_RE.test(p));
    if (!location && looksLikePlace && p.split(/\s+/).length <= 5) location = p;
    else {
      // Trim separators and only UNBALANCED brackets: "Accounts Executive (AP & Vendor Coordination)" keeps its ")"
      let t = p.replace(/^[,\s]+|[,:\s]+$/g, "");
      if (t.startsWith("(") && !t.includes(")")) t = t.slice(1);
      if (t.endsWith(")") && !t.includes("(")) t = t.slice(0, -1);
      rest.push(t.trim());
    }
  }
  let role = rest[0] ?? "";
  let company = rest[1] ?? "";
  if (company && COMPANY_HINT.test(role) && !COMPANY_HINT.test(company)) [role, company] = [company, role];
  // "Wilbur (USA Clients), Client & Vendor Management Associate" / "KPMG …, Internship": the job title is on the right
  else if (company && ROLE_WORD.test(company) && !ROLE_WORD.test(role)) [role, company] = [company, role];
  return { role, company, location, extra: rest.slice(2).filter(Boolean) };
}

/* ───────── Skills lists ───────── */

const SKILL_LABEL_RE = /^\s*([A-Z][A-Za-z0-9 &/+.'-]{1,40}?)\s*:\s*(\S[\s\S]*)$/;

/** Splits on commas/semicolons that aren't inside brackets: "Office Suite (Excel, Word), Jira" → 2 items. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if ((ch === ")" || ch === "]") && depth) depth--;
    if (!depth && (ch === "," || ch === ";")) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.flatMap((x) => x.split(/\s{3,}|\t/)).map((x) => x.trim()).filter(Boolean);
}

/** Parses "Label: a, b and c | Label: d, e" (or a plain list) into categorized skills. */
export function parseSkillText(text: string): { name: string; category: string }[] {
  const out: { name: string; category: string }[] = [];
  for (const group of text.split(/\s*[|•·▪]\s*/)) {
    const g = group.trim();
    if (!g) continue;
    const m = g.match(SKILL_LABEL_RE);
    const category = m ? m[1].trim() : "";
    const items = splitTopLevel(m ? m[2] : g);
    // "…, reporting and data-driven decision making" → two skills (but keep "Research and Development")
    if (items.length >= 2) {
      const last = items[items.length - 1];
      const k = last.lastIndexOf(" and ");
      if (k > 0 && !last.slice(k).includes("(")) {
        const [a, b] = [last.slice(0, k).trim(), last.slice(k + 5).trim()];
        const titled = /^[A-Z]/.test(a) && /^[A-Z]/.test(b) && a.split(/\s+/).length <= 2 && b.split(/\s+/).length <= 2;
        if (!titled) items.splice(items.length - 1, 1, a, b);
      }
    }
    for (const it of items) {
      const name = it.replace(/^(and|&)\s+/i, "").replace(/[.;:]+$/, "").trim();
      if (name && name.length <= 60) out.push({ name: name.charAt(0).toUpperCase() + name.slice(1), category });
    }
  }
  return out;
}

/** Re-joins skills lines a PDF wrapped mid-list ("…| Business & Operations: Process" + "improvement, …"). */
function joinWrapped(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const t = raw.replace(BULLET_RE, "").trim();
    if (!t) continue;
    const prev = out[out.length - 1];
    if (prev !== undefined && !BULLET_RE.test(raw) && (/[,&(/|-]\s*$/.test(prev) || /^[a-z(&|,]/.test(t))) out[out.length - 1] = `${prev} ${t}`;
    else out.push(t);
  }
  return out;
}

/** A projects section is often one bullet per project: "Huddle — huddle.app — Real-time collaboration…".
    Splits such a bullet into name / link / description so the project names survive the import. */
function splitProjectBullet(t: string): { name: string; link: string; desc: string } | null {
  const parts = t.split(/\s+[\u2014\u2013]\s+|\s+-\s+/);
  if (parts.length < 2) return null;
  const name = parts[0].trim();
  if (!name || name.split(/\s+/).length > 6 || /[.;,:]$/.test(name)) return null;
  let rest = parts.slice(1).map((x) => x.trim()).filter(Boolean);
  let link = "";
  if (rest.length > 1 && !rest[0].includes(" ") && URL_RE.test(rest[0])) {
    link = rest[0].match(URL_RE)![0];
    rest = rest.slice(1);
  }
  const desc = rest.join(" — ").trim();
  if (!desc) return null;
  return { name, link, desc };
}

const NOT_SKILLS_LABEL = /\b(coursework|modules?|courses?|subjects?|thesis|dissertation|research|projects?|awards?|achievements?|activities|clubs?|societ(?:y|ies)|honou?rs|scholarships?|grade|gpa|responsibilities)\b/i;

/** True when a bullet is really a skills list that landed in another section. `strict` = only the unmistakable multi-group form. */
function looksLikeSkillList(t: string, strict: boolean): boolean {
  const groups = t.split(/\s*\|\s*/).filter(Boolean);
  const labels = groups.map((g) => g.match(SKILL_LABEL_RE)?.[1]).filter((x): x is string => !!x && x.split(/\s+/).length <= 5);
  if (labels.length >= 2 && !labels.some((l) => NOT_SKILLS_LABEL.test(l))) return true;
  if (strict) return false;
  if (labels.length === 1) return !NOT_SKILLS_LABEL.test(labels[0]) && splitTopLevel(t.match(SKILL_LABEL_RE)![2]).length >= 3;
  if (NOT_SKILLS_LABEL.test(t)) return false;
  const items = splitTopLevel(t);
  const first = t.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  return items.length >= 6 && items.every((i) => i.split(/\s+/).length <= 4) && !verbFromAny(first);
}

function addSkills(content: CVContent, skills: { name: string; category: string }[]) {
  for (const s of skills) if (!content.skills.some((x) => x.name.toLowerCase() === s.name.toLowerCase())) content.skills.push(newSkill(s.name, s.category));
}

/* ───────── Education helpers ───────── */

// Strong degree words win over "school" ("Secondary School Certificate" is a qualification, not a school)
const DEGREE_STRONG = /\b(bachelor|master|mba|ph\.?d|doctor(?:ate)?|diploma|b\.?\s?sc|m\.?\s?sc|beng|meng|bcom|bba|llb|a[- ]levels?|o[- ]levels?|i?gcse|certificate|hsc|ssc|qualification|acca|cima|cfa|cpa|degree)\b/i;
const EDU_STATUS_RE = /\b(part[- ]?qualified|papers? (?:completed|passed)|in progress|pursuing|expected)\b/i;
const GPA_RE = /\b(?:c?gpa|grade|result)\s*[:\-]?\s*\d+(?:\.\d+)?(?:\s*(?:\/|out of)\s*\d+(?:\.\d+)?)?/i;

/** "ACCA Qualification (Ongoing) CGPA: 3.02 Dhaka" → before "ACCA Qualification (Ongoing)", grade "CGPA: 3.02", after "Dhaka". */
function splitGrade(s: string): { grade: string; before: string; after: string } | null {
  const m = s.match(GPA_RE);
  if (!m) return null;
  const tidy = (x: string) => x.replace(/^[\s,·|–-]+|[\s,·|(–-]+$/g, "").trim();
  return { grade: m[0].trim(), before: tidy(s.slice(0, m.index)), after: tidy(s.slice((m.index ?? 0) + m[0].length)) };
}

const PLACE_RE = /^[A-Z][A-Za-z .'-]{2,30}$/;

/* ───────── Nothing gets lost ───────── */

const COVER_STOP = new Set(["and", "the", "for", "with", "from", "into", "that", "this", "are", "was", "our", "your", "their", "its", "per", "via", "upon", "also"]);
const coverTokens = (s: string) => (s.toLowerCase().normalize("NFKD").match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 3 && !COVER_STOP.has(w));

/** Lines of the original whose words don't appear anywhere in the structured result. */
function uncoveredLines(lines: string[], content: CVContent): string[] {
  const corpus = new Set(coverTokens(JSON.stringify(content)));
  if ([...content.experience, ...content.volunteer].some((e) => e.current)) for (const w of ["present", "current", "now", "today", "ongoing", "date"]) corpus.add(w);
  const out: string[] = [];
  for (const raw of lines) {
    const l = raw.replace(/^§§\s*/, "").replace(BULLET_RE, "").trim();
    if (!l || headingKind(l)) continue;
    const t = coverTokens(l);
    if (t.length < 2) continue;
    if (t.filter((w) => corpus.has(w)).length / t.length < 0.6) out.push(l);
  }
  return out;
}

/** Guarantees nothing from the original is dropped: lines the parser couldn't place go to "Additional Information". */
export function keepUncovered(raw: string, content: CVContent): { count: number; customId?: string } {
  const lines = raw.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter((l) => l && !/^page \d+( of \d+)?$/i.test(l));
  const leftovers = uncoveredLines(lines, content);
  if (!leftovers.length) return { count: 0 };
  const sec = newCustomSection("Additional Information");
  const item = newCustomItem();
  item.description = leftovers.join("\n");
  sec.items = [item];
  content.custom.push(sec);
  return { count: leftovers.length, customId: sec.id };
}

/** Layout that keeps the original CV's section order and its own section titles. */
export function layoutFromSections(found: ParsedSection[], content: CVContent): Layout {
  const order: string[] = [];
  const titles: Record<string, string> = {};
  const add = (k: string) => {
    if (!order.includes(k)) order.push(k);
  };
  for (const s of found) {
    if (s.kind === "custom") {
      const id = (s.customId && content.custom.some((c) => c.id === s.customId) ? s.customId : undefined) ?? content.custom.find((c) => c.title.toLowerCase() === s.title.toLowerCase())?.id;
      if (id) add(`custom:${id}`);
      continue;
    }
    add(s.kind);
    const label = SECTION_LABELS[s.kind as BuiltinSection];
    if (s.title && label && s.title.toLowerCase() !== label.toLowerCase() && !titles[s.kind]) titles[s.kind] = s.title;
  }
  for (const k of DEFAULT_ORDER) add(k);
  for (const c of content.custom) add(`custom:${c.id}`);
  return { order, hidden: [], titles };
}

export function parseResumeText(raw: string, opts: ParseOptions = {}): ParseResult {
  const content = emptyContent();
  const warnings: string[] = [];
  const text = raw.replace(/\r/g, "").replace(/ /g, " ").replace(/[ \t]+/g, " ");
  const rawLines = text.split("\n").map((l) => l.trim()).filter((l) => !/^page \d+( of \d+)?$/i.test(l));
  const allLines = rawLines.filter(Boolean);

  // Split into sections. Blank lines stay inside sections: they mark real gaps between entries.
  const sections: { kind: SectionKind | "header"; title: string; lines: string[]; customId?: string }[] = [{ kind: "header", title: "", lines: [] }];
  const near = (i: number, step: 1 | -1) => {
    for (let j = i + step; j >= 0 && j < rawLines.length; j += step) if (rawLines[j]) return rawLines[j];
    return "";
  };
  rawLines.forEach((line, i) => {
    const cur = sections[sections.length - 1];
    if (!line) {
      if (cur.lines.length && cur.lines[cur.lines.length - 1] !== "") cur.lines.push("");
      return;
    }
    // Lines the PDF/DOCX reader marked as headings (styled like the CV's known headings) always start a section,
    // even with unusual wording ("Leadership & Impact") — they become custom sections with their own title.
    const marked = line.startsWith("§§");
    const clean = marked ? line.replace(/^§§\s*/, "").trim() : line;
    if (!clean) return;
    const h =
      headingKind(clean) ??
      (marked ? { kind: "custom" as SectionKind, title: titleCase(clean) } : null) ??
      (sections.length > 1 ? capsHeading(clean, near(i, -1), near(i, 1)) : null);
    // The user can correct a section's type in the review step ("treat Leadership & Impact as Experience")
    if (h) sections.push({ kind: opts.kindOverrides?.[h.title.toLowerCase()] ?? h.kind, title: h.title, lines: [] });
    else cur.lines.push(clean);
  });

  // Header: name, headline, contacts
  const header = sections[0].lines;
  const whole = allLines.join("\n");
  const email = whole.match(EMAIL_RE)?.[0] ?? "";
  const linkedin = whole.match(LINKEDIN_RE)?.[0] ?? "";
  const phone = (header.join(" ").match(PHONE_RE) ?? whole.match(PHONE_RE))?.[0]?.trim() ?? "";
  content.personal.email = email;
  content.personal.linkedin = linkedin.replace(/^https?:\/\//, "").replace(/^www\./, "");
  content.personal.phone = /\d{4}\s*[-–]\s*\d{4}/.test(phone) ? "" : phone;

  const nonContact: string[] = [];
  for (const l of header) {
    const segs = l.split(/\s*[|•·]\s*|\s{3,}/).map((s) => s.trim()).filter(Boolean);
    const leftovers = segs.filter((s) => !EMAIL_RE.test(s) && !LINKEDIN_RE.test(s) && !(PHONE_RE.test(s) && s.replace(/[^\d]/g, "").length >= 7));
    for (const s of leftovers) {
      if (!content.personal.location && LOCATION_RE.test(s) && s.split(/\s+/).length <= 5) content.personal.location = s;
      // Street/area addresses ("G-block, Bashundhara R/A, Dhaka, Bangladesh") are location, never the title
      else if (looksLikeAddress(s)) {
        if (!content.personal.location) content.personal.location = s;
      }
      else if (!content.personal.website && URL_RE.test(s) && !s.includes("@")) content.personal.website = s.match(URL_RE)![0];
      // Further links (GitHub, portfolio, Behance…) are kept too
      else if (URL_RE.test(s) && !s.includes("@")) {
        const url = s.match(URL_RE)![0];
        const host = url.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[./]/)[0] || "Link";
        content.personal.links.push({ id: uid("lnk"), label: host.charAt(0).toUpperCase() + host.slice(1), url });
      } else nonContact.push(s);
    }
  }
  // Name: a short alphabetic line that isn't a job title; prefer one matching the email address.
  // If nothing qualifies, leave it empty (with a warning) rather than guessing wrong.
  const emailTokens = (email.split("@")[0] ?? "").toLowerCase().split(/[._\-\d]+/).filter((t) => t.length > 1);
  const nameLike = (l: string) => /^[A-Za-zÀ-ÿ'’.\- ]{3,50}$/.test(l) && l.split(/\s+/).length >= 2 && l.split(/\s+/).length <= 5 && !ROLE_WORD.test(l);
  let nameIdx = nonContact.findIndex((l) => nameLike(l) && emailTokens.some((t) => l.toLowerCase().includes(t)));
  if (nameIdx < 0) nameIdx = nonContact.findIndex(nameLike);
  if (nameIdx >= 0) {
    const n = nonContact[nameIdx];
    content.personal.fullName = n === n.toUpperCase() ? titleCase(n) : n;
    // A header line is the professional title only if it reads like one (a role word, or Title Case) —
    // "Open to relocation within Bangladesh" is not a title (it's kept via the coverage check instead)
    const titleish = (l: string) => looksLikeTitle(l) && (ROLE_WORD.test(l) || !l.split(/\s+/).some((w) => /^[a-z]/.test(w) && !/^(and|of|the|in|for|to|at|&)$/.test(w)));
    const after = nonContact.slice(nameIdx + 1).find(titleish);
    if (after) content.personal.headline = after;
  } else {
    const role = nonContact.find((l) => ROLE_WORD.test(l) && looksLikeTitle(l));
    if (role) content.personal.headline = role;
  }
  const leftoverHeader = nonContact.filter((l, i) => i !== nameIdx && l !== content.personal.headline && l.split(/\s+/).length > 8);

  let customSec: ReturnType<typeof newCustomSection> | null = null;
  let movedSkills = false;
  for (const sec of sections.slice(1)) {
    const lines = sec.lines;
    switch (sec.kind) {
      case "summary":
        // Re-join words the PDF hyphenated across lines ("fast-" + "paced" → "fast-paced")
        content.summary = [content.summary, lines.filter(Boolean).map((l) => l.replace(BULLET_RE, "")).join(" ").replace(/(\w)-\s+(?=[a-z])/g, "$1-")].filter(Boolean).join("\n").trim();
        break;
      case "experience":
      case "volunteer":
      case "projects": {
        for (const b of toBlocks(lines)) {
          const { role, company, location, extra } = pickRoleCompany(b.head);
          // Heading parts beyond role/company/location (a department, client or team line) are kept as the first bullet
          const kept: string[] = extra.length ? [extra.join(" · ")] : [];
          for (const t of b.bullets) {
            // A whole "Label: … | Label: …" skills block glued under a job/project belongs in Skills
            if (looksLikeSkillList(t, true)) {
              addSkills(content, parseSkillText(t));
              movedSkills = true;
            } else kept.push(t);
          }
          const bullets = kept.map((t) => newBullet(t));
          if (sec.kind === "experience") {
            const e = newExperience();
            Object.assign(e, { role, company, location, startDate: b.start, endDate: b.end, current: b.current, bullets: bullets.length ? bullets : [] });
            if (!role && !company && content.experience.length) content.experience[content.experience.length - 1].bullets.push(...bullets);
            else content.experience.push(e);
          } else if (sec.kind === "volunteer") {
            const v = newVolunteer();
            Object.assign(v, { role, organization: company, location, startDate: b.start, endDate: b.end, current: b.current, bullets });
            content.volunteer.push(v);
          } else {
            // One bullet per project (no heading line): keep each project's own name and link
            const asProjects = !role && !company && b.bullets.length >= 2 ? b.bullets.map(splitProjectBullet) : [];
            if (asProjects.length && asProjects.every((x) => x !== null)) {
              for (const x of asProjects) {
                const one = newProject();
                Object.assign(one, { name: x!.name, link: x!.link, bullets: [newBullet(x!.desc)] });
                content.projects.push(one);
              }
              continue;
            }
            const p = newProject();
            const url = b.head.join(" ").match(URL_RE)?.[0] ?? "";
            Object.assign(p, { name: role.replace(url, "").trim() || company, role: role ? company : "", link: url, startDate: b.start, endDate: b.end, bullets });
            content.projects.push(p);
          }
        }
        break;
      }
      case "education": {
        for (const b of toBlocks(lines)) {
          const parts = b.head.flatMap((l) => l.split(/\s*,\s*|\s+[|•·–—]\s+|\s+-\s+|\s{3,}|\t/)).map((s) => s.trim()).filter(Boolean);
          const e = newEducation();
          const single = !b.start ? b.head.join(" ").match(SINGLE_DATE_RE) : null;
          e.startDate = b.start;
          e.endDate = b.current ? "Present" : b.end || (single ? tidyDate(single[1]) : "");
          const setDegree = (clean: string) => {
            // "Bachelor of Science in Finance" → degree "Bachelor of Science", field "Finance" (split on "in" first;
            // "of Science/Arts/…" is part of the degree name, not the field)
            const m =
              clean.match(/^(.*?)\s+in\s+(.+)$/i) ??
              (/\bof\s+(?:arts|science|engineering|laws|commerce|education|business administration|fine arts|philosophy|technology|music|nursing)\b/i.test(clean) ? null : clean.match(/^(.*?)\s+of\s+(.+)$/i));
            if (m && DEGREE_HINT.test(m[1])) {
              e.degree = m[1].trim();
              e.field = m[2].trim();
            } else e.degree = clean;
          };
          let status = "";
          let afterDegree = false;
          const extras: string[] = [];
          const queue = [...parts];
          while (queue.length) {
            const p = queue.shift()!;
            const clean = single ? p.replace(single[0], "").replace(/[,(\s–-]+$/, "").trim() : p;
            if (!clean) continue;
            // "Major: Finance" / "Concentration: Science" → field of study
            const lab = clean.match(/^(major|concentration|speciali[sz]ation|stream|field(?: of study)?)\s*[:\-–]\s*(.+)$/i);
            if (lab) {
              if (!e.field) e.field = lab[2].trim();
              else extras.push(clean);
              continue;
            }
            // A grade inside a part: keep what's before it (e.g. the qualification) and after it (usually the city)
            const g = splitGrade(clean);
            if (g) {
              if (!e.grade) e.grade = g.grade;
              if (g.after) {
                if (!e.location && PLACE_RE.test(g.after)) e.location = g.after;
                else queue.push(g.after);
              }
              if (g.before) queue.unshift(g.before);
              continue;
            }
            // "Bachelor of Science, Computer Science and Engineering": the part right after the degree names
            // the subject, not the institution — an institution keeps a school word (University, College, …).
            const subjectAfterDegree =
              afterDegree && !e.field && !SCHOOL_HINT.test(clean) && !LOCATION_RE.test(clean) && clean.split(/\s+/).length >= 2 && !/^[A-Z]{2,}$/.test(clean);
            afterDegree = false;
            if (subjectAfterDegree) {
              e.field = clean;
              continue;
            }
            if (!e.degree && DEGREE_STRONG.test(clean)) {
              setDegree(clean);
              afterDegree = !e.field;
            }
            else if (!e.school && SCHOOL_HINT.test(clean)) e.school = clean;
            else if (!e.degree && DEGREE_HINT.test(clean)) {
              setDegree(clean);
              afterDegree = !e.field;
            }
            else if (!status && EDU_STATUS_RE.test(clean)) status = clean;
            else if (!e.grade && /\b(honou?rs|first class|2:1|2:2|distinction|merit|cum laude)\b/i.test(clean)) e.grade = clean;
            else if (!e.location && LOCATION_RE.test(clean)) e.location = clean;
            else if (!e.school) e.school = clean;
            else if (!e.degree) e.degree = clean;
            else if (!e.location && PLACE_RE.test(clean) && clean.split(/\s+/).length <= 3) e.location = clean;
            else extras.push(clean); // e.g. honours, a thesis title, a second field — never dropped
          }
          // "ACCA Qualification (Ongoing)" + "Part Qualified (3/13 papers completed)" → one qualification line
          if (status) e.degree = e.degree ? `${e.degree} — ${status}` : status;
          if (extras.length) e.bullets.push(newBullet(extras.join(" · ")));
          for (let bi = 0; bi < b.bullets.length; bi++) {
            const t = b.bullets[bi];
            const plain = b.plain[bi] === true;
            const g = t.length < 40 || plain ? splitGrade(t) : null;
            // A plain (unbulleted) line naming the institution belongs in School, with its grade —
            // "American International University-Bangladesh — CGPA 3.94, Magna Cum Laude" is not a bullet.
            if (plain && !e.school && SCHOOL_HINT.test(g?.before || t)) {
              e.school = (g?.before ?? t).replace(/[\s,;:\u2013\u2014-]+$/, "").trim();
              if (g && !e.grade) e.grade = g.grade;
              const rest = (g?.after ?? "").replace(/^[\s,;:\u2013\u2014-]+/, "").trim();
              if (rest) e.bullets.push(newBullet(rest));
              continue;
            }
            if (!e.grade && g && !g.before) {
              e.grade = g.grade;
              if (g.after && !e.location && PLACE_RE.test(g.after)) e.location = g.after;
            } else if (looksLikeSkillList(t, false)) {
              addSkills(content, parseSkillText(t));
              movedSkills = true;
            } else e.bullets.push(newBullet(t));
          }
          if (e.degree || e.school) content.education.push(e);
        }
        break;
      }
      case "skills": {
        for (const line of joinWrapped(lines)) addSkills(content, parseSkillText(line));
        break;
      }
      case "languages": {
        for (const l of lines) {
          for (const piece of l.replace(BULLET_RE, "").split(/\s*[,;|•·]\s*/)) {
            const m = piece.match(/^([A-Za-zÀ-ÿ ]+?)\s*(?:[(\-–:]\s*([^)]+)\)?)?$/);
            if (m && m[1].trim()) {
              const lang = newLanguage();
              lang.name = m[1].trim();
              lang.proficiency = (m[2] ?? "").trim();
              content.languages.push(lang);
            } else if (piece.trim()) {
              const lang = newLanguage();
              lang.name = piece.trim();
              content.languages.push(lang);
            }
          }
        }
        break;
      }
      case "certifications": {
        for (const l of lines) {
          const line = l.replace(BULLET_RE, "");
          const c = newCertification();
          const d = line.match(SINGLE_DATE_RE);
          const noDate = d ? line.replace(d[0], "").replace(/[,()\s–-]+$/, "").trim() : line;
          const parts = noDate.split(/\s+[-–—|]\s+|,\s+/).map((s) => s.trim()).filter(Boolean);
          c.name = parts[0] ?? noDate;
          c.issuer = parts.slice(1).join(", ");
          c.date = d ? tidyDate(d[1]) : "";
          if (c.name) content.certifications.push(c);
        }
        break;
      }
      case "awards": {
        for (const l of lines) {
          const line = l.replace(BULLET_RE, "");
          const a = newAward();
          const d = line.match(SINGLE_DATE_RE);
          const noDate = d ? line.replace(d[0], "").replace(/[,()\s–-]+$/, "").trim() : line;
          const parts = noDate.split(/\s+[-–—|]\s+|,\s+/).map((s) => s.trim()).filter(Boolean);
          a.title = parts[0] ?? noDate;
          a.issuer = parts[1] ?? "";
          a.description = parts.slice(2).join(", ");
          a.date = d ? tidyDate(d[1]) : "";
          if (a.title) content.awards.push(a);
        }
        break;
      }
      case "custom": {
        customSec = newCustomSection(sec.title);
        customSec.items = [];
        // Keep the original's structure: an entry with a title/dates becomes an item (title · subtitle · date + bullets);
        // plain lines stay plain lines; bullets stay bullets ("• " lines render as a list)
        for (const b of toBlocks(lines)) {
          const item = newCustomItem();
          const structured = b.plain.some((p) => !p) || !!b.start;
          if (structured && b.head.length) {
            const { role, company, location, extra } = pickRoleCompany(b.head);
            item.title = role;
            item.subtitle = [company, location, ...extra].filter(Boolean).join(" · ");
          }
          item.date = b.start ? `${b.start} – ${b.current ? "Present" : b.end}` : "";
          item.description = [...(structured ? [] : b.head), ...b.bullets.map((t, k) => (b.plain[k] ? t : `• ${t}`))].join("\n");
          if (item.title || item.subtitle || item.description) customSec.items.push(item);
        }
        content.custom.push(customSec);
        sec.customId = customSec.id;
        break;
      }
    }
  }

  if (!content.summary && leftoverHeader.length) content.summary = leftoverHeader.join(" ");

  // No recognizable sections at all: try to find experience by date ranges
  if (sections.length === 1) {
    warnings.push("We couldn't find standard section headings, so some content may be in the wrong place. Please review each section.");
    const blocks = toBlocks(header.slice(nameIdx + 2));
    for (const b of blocks.filter((x) => x.start)) {
      const { role, company, location } = pickRoleCompany(b.head);
      const e = newExperience();
      Object.assign(e, { role, company, location, startDate: b.start, endDate: b.end, current: b.current, bullets: b.bullets.map((t) => newBullet(t)) });
      content.experience.push(e);
    }
  }

  // Nothing may be lost: lines that didn't land anywhere are kept under "Additional Information"
  const keptLines = keepUncovered(text, content);
  if (keptLines.count) {
    sections.push({ kind: "custom", title: "Additional Information", lines: [], customId: keptLines.customId });
    warnings.push(`${keptLines.count} line${keptLines.count === 1 ? "" : "s"} didn't fit a standard section, so we kept ${keptLines.count === 1 ? "it" : "them"} under “Additional Information” — move or delete as you like.`);
  }

  if (movedSkills) warnings.push("Some skills were listed inside another section (e.g. Education) — we moved them to Skills. Please check them.");
  if (!content.personal.fullName) warnings.push("We couldn't detect your name — please add it.");
  if (!content.personal.email) warnings.push("No email address found.");
  if (!content.experience.length) warnings.push("No work experience was detected. If your CV has experience, add it in the Experience section.");
  if (content.experience.some((e) => !e.role || !e.company)) warnings.push("Some job titles or company names may be swapped or missing — check the Experience section.");

  const found: ParsedSection[] = sections.slice(1).map((s) => ({ kind: s.kind as SectionKind, title: s.title, customId: s.customId }));
  return {
    content,
    warnings,
    stats: {
      sections: sections.length - 1,
      experience: content.experience.length,
      education: content.education.length,
      skills: content.skills.length,
    },
    sections: found,
    layout: layoutFromSections(found, content),
  };
}

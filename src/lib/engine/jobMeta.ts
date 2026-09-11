/* Job-description line classification.
   Separates CANDIDATE-RELEVANT information (skills, responsibilities, qualifications)
   from COMPANY information and JOB METADATA (location, salary, employment type,
   work arrangement, application instructions, legal boilerplate). Metadata informs
   the analysis but must never be inserted into CV content. */

export type MetaKind = "salary" | "location" | "employment" | "arrangement" | "instructions" | "eeo" | "contact";

const LABEL = /^\s*(location|job location|work location|office|based in|salary|pay|compensation|remuneration|package|employment type|job type|contract type|type|work arrangement|work model|workplace type|schedule|hours|closing date|apply by|start date|reference|ref|job id|requisition)\s*[:\-–]\s*/i;

const SALARY = /(?:[$£€₹¥]|\b(?:aud|usd|gbp|eur|cad|sgd|inr|bdt|tk)\b)\s?\d|\b\d[\d,.]*\s?k?\s*(?:[-–to]+\s*[$£€₹]?\d[\d,.]*\s?k?)?\s*(?:per|\/|a)\s*(?:year|annum|yr|hour|hr|month)\b|\b(salary|compensation|remuneration|per annum|p\.a\.|pay (?:range|rate|band)|base pay|ote|super(?:annuation)?)\b/i;
const ADDRESS = /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|way|place|pl|square|sq|parade|highway|hwy)\b\.?/i;
const EMPLOYMENT = /\b(full[- ]time|part[- ]time|permanent|fixed[- ]term|contract(?:or)?|temporary|temp|casual|freelance|seasonal)\b/i;
const ARRANGEMENT = /\b(remote|hybrid|on[- ]?site|in[- ]office|work from home|wfh)\b/i;
const INSTRUCTIONS = /\b(to apply|how to apply|apply (?:now|today|via|through|online|by|here|at)|click apply|send (?:your|a|an) (?:cv|resume|application)|submit (?:your|an|a) (?:cv|resume|application)|applications? (?:close|closing|deadline|will be reviewed)|please (?:email|send|submit|include|quote|apply)|cover letter|quote (?:the )?ref|reference (?:number|code)|shortlisted candidates|only successful|no agencies|recruitment agencies)\b/i;
const EEO = /\b(equal (?:employment )?opportunit|eeo\b|affirmative action|regardless of (?:race|gender|age)|all qualified applicants|we (?:welcome|encourage) applications|diversity (?:and|&) inclusion|accommodations? (?:during|for) the (?:application|interview)|background check|right to work|visa sponsorship)\b/i;
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/\S+|www\.\S+|\b(?:contact|recruiter|hiring manager|talent partner)\s*[:\-]?\s+[A-Z][a-z]+\s+[A-Z][a-z]+/i;

/** Returns the metadata kind of a line, or null if it's candidate-relevant content. */
export function classifyMetaLine(line: string): MetaKind | null {
  const l = line.trim();
  if (!l) return null;
  const labeled = l.match(LABEL);
  if (labeled) {
    const k = labeled[1].toLowerCase();
    if (/salary|pay|compensation|remuneration|package/.test(k)) return "salary";
    if (/location|office|based/.test(k)) return "location";
    if (/employment|job type|contract|^type|schedule|hours/.test(k)) return "employment";
    if (/arrangement|model|workplace/.test(k)) return "arrangement";
    return "instructions";
  }
  if (EEO.test(l)) return "eeo";
  if (INSTRUCTIONS.test(l)) return "instructions";
  if (CONTACT.test(l)) return "contact";
  if (SALARY.test(l) && (l.length < 140 || /\b(salary|per annum|compensation)\b/i.test(l))) return "salary";
  if (ADDRESS.test(l)) return "location";
  // short standalone lines like "Full-time · Hybrid · Sydney, NSW"
  if (l.length < 70 && (EMPLOYMENT.test(l) || ARRANGEMENT.test(l)) && !/\b(experience|skills?|knowledge|ability|degree|responsib)\b/i.test(l)) {
    return EMPLOYMENT.test(l) ? "employment" : "arrangement";
  }
  return null;
}

export interface JobMeta {
  location: string | null;
  employmentType: string | null;
  workArrangement: string | null;
  salary: string | null;
  applicationInstructions: string[];
}

const clean = (s: string) => s.replace(LABEL, "").replace(/^[\s•·*\-–—]+/, "").trim();

export function extractJobMeta(lines: { line: string; kind: MetaKind }[], titleLine: string): JobMeta {
  const meta: JobMeta = { location: null, employmentType: null, workArrangement: null, salary: null, applicationInstructions: [] };
  for (const { line, kind } of lines) {
    const v = clean(line);
    if (kind === "salary" && !meta.salary) meta.salary = v.slice(0, 120);
    // "Austin, TX (Hybrid - 3 days in office)" → "Austin, TX": drop the arrangement with its whole parenthetical
    if (kind === "location" && !meta.location)
      meta.location =
        v
          .replace(/\s*\(([^)]*)\)?/g, (m, inner: string) => (ARRANGEMENT.test(inner) ? "" : m))
          .replace(new RegExp(`\\s*[·|,–—-]?\\s*${ARRANGEMENT.source}.*$`, "i"), "")
          .replace(/[()·|,\s–—-]+$/, "")
          .trim()
          .slice(0, 100) || null;
    if (kind === "employment" && !meta.employmentType) meta.employmentType = (line.match(EMPLOYMENT)?.[0] ?? v).slice(0, 40);
    if ((kind === "arrangement" || kind === "employment" || kind === "location") && !meta.workArrangement) meta.workArrangement = line.match(ARRANGEMENT)?.[0] ?? null;
    if ((kind === "instructions" || kind === "contact") && meta.applicationInstructions.length < 5) meta.applicationInstructions.push(v.slice(0, 200));
  }
  // "Accounts Payable Specialist — XYZ Company, Sydney NSW"
  if (!meta.location) {
    const m = titleLine.match(/(?:[,|–—-]|\bin\b)\s*([A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+)?)\s*$/);
    if (m && /,|\b[A-Z]{2,3}\b/.test(m[1]) && m[1].split(/\s+/).length <= 5) meta.location = m[1].trim();
  }
  if (!meta.workArrangement) meta.workArrangement = titleLine.match(ARRANGEMENT)?.[0] ?? null;
  return meta;
}

/** Terms from the job posting that must never appear in CV content. */
export function forbiddenJobTerms(a: { company?: string; location?: string | null; salary?: string | null; applicationInstructions?: string[] }): string[] {
  const out = new Set<string>();
  if (a.company && a.company.length > 2) out.add(a.company);
  if (a.location) {
    out.add(a.location);
    for (const part of a.location.split(/[,/|]/).map((s) => s.trim())) {
      if (part.length > 3 && !/^(remote|hybrid|level \d+)$/i.test(part)) out.add(part);
      // "Sydney NSW 2000" → also block the bare city "Sydney"
      const city = part.replace(/\s+(?:[A-Z]{2,3}|\d{3,6})(?:\s+\d{3,6})?$/, "").trim();
      if (city !== part && city.length > 3 && /^[A-Z]/.test(city) && !/\d/.test(city)) out.add(city);
    }
  }
  if (a.salary) for (const n of a.salary.match(/[$£€₹]?\d[\d,.]*\s?k?/g) ?? []) if (n.replace(/\D/g, "").length >= 3) out.add(n.trim());
  for (const line of a.applicationInstructions ?? []) {
    for (const m of line.match(/[\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/\S+|www\.\S+/g) ?? []) out.add(m);
  }
  return [...out];
}

export const JOB_META_PHRASES = /\b(per annum|salary|apply (?:now|via|by)|send your (?:cv|resume)|job location|office located|located at|applications close|equal opportunity|visa sponsorship)\b/i;

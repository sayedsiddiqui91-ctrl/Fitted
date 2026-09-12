import type { JobAnalysis } from "@/lib/ai/types";
import { FUNCTIONS, GENERIC_WORDS, INDUSTRIES, STOPWORDS } from "./lexicon";
import { findTerms, indexText, lookupTerm, norm, uniqueBy } from "./text";
import { verbFromAny } from "./verbs";
import { classifyMetaLine, extractJobMeta, type MetaKind } from "./jobMeta";

type Bucket = "resp" | "req" | "pref" | "other" | "none";

const HEADINGS: { bucket: Bucket; re: RegExp }[] = [
  { bucket: "pref", re: /^(nice[- ]to[- ]haves?|preferred( qualifications| skills| experience)?|bonus( points)?|desirable|pluses|good to have|it would be (great|nice)|extra credit|additional (qualifications|skills))\b/i },
  { bucket: "resp", re: /^(key )?(responsibilities|duties|accountabilities)|^(what you('| wi)ll (do|be doing)|your role|in this role|day[- ]to[- ]day|job duties|your impact|what the job involves|main tasks)\b/i },
  { bucket: "none", re: /^(about the (role|job|position|opportunity)|role overview|the role|job description|overview|the opportunity)\b/i },
  { bucket: "req", re: /^(requirements|minimum requirements|qualifications|basic qualifications|minimum qualifications|essential( criteria| skills)?|what you('| wi)ll (need|bring)|who you are|about you|skills( and experience| & experience)?|must[- ]haves?|required( skills| experience)?|experience required|you have|your profile|we('| a)re looking for|what we('| a)re looking for|key skills|competencies)\b/i },
  { bucket: "other", re: /^(about (us|the company|the team)|benefits|perks|what we offer|why (join|work)|compensation|salary|equal opportunit|our (values|mission|culture)|how to apply|location|diversity)\b/i },
];

const PREF_CUE = /\b(preferred|nice to have|a plus|is a plus|are a plus|bonus|desirable|advantageous|ideally|beneficial|would be great)\b/i;
const REQ_CUE = /\b(required|must|minimum|essential|at least|mandatory|need to have)\b/i;
const IGNORE_ACRONYMS = new Set("USA US UK EU OR AND IT CV EEO EOE PTO WFH FTE NYC LLC INC CEO CFO COO CTO VP TBD HQ AM PM ASAP FAQ ID NA TX CA NY UAE KSA UI UX API APIS".split(" "));

function stripBullet(l: string) {
  return l.replace(/^[\s•·●◦▪■□‣⁃*\-–—>]+/, "").replace(/^\d+[.)]\s+/, "").trim();
}

function isHeading(line: string): Bucket | null {
  // "Location: 200 George St" / "Salary: $75k" are label–value lines, not headings
  if (/[:：]\s*\S/.test(stripBullet(line))) return null;
  const l = stripBullet(line).replace(/[:：]\s*$/, "").trim();
  if (l.length > 70 || /[.!?]$/.test(l)) return null;
  for (const h of HEADINGS) if (h.re.test(l)) return h.bucket;
  return null;
}

function startsWithVerb(l: string): boolean {
  const first = stripBullet(l).split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, "") ?? "";
  return !!first && !!verbFromAny(first);
}

function detectTitleCompany(lines: string[], text: string): { title: string; company: string } {
  let title = "";
  let company = "";
  const labeled = text.match(/(?:job title|position|role)\s*[:\-–]\s*([^\n]{3,80})/i);
  if (labeled) title = labeled[1].trim();
  const comp = text.match(/(?:company|employer|organi[sz]ation)\s*[:\-–]\s*([^\n]{2,60})/i);
  if (comp) company = comp[1].trim();

  if (!title && lines.length) {
    const first = stripBullet(lines[0]);
    if (first.length < 90 && !isHeading(first) && !/[.!?]$/.test(first)) {
      const parts = first.split(/\s+[—–|]\s+|\s+-\s+|\s+at\s+/);
      title = parts[0].replace(/\s*[,(].*$/, "").trim();
      // "Company, Sydney NSW" → company only (the location is job metadata)
      if (!company && parts[1]) company = parts[1].replace(/[,(].*$/, "").trim();
      // Title on line 1, company alone on line 2 ("Senior Finance Analyst\nNorthwind Partners")
      const second = lines[1] ? stripBullet(lines[1]) : "";
      if (
        !company &&
        second &&
        second.length <= 60 &&
        second.split(/\s+/).length <= 5 &&
        /^[A-Z0-9]/.test(second) &&
        !/[:.!?]$|[:：]\s*\S/.test(second) &&
        !isHeading(second) &&
        !/\b(remote|hybrid|on-?site|full[- ]time|part[- ]time|contract|salary|\d{2,})\b/i.test(second)
      )
        company = second.replace(/\s*[,(].*$/, "").trim();
    }
  }
  if (!title) {
    const m = text.match(/(?:looking for|hiring|seeking|recruiting)\s+(?:an?\s+|our next\s+)?(?:talented\s+|motivated\s+|experienced\s+)?([A-Z][\w&/\-]*(?:\s+[A-Z&][\w&/\-]*){0,4})/);
    if (m) title = m[1].trim();
  }
  if (!company) {
    const m =
      text.match(/\b([A-Z][\w&.\-]+(?:\s+[A-Z][\w&.\-]+){0,3})\s+is\s+(?:looking|hiring|seeking|searching)/) ??
      text.match(/\babout\s+([A-Z][\w&.\-]+(?:\s+[A-Z][\w&.\-]+){0,3})\s*(?:\n|:)/i) ??
      text.match(/\bjoin\s+([A-Z][\w&.\-]+(?:\s+[A-Z][\w&.\-]+){0,2})(?:'s)?\s+(?:team|as)/) ??
      // "Northwind Partners is a fast-growing…" / "… is an equal opportunity employer"
      text.match(/(?:^|\n)\s*([A-Z][\w&.\-]+(?:\s+[A-Z][\w&.\-]+){0,3})\s+is\s+(?:a|an)\s+(?:[\w-]+\s+){0,4}(?:company|consultancy|firm|business|group|agency|organi[sz]ation|provider|leader|employer|startup|team)\b/);
    if (m && !/^(the|our|us|a|an|you|we|this)\b/i.test(m[1])) company = m[1].trim();
  }
  return { title: title.replace(/\s{2,}/g, " ").slice(0, 80), company: company.slice(0, 60) };
}

function detectSeniority(title: string, text: string, years: number | null): JobAnalysis["seniority"] {
  const t = title.toLowerCase();
  const all = text.toLowerCase();
  const test = (re: RegExp) => re.test(t) || (!t && re.test(all));
  if (/\bintern(ship)?\b|\bplacement\b|work experience programme/.test(t) || /\binternship\b/.test(all.slice(0, 400))) return "Internship";
  if (test(/\b(graduate|new grad|entry[- ]level|trainee|apprentice)\b/)) return "Entry-level";
  if (test(/\b(head of|director|vp|vice president|manager|chief)\b/)) return "Managerial";
  if (test(/\b(senior|sr\.?|lead|principal|staff)\b/)) return "Senior";
  if (test(/\b(junior|jr\.?|associate)\b/)) return "Junior";
  if (years != null) {
    if (years <= 1) return "Entry-level";
    if (years <= 3) return "Junior";
    if (years <= 6) return "Mid-level";
    return "Senior";
  }
  if (/\b(entry[- ]level|recent graduate|no experience required)\b/.test(all)) return "Entry-level";
  return "Unspecified";
}

function scoreMap(map: Record<string, string[]>, text: string, titleText: string): string {
  let best = "";
  let bestScore = 0;
  const l = text.toLowerCase();
  const tl = titleText.toLowerCase();
  for (const [name, words] of Object.entries(map)) {
    let s = 0;
    for (const w of words) {
      const re = new RegExp(`(?:^|[^a-z0-9])${w.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9])`, "g");
      const count = (l.match(re) ?? []).length;
      s += Math.min(count, 4);
      if (re.test(tl)) s += 4;
    }
    if (s > bestScore) {
      bestScore = s;
      best = name;
    }
  }
  return best;
}

function extractPhrases(lines: string[], known: Set<string>): string[] {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const words = norm(line)
      .trim()
      .split(" ")
      .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9+#]+$/g, ""));
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n);
        if (gram.some((w) => !w || w.length < 3 || STOPWORDS.has(w))) continue;
        if (GENERIC_WORDS.has(gram[0]) || GENERIC_WORDS.has(gram[n - 1])) continue;
        const g = gram.join(" ");
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .filter(([g, c]) => c >= 2 && ![...known].some((k) => k.includes(g) || g.includes(k)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([g]) => g.replace(/\b\w/g, (c) => c.toUpperCase()));
}

/* Not every posting uses bullet points. "…build REST APIs. Requirements: 2+ years with .NET, SQL.
   Nice to have: Angular." is one paragraph holding a required list AND a preferred list — splitting it
   at the cue words keeps ".NET" a requirement instead of lumping the whole line under "nice to have". */
const INLINE_CUE = /(?=\b(?:requirements?|responsibilities|qualifications?|must[- ]haves?|what you(?:'|’)ll do|what we(?:'|’)re looking for|nice to have|preferred|bonus|desirable|a plus|plus(?:es)?)\b\s*:)/i;

export function splitAtInlineCues(line: string): string[] {
  const t = line.trim();
  if (t.length < 60 || !INLINE_CUE.test(t.slice(1))) return [t];
  // Break the paragraph into sentences first, then start a new line wherever a cue begins
  const out: string[] = [];
  for (const sentence of t.split(/(?<=[.;])\s+/)) {
    const parts = sentence.split(INLINE_CUE).filter((p) => p.trim());
    out.push(...parts.map((p) => p.trim()));
  }
  return out.length ? out : [t];
}

export function analyzeJobDescription(raw: string): JobAnalysis {
  const text = raw.replace(/\r/g, "").replace(/\t/g, " ");
  const lines = text
    .split("\n")
    .flatMap(splitAtInlineCues)
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Bucket every line by the heading it sits under (plus inline cues).
  //    Job metadata (salary, location, instructions…) is set aside first — it's
  //    useful context, but must never feed skills, keywords or CV content.
  let bucket: Bucket = "none";
  let aboutCompany = false;
  const companyLines: string[] = [];
  const metaLines: { line: string; kind: MetaKind }[] = [];
  const tagged: { line: string; bucket: Bucket }[] = [];
  for (const [li, l] of lines.entries()) {
    const h = isHeading(l);
    if (h) {
      bucket = h;
      aboutCompany = h === "other" && /about (us|the company|the team|[A-Z])/i.test(stripBullet(l));
      continue;
    }
    if (li > 0) {
      const meta = classifyMetaLine(l);
      if (meta) {
        metaLines.push({ line: stripBullet(l), kind: meta });
        continue;
      }
    }
    if (aboutCompany && companyLines.length < 3) companyLines.push(stripBullet(l));
    let b: Bucket = bucket;
    if (b !== "other") {
      if (PREF_CUE.test(l)) b = "pref";
      // "…with strong .NET and C# experience" is a requirement written as prose, not just an overview
      else if (b === "none")
        b =
          REQ_CUE.test(l) || /\b(years?|degree|experience (with|in)|proficien|knowledge of)\b/i.test(l) || /\b(strong|solid|proven|hands[- ]on|extensive|deep|excellent)\s+(?:\S+\s+){0,4}(experience|skills|background|command)\b/i.test(l)
            ? "req"
            : startsWithVerb(l)
              ? "resp"
              : "none";
    }
    tagged.push({ line: stripBullet(l), bucket: b });
  }
  const hasStructure = tagged.some((t) => t.bucket === "req" || t.bucket === "resp");

  // 2. Skills per bucket
  const required: string[] = [];
  const preferred: string[] = [];
  const mentioned: string[] = []; // in intro/overview text — a keyword, not a requirement
  const soft: string[] = [];
  const certs: string[] = [];
  const titleLine = stripBullet(lines[0] ?? "");
  tagged.forEach(({ line, bucket: b }, i) => {
    if (b === "other") return;
    // the title line describes the role itself ("Software Engineer"), not a skill requirement
    if (i === 0 && line === titleLine && line.length < 90) return;
    const found = findTerms(indexText(line));
    for (const { term } of found.values()) {
      if (term.category === "soft") soft.push(term.canonical);
      else if (term.category === "certification") certs.push(term.canonical);
      else if (b === "pref") preferred.push(term.canonical);
      else if (b === "req" || b === "resp" || !hasStructure) required.push(term.canonical);
      else mentioned.push(term.canonical);
    }
  });
  const requiredSkills = uniqueBy(required, (s) => s.toLowerCase());
  const reqSet = new Set(requiredSkills.map((s) => s.toLowerCase()));
  const preferredSkills = uniqueBy(preferred, (s) => s.toLowerCase()).filter((s) => !reqSet.has(s.toLowerCase()));

  // 3. Acronyms / tools not in the lexicon
  const acronyms = new Set<string>();
  for (const { line, bucket: b } of tagged) {
    if (b === "other") continue;
    for (const m of line.matchAll(/\b[A-Z][A-Z0-9&]{1,5}\b/g)) {
      const a = m[0];
      if (IGNORE_ACRONYMS.has(a)) continue;
      // skip acronyms that are part of a detected skill ("BI" in "Power BI")
      if ([...requiredSkills, ...preferredSkills, ...certs].some((s) => new RegExp(`(^|[^A-Za-z])${a}([^A-Za-z]|$)`, "i").test(s))) continue;
      // skip abbreviations of skills already found ("AP" = Accounts Payable)
      const abbrOf = lookupTerm(a)?.canonical;
      if (abbrOf && [...requiredSkills, ...preferredSkills, ...certs].includes(abbrOf)) continue;
      if (new RegExp(`(^|[^A-Za-z])${a}([^A-Za-z]|$)`).test(`${lines[0] ?? ""}`)) continue;
      acronyms.add(a);
    }
  }

  // 4. Responsibilities & qualifications
  const responsibilities = uniqueBy(
    tagged.filter((t) => t.bucket === "resp" || (!hasStructure && startsWithVerb(t.line))).map((t) => t.line),
    (s) => s.toLowerCase(),
  )
    .filter((l) => l.length > 12 && l.length < 260)
    .slice(0, 10);

  const qualifications = uniqueBy(
    tagged
      .filter((t) => (t.bucket === "req" || t.bucket === "none") && /\b(degree|bachelor|master|mba|phd|diploma|years?|certif|cpa|cfa|acca|licen[cs]e|background in|qualified)\b/i.test(t.line))
      .map((t) => t.line),
    (s) => s.toLowerCase(),
  )
    .filter((l) => l.length < 240)
    .slice(0, 8);

  // 5. Years / degree / fields
  let yearsExperience: number | null = null;
  for (const m of text.matchAll(/(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?\+?\s*(?:years?|yrs?)(?:'|’)?\s*(?:of\s+)?(?:\w+\s+){0,4}?(?:experience|exp\b|in\b|working)/gi)) {
    const n = Number(m[1]);
    if (n > 0 && n < 30) yearsExperience = yearsExperience == null ? n : Math.min(yearsExperience, n);
  }

  const reqText = tagged.filter((t) => t.bucket !== "pref" && t.bucket !== "other").map((t) => t.line).join("\n").toLowerCase();
  let degreeLevel: JobAnalysis["degreeLevel"] = "none";
  if (/\b(bachelor'?s?|b\.?s\.?c?|b\.?a\.?|undergraduate degree|university degree|degree in|4-year degree|college degree)\b/.test(reqText)) degreeLevel = "bachelor";
  else if (/\b(master'?s?|mba|m\.?sc?)\b/.test(reqText)) degreeLevel = "master";
  else if (/\b(ph\.?d|doctorate)\b/.test(reqText)) degreeLevel = "phd";
  else if (/\bassociate'?s? degree\b/.test(reqText)) degreeLevel = "associate";

  const educationFields: string[] = [];
  const fieldMatch = text.match(/(?:degree|bachelor'?s|master'?s|diploma|background)\s+(?:degree\s+)?in\s+([A-Za-z ,&/]+?)(?:\s+or\s+(?:a\s+)?(?:related|equivalent|similar)|[.;\n]|$)/i);
  if (fieldMatch) {
    for (const f of fieldMatch[1].split(/,|\/|\bor\b|\band\b/)) {
      const c = f.trim();
      if (c && c.length < 40 && !/related|equivalent|similar|field/i.test(c)) educationFields.push(c.replace(/\b\w/g, (x) => x.toUpperCase()));
    }
  }

  const { title, company } = detectTitleCompany(lines, text);
  const seniority = detectSeniority(title, text, yearsExperience);
  const industry = scoreMap(INDUSTRIES, text, `${title} ${company}`) || "General";
  const jobFunction = scoreMap(FUNCTIONS, text, title) || "General";

  // 6. Keywords = weighted skills + repeated phrases + acronyms + certifications
  const known = new Set([...requiredSkills, ...preferredSkills, ...soft, ...certs].map((s) => s.toLowerCase()));
  const tLower = title.toLowerCase();
  const cLower = company.toLowerCase();
  const phrases = extractPhrases(tagged.filter((t) => t.bucket !== "other").map((t) => t.line), known).filter((p) => {
    const pl = p.toLowerCase();
    return !(tLower && (tLower.includes(pl) || pl.includes(tLower))) && !(cLower && (cLower.includes(pl) || pl.includes(cLower)));
  });
  const keywords = uniqueBy([...requiredSkills, ...preferredSkills, ...certs, ...mentioned, ...acronyms, ...phrases], (s) => s.toLowerCase()).slice(0, 30);

  return {
    jobTitle: title,
    company,
    seniority,
    industry,
    jobFunction,
    requiredSkills,
    preferredSkills,
    responsibilities,
    qualifications: uniqueBy([...qualifications, ...certs.map((c) => `${c} certification`)], (s) => s.toLowerCase()).slice(0, 8),
    softSkills: uniqueBy(soft, (s) => s.toLowerCase()),
    keywords,
    yearsExperience,
    degreeLevel,
    educationFields,
    ...extractJobMeta(metaLines, stripBullet(lines[0] ?? "")),
    companyDescription: companyLines.length ? companyLines.join(" ").slice(0, 400) : null,
  };
}

import { NOMINALIZATIONS, WEAK_OPENERS, verbFromAny, verbFromBase, verbFromGerund, verbFromPast } from "./verbs";
import { findTerms, indexText, lookupTerm, sentenceCase, textHasTerm } from "./text";

export interface RewriteOptions {
  current: boolean;
  mode: "conservative" | "balanced" | "aggressive";
  endWithPeriod: boolean;
  /** Job terms whose exact wording we may mirror (only when the bullet already says the same thing). */
  jobTerms?: string[];
}

export interface RewriteResult {
  text: string;
  reasons: string[];
}

const conj = (base: string, current: boolean) => {
  const v = verbFromBase(base);
  if (!v) return sentenceCase(base);
  return sentenceCase(current ? v.base : v.past);
};

/** Improve a single bullet without adding facts: stronger verb, tense, filler removal, job wording. */
export function rewriteBullet(input: string, opts: RewriteOptions): RewriteResult {
  const reasons: string[] = [];
  let t = input.trim().replace(/^[•·▪‣◦●■*\-–—]\s*/, "").replace(/\s+/g, " ");
  if (!t) return { text: input, reasons };

  // 1. Drop first-person start
  if (/^(i|we)\s+/i.test(t)) {
    t = t.replace(/^(i|we)\s+/i, "");
    reasons.push("Removes the first-person pronoun");
  }

  // 2. Weak openers → action verbs
  let convertedGerund = false;
  for (const op of WEAK_OPENERS) {
    const m = t.match(op.re);
    if (!m) continue;
    let rest = t.slice(m[0].length).trim();
    let out: string | null = null;
    const first = rest.split(/\s+/)[0]?.toLowerCase() ?? "";
    const g = verbFromGerund(first);
    if (op.replacement === null) {
      const nom = rest.match(/^(?:the\s+)?(\w+)\s+of\s+(.+)$/i);
      // remaining coordinated gerunds ("…and making payments") are converted in step 3b
      if (g) {
        out = `${sentenceCase(opts.current ? g.base : g.past)} ${rest.slice(first.length).trim()}`;
        convertedGerund = true;
      }
      else if (nom && NOMINALIZATIONS[nom[1].toLowerCase()]) out = `${conj(NOMINALIZATIONS[nom[1].toLowerCase()], opts.current)} ${nom[2]}`;
      else out = `${opts.current ? "Manage" : "Managed"} ${rest}`;
    } else if (op.replacement === "Supported" && g) {
      out = `${opts.current ? "Contribute" : "Contributed"} to ${rest}`;
    } else {
      const rep = op.replacement;
      const v = verbFromPast(rep.split(" ")[0]);
      const verb = v && opts.current ? sentenceCase(v.base) + rep.slice(rep.split(" ")[0].length) : rep;
      out = `${verb} ${rest}`;
    }
    if (out) {
      reasons.push(`Leads with an action verb instead of “${op.label}”`);
      t = out;
    }
    break;
  }

  // 3. Gerund / base form at the start → correct tense
  const startedAsGerundList = !!verbFromGerund((t.split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-z]/g, ""));
  const w0 = t.split(/\s+/)[0] ?? "";
  const w0l = w0.toLowerCase().replace(/[^a-z]/g, "");
  const ger = verbFromGerund(w0l);
  if (ger) {
    t = `${sentenceCase(opts.current ? ger.base : ger.past)}${t.slice(w0.length)}`;
    reasons.push(opts.current ? "Uses present tense for your current role" : "Uses past tense for a previous role");
  } else if (!opts.current) {
    const v = verbFromAny(w0l);
    if (v && (w0l === v.base || w0l === v.third) && v.base !== v.past && !verbFromPast(w0l)) {
      t = `${sentenceCase(v.past)}${t.slice(w0.length)}`;
      reasons.push("Uses past tense for a previous role");
    }
  }

  // 3b. Coordinated gerunds: "Processed invoices and making payments" → "…and made payments"
  //     Only after "and"/"," — never after "by"/"while"/"for", which introduce the HOW of the action.
  if (ger || startedAsGerundList || convertedGerund) {
    t = t.replace(/(,\s*|\s+and\s+)([a-z]+ing)\b/g, (m, sep: string, word: string) => {
      const v = verbFromGerund(word);
      return v ? `${sep}${opts.current ? v.base : v.past}` : m;
    });
  }

  // 4. Filler & wordiness
  const before = t;
  t = t
    .replace(/\bin order to\b/gi, "to")
    .replace(/\butili[sz]ed\b/gi, "used")
    .replace(/\butili[sz]ing\b/gi, "using")
    .replace(/\bvarious different\b/gi, "various")
    .replace(/\ba lot of\b/gi, "many")
    .replace(/\bon a (daily|weekly|monthly) basis\b/gi, (_m, p: string) => `${p}`)
    .replace(/\b(successfully|effectively)\s+/gi, "")
    .replace(/\s{2,}/g, " ");
  if (t !== before) reasons.push("Cuts filler words");

  // 5. Mirror the job's wording for abbreviations (same meaning, clearer for ATS)
  if (opts.mode !== "conservative" && opts.jobTerms?.length) {
    for (const term of opts.jobTerms) {
      const lex = lookupTerm(term);
      if (!lex || lex.canonical.length <= 3) continue;
      const abbr = lex.aliases.find((a) => a.length <= 3 && a === a.toUpperCase() && new RegExp(`\\b${a.replace(/[^A-Za-z0-9]/g, "")}\\b`).test(t));
      if (abbr && !t.toLowerCase().includes(lex.canonical.toLowerCase())) {
        const full = lex.category === "domain" ? lex.canonical.toLowerCase() : lex.canonical;
        t = t.replace(new RegExp(`\\b${abbr}\\b`), `${full} (${abbr})`);
        reasons.push(`Spells out “${abbr}” as the job does: “${lex.canonical}”`);
      }
    }
  }

  // 6. Tidy
  t = sentenceCase(t.trim());
  t = t.replace(/[.;,]+$/, "");
  if (opts.endWithPeriod) t += ".";
  return { text: t, reasons: [...new Set(reasons)] };
}

/** Does this role's writing mostly use present tense ("Manage…") rather than past ("Managed…")? */
export function prefersPresent(texts: string[]): boolean {
  let present = 0;
  let past = 0;
  for (const t of texts) {
    const w = t.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
    const v = verbFromAny(w);
    if (!v || v.base === v.past) continue;
    if (w === v.past) past++;
    else if (w === v.base || w === v.third) present++;
  }
  return present > past;
}

/** "Reconciled vendor accounts" → "reconciling vendor accounts" (for summaries). */
export function toGerundClause(bullet: string): string | null {
  const t = bullet.trim().replace(/[.;]+$/, "");
  const w = t.split(/\s+/)[0] ?? "";
  const v = verbFromAny(w.toLowerCase());
  if (!v) return null;
  // "Analyzed X and collaborated with Y" → "analyzing X and collaborating with Y" (keep the verbs parallel)
  const rest = t.slice(w.length).replace(/(,\s|\sand\s)([a-z]+ed)\b/g, (m, j: string, word: string) => {
    const c = verbFromAny(word);
    return c ? `${j}${c.gerund}` : m;
  });
  return `${v.gerund}${rest}`;
}

/** Shortens text without changing facts. */
export function shorten(text: string): string {
  let t = text
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\b(successfully|effectively|efficiently|various|very|really|actively|significantly|extremely)\s+/gi, "")
    .replace(/\bin order to\b/gi, "to")
    .replace(/\bwas responsible for\b/gi, "")
    .replace(/\bon a (daily|weekly|monthly) basis\b/gi, "$1")
    .replace(/\bthat\s+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const words = t.split(/\s+/);
  if (words.length > 22) {
    const cut = t.search(/,\s|;\s|\s—\s/);
    if (cut > 40) t = t.slice(0, cut);
  }
  t = sentenceCase(t.replace(/[.;,]+$/, ""));
  return /\.$/.test(text.trim()) ? `${t}.` : t;
}

export interface NoteToBulletOptions {
  /** The skill the user just confirmed ("Management reporting") — the one term we may add */
  keyword?: string;
  /** Present tense for a current role that is written in present tense */
  current: boolean;
  endWithPeriod: boolean;
}

/* Words that tell us what kind of work a noun-phrase note describes, so it can open with a fitting verb.
   The verb is the only word introduced; everything else comes from the user's note. */
const NOUN_VERBS: [RegExp, { present: string; past: string }][] = [
  // comparisons are prepared ("budget vs actual", "variances"), even though they mention a budget
  [/\b(vs\.?|versus|variances?|comparisons?|reconciliation reports?)\b/i, { present: "Prepare", past: "Prepared" }],
  [/\b(reports?|reporting|statements?|summar(?:y|ies)|packs?|presentations?|documentation|memos?|papers?)\b/i, { present: "Prepare", past: "Prepared" }],
  [/\b(dashboards?|models?|tools?|trackers?|templates?|spreadsheets?|macros?|pipelines?|apps?|systems?|websites?)\b/i, { present: "Build", past: "Built" }],
  [/\b(budgets?|budgeting|forecasts?|forecasting|plans?|planning)\b/i, { present: "Support", past: "Supported" }],
  [/\b(analysis|analytics|data|variances?|trends?|research)\b/i, { present: "Analyze", past: "Analyzed" }],
  [/\b(reconciliations?|invoices?|payments?|payroll|accounts?|ledgers?|journals?|entries|close|closing)\b/i, { present: "Process", past: "Processed" }],
  [/\b(vendors?|suppliers?|clients?|customers?|stakeholders?|teams?|projects?|processes|operations|workflows?)\b/i, { present: "Manage", past: "Managed" }],
  [/\b(audits?|compliance|controls?|reviews?)\b/i, { present: "Support", past: "Supported" }],
];

/**
 * Turns a short note the user typed ("yes i did monthly mgmt reports for the directors") into a CV bullet
 * ("Prepared monthly management reports for the directors."). It never adds facts: no numbers, tools or
 * results that aren't in the note. The only additions are an opening verb and, when the note doesn't
 * already say it, the skill the user confirmed.
 */
export function noteToBullet(note: string, opts: NoteToBulletOptions): string {
  let t = note
    .trim()
    .replace(/^[•·▪*\-–—]\s*/, "")
    .replace(/\s+/g, " ")
    // conversational openers that answer the question rather than describe the work
    .replace(/^(?:yes|yeah|yep|sure|ok(?:ay)?)\b[\s,.!:-]*/i, "")
    .replace(/^(?:i|we)\s+(?:have|had|did|do|was|were|am|used to|would|often|also|mainly|mostly)?\s*/i, "")
    .replace(/^(?:have|had)\s+(?:experience|worked)\s+(?:in|with|on)\s+/i, "")
    .replace(/^(?:experience|worked)\s+(?:in|with|on)\s+/i, "")
    .replace(/^(?:done|did|doing)\s+/i, "")
    .replace(/\bmgmt\b/gi, "management")
    .replace(/\bmgr\b/gi, "manager")
    .replace(/\bw\/\s*/gi, "with ")
    .replace(/\bacct?s\b/gi, "accounts")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return note.trim();

  // "Helped the team build X" → "Supported the team in building X"; "Helped build X" → "Contributed to building X"
  const helped = t.match(/^help(?:ed|ing|s)?\s+(?:to\s+)?(.*)$/i);
  if (helped) {
    const words = helped[1].split(/\s+/);
    const vi = words.findIndex((w, i) => i < 5 && !!verbFromBase(w.toLowerCase()));
    if (vi === 0) t = `${opts.current ? "Contribute" : "Contributed"} to ${verbFromBase(words[0].toLowerCase())!.gerund} ${words.slice(1).join(" ")}`;
    else if (vi > 0) t = `${opts.current ? "Support" : "Supported"} ${words.slice(0, vi).join(" ")} in ${verbFromBase(words[vi].toLowerCase())!.gerund} ${words.slice(vi + 1).join(" ")}`;
  }

  const first = (t.split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!verbFromAny(first)) {
    // A noun phrase ("monthly management reports for the directors") — open with a verb that fits it
    const hit = NOUN_VERBS.find(([re]) => re.test(t));
    const verb = hit ? (opts.current ? hit[1].present : hit[1].past) : opts.current ? "Deliver" : "Delivered";
    t = `${verb} ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
  }

  // Tense, stronger opener, filler — the existing rules, which never add facts
  t = rewriteBullet(t, { current: opts.current, mode: "balanced", endWithPeriod: false }).text;

  // Name the confirmed skill if the note doesn't already, so the bullet actually shows it
  const kw = opts.keyword?.trim();
  if (kw) {
    const words = kw.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const lower = t.toLowerCase();
    // Covered when the note already says it, or most of its words — a redundant tag reads badly
    const stemHits = words.filter((w) => lower.includes(w.slice(0, Math.max(4, w.length - 3)))).length;
    const mentioned = !!textHasTerm(indexText(t), kw) || lower.includes(kw.toLowerCase()) || (words.length > 0 && stemHits >= Math.ceil(words.length / 2));
    if (!mentioned) {
      const phrase = lookupTerm(kw)?.category === "tool" ? `using ${kw}` : `supporting ${kw.toLowerCase()}`;
      t = `${t.replace(/[.;,]+$/, "")}, ${phrase}`;
    }
  }

  // Tools in their proper spelling: "power bi" → "Power BI", "excel" → "Excel"
  for (const { term, surface } of findTerms(indexText(t)).values()) {
    if (term.category !== "tool" || surface.toLowerCase() !== term.canonical.toLowerCase()) continue;
    const escaped = surface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\b${escaped}\\b`, "gi"), term.canonical);
  }
  t = sentenceCase(t.replace(/[.;,]+$/, "").replace(/\s+/g, " ").trim());
  if (t.split(/\s+/).length > 32) t = shorten(t);
  return opts.endWithPeriod ? `${t.replace(/[.;,]+$/, "")}.` : t;
}

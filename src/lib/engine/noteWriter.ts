import { COMMON_MISSPELLINGS, verbFromAny, verbFromBase } from "./verbs";
import { findTerms, indexText, joinList, sentenceCase, textHasTerm } from "./text";
import { noteToBullet } from "./rewrite";

/* Understands a note someone typed while answering "Do you have experience with X?" and writes it the way a
   CV reads.

     "After preparing finace report i had create managment report as well i have prepare 2 reports"
       accurate → "Prepared financial and management reports."
       stronger → "Prepared and analyzed financial and management reports, transforming financial data into
                   actionable insights to support management decision-making."

   It fixes spelling, splits the note into the separate things the person did, merges the ones about the same
   kind of work, and picks the verb a CV would use. The ACCURATE version only restates the note. The STRONGER
   version adds the usual purpose of that work — offered and labelled, never applied on its own.
   A note too ambiguous to parse safely falls back to the simpler, conservative writer in rewrite.ts. */

export interface NoteSuggestions {
  /** Only what the note says, written as a CV bullet ("" when the note is too vague to write up) */
  accurate: string;
  /** Adds the usual purpose of this kind of work — the user must confirm it's true */
  stronger?: string;
  /** The note doesn't say what was done; ask for a little more rather than invent it */
  needsMore?: boolean;
}

export interface NoteWriterOptions {
  /** The skill the user just confirmed — named in the bullet if the note doesn't already say it */
  keyword?: string;
  current: boolean;
  endWithPeriod: boolean;
}

// Typos common in quick notes that the general dictionary doesn't cover
const NOTE_TYPOS: Record<string, string> = {
  finace: "finance",
  finanace: "finance",
  finacial: "financial",
  financal: "financial",
  managment: "management",
  managemnt: "management",
  mangement: "management",
  mgmt: "management",
  reprot: "report",
  reprots: "reports",
  reoprt: "report",
  budjet: "budget",
  bugdet: "budget",
  forcast: "forecast",
  forcasting: "forecasting",
  reconcilation: "reconciliation",
  reconcilations: "reconciliations",
  analysys: "analysis",
  anaylsis: "analysis",
  invoce: "invoice",
  invoces: "invoices",
  recievable: "receivable",
  dashbord: "dashboard",
  dashbords: "dashboards",
  prepair: "prepare",
  prepaired: "prepared",
  prepard: "prepared",
  creat: "create",
  statment: "statement",
  statments: "statements",
};

/* A noun used as a modifier reads better as its adjective ("finance report" → "financial report") */
const MODIFIER_FORM: Record<string, string> = { finance: "financial", operation: "operational", strategy: "strategic" };

/* Verbs that say nothing on a CV — replaced by the verb that fits the work */
const WEAK = new Set(["do", "make", "create", "work", "handle", "help", "use", "get"]);

/* Base verbs that are rarely nouns: seeing one inside an object means the clause has a second action
   ("helped the team BUILD the budget") and is too tangled to merge safely */
const INNER_VERBS = new Set(["build", "prepare", "create", "analyze", "analyse", "develop", "reconcile", "manage", "improve", "reduce", "implement", "deliver", "coordinate", "organize", "automate", "calculate", "compile", "conduct", "draft", "write", "produce", "handle", "streamline", "prepared", "created", "built"]);

const TIME_WORDS = new Set(["daily", "weekly", "monthly", "quarterly", "annually", "yearly", "regularly", "every", "each", "per", "twice", "once"]);
const PRONOUNS = new Set(["it", "them", "this", "these", "those", "that"]);
const DETERMINERS = new Set(["the", "a", "an", "my", "our", "their", "his", "her", "some", "all"]);
const PREPOSITIONS = new Set(["for", "to", "with", "in", "on", "at", "by", "using", "from", "into", "via", "which", "who", "so"]);
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/* The verb a CV uses for each kind of output, a second verb that honestly goes with that work, and its usual purpose */
interface Kind {
  head: RegExp;
  verb: string;
  pairVerb?: string;
  purpose: (mods: string[]) => string;
}
const KINDS: Kind[] = [
  {
    head: /^(report|statement|pack|summary|presentation)$/,
    verb: "prepare",
    pairVerb: "analyze",
    purpose: (m) =>
      m.some((x) => /management|board|executive/.test(x))
        ? "transforming financial data into actionable insights to support management decision-making"
        : m.some((x) => /financial/.test(x))
          ? "giving stakeholders a clear, accurate view of financial performance"
          : "turning data into clear insights for decision-makers",
  },
  { head: /^(reconciliation)$/, verb: "prepare", purpose: () => "ensuring accurate, up-to-date balances ahead of month-end close" },
  { head: /^(account|ledger)$/, verb: "reconcile", purpose: () => "ensuring accurate, up-to-date balances ahead of month-end close" },
  { head: /^(invoice|payment|bill|payable|receivable)$/, verb: "process", purpose: () => "keeping payments accurate and on time" },
  { head: /^(budget|forecast)$/, verb: "prepare", pairVerb: "monitor", purpose: () => "helping leadership plan spending and track performance against targets" },
  { head: /^(dashboard|model|tracker|template|spreadsheet)$/, verb: "build", purpose: () => "giving the team faster, clearer visibility of key figures" },
  { head: /^(analysis|variance)$/, verb: "perform", purpose: () => "turning data into recommendations that informed decisions" },
  { head: /^(audit|control)$/, verb: "support", purpose: () => "strengthening accuracy and compliance" },
];

const singular = (w: string) => (/ies$/.test(w) ? w.slice(0, -3) + "y" : /(sses|xes|ches|shes)$/.test(w) ? w.slice(0, -2) : /(analysis|basis)$/.test(w) ? w : /[^s]s$/.test(w) ? w.slice(0, -1) : w);
const plural = (w: string) => (/(analysis)$/.test(w) ? w : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + "ies" : /(s|x|ch|sh)$/.test(w) ? w + "es" : w + "s");
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const tense = (base: string, current: boolean) => {
  const v = verbFromBase(base);
  return v ? (current ? v.base : v.past) : base;
};

function fixTypos(text: string): string {
  return text.replace(/[A-Za-z]+/g, (w) => {
    const lower = w.toLowerCase();
    return NOTE_TYPOS[lower] ?? COMMON_MISSPELLINGS[lower] ?? w;
  });
}

interface Activity {
  verbs: string[]; // base forms
  mods: string[]; // one modifier PHRASE per merged activity ("financial", "management", "power bi")
  head: string; // singular head noun
  many: boolean; // the note used a plural or a count
  count: number;
  tail: string; // "for the directors", "every week"
  det: string; // the article the note used before a single object ("a", "the"), kept so it reads naturally
}

/** Splits a note into merged "verb + object" activities, or null when it can't be read safely. */
function readActivities(note: string): Activity[] | null {
  const text = fixTypos(note)
    .toLowerCase()
    .replace(/[“”"'()]/g, " ")
    .replace(/\b(?:yes|yeah|yep|sure|ok(?:ay)?)\b[,.!]?/g, " ");
  const clauses = text
    .split(/[.;,]|\b(?:after|before|then|also|as well as|as well|plus|and then|and|while|besides)\b|\b(?:i|we)\s+(?:have|had|has|did|do|was|were|am|also|then|would|used to)?\b/)
    .map((c) => c.trim())
    .filter(Boolean);

  const groups: Activity[] = [];
  for (const clause of clauses) {
    const words = clause.split(/\s+/).filter((w) => w && !["have", "had", "has", "was", "were", "been", "is", "am", "are", "too", "just", "did", "do", "does", "used"].includes(w));
    const vi = words.findIndex((w) => !!verbFromAny(w.replace(/[^a-z]/g, "")));
    const objWords = vi >= 0 ? words.slice(vi + 1) : words;
    const verb = vi >= 0 ? verbFromAny(words[vi].replace(/[^a-z]/g, ""))!.base : null;
    // Anything before the verb other than filler means a subject or setup we don't understand
    if (vi > 1) return null;

    // "…and tracked it monthly": the pronoun is the previous object
    if (verb && objWords.length && PRONOUNS.has(objWords[0]) && groups.length) {
      const prev = groups[groups.length - 1];
      if (!prev.verbs.includes(verb)) prev.verbs.push(verb);
      const rest = objWords.slice(1).join(" ");
      if (rest) prev.tail = prev.tail ? `${prev.tail} ${rest}` : rest;
      continue;
    }

    const obj = parseObject(objWords);
    if (!obj) {
      if (verb) return null; // a verb with nothing we can read as its object
      continue;
    }
    if (!verb) {
      // "2 reports": continues the previous activity if it's the same kind of thing
      const prev = groups[groups.length - 1];
      if (!prev || prev.head !== obj.head) return null;
      prev.count = Math.max(prev.count, obj.count);
      prev.many ||= obj.many;
      if (obj.mod && !prev.mods.includes(obj.mod)) prev.mods.push(obj.mod);
      continue;
    }
    const same = groups.find((g) => g.head === obj.head);
    if (same) {
      if (!same.verbs.includes(verb)) same.verbs.push(verb);
      if (obj.mod && !same.mods.includes(obj.mod)) same.mods.push(obj.mod);
      same.count = Math.max(same.count, obj.count);
      same.many ||= obj.many;
      if (!same.tail && obj.tail) same.tail = obj.tail;
    } else groups.push({ verbs: [verb], mods: obj.mod ? [obj.mod] : [], head: obj.head, many: obj.many, count: obj.count, tail: obj.tail, det: obj.det });
  }
  return groups.length ? groups : null;
}

function parseObject(words: string[]): { mod: string; head: string; many: boolean; count: number; tail: string; det: string } | null {
  // The object ends at a preposition or a time expression ("for the directors", "every week", "monthly" at the end)
  let end = words.findIndex((w, i) => PREPOSITIONS.has(w) || (TIME_WORDS.has(w) && (i === words.length - 1 || ["every", "each", "per", "twice", "once"].includes(w))));
  if (end < 0) end = words.length;
  const det = words.slice(0, end).find((w) => ["a", "an", "the"].includes(w)) ?? "";
  // Articles are dropped from the object itself but kept in the tail ("for the marketing team")
  const core = words.slice(0, end).filter((w) => !DETERMINERS.has(w));
  const tail = words.slice(end).join(" ");
  let count = 0;
  const rest: string[] = [];
  for (const w of core) {
    if (/^\d+$/.test(w)) count = Number(w);
    else if (w in NUMBER_WORDS) count = NUMBER_WORDS[w];
    else rest.push(w);
  }
  if (!rest.length || rest.length > 4) return null;
  // A second action or a stray pronoun inside the object: too tangled to rewrite safely
  if (rest.some((w) => INNER_VERBS.has(w) || PRONOUNS.has(w))) return null;
  const last = rest[rest.length - 1];
  if (TIME_WORDS.has(last)) return null;
  const head = singular(last);
  const mod = rest
    .slice(0, -1)
    .map((m) => MODIFIER_FORM[m] ?? m)
    .join(" ");
  return { mod, head, many: last !== head || count > 1, count, tail, det };
}

function phrase(g: Activity, current: boolean, stronger: boolean): { text: string; kind?: Kind } {
  const kind = KINDS.find((k) => k.head.test(g.head));
  const strong = g.verbs.filter((v) => !WEAK.has(v));
  const madeIt = g.verbs.some((v) => WEAK.has(v));
  // "made a budget and tracked it": making it comes first (as the verb that fits the work), then the person's own verb
  const lead = madeIt && kind ? kind.verb : strong[0] && !(kind && strong[0] === "prepare" && kind.verb !== "prepare") ? strong[0] : kind?.verb ?? g.verbs[0];
  const verbs = [lead];
  const second = strong.find((v) => v !== lead);
  if (second) verbs.push(second);
  else if (stronger && kind?.pairVerb && kind.pairVerb !== lead) verbs.push(kind.pairVerb);

  const many = g.many || g.mods.length > 1;
  const count = g.count > 1 && g.count !== g.mods.length ? `${g.count} ` : "";
  const article = !many && !count && g.det ? `${g.det === "the" ? "the" : /^[aeiou]/.test(g.mods[0] ?? g.head) ? "an" : "a"} ` : "";
  const object = `${article}${count}${g.mods.length ? `${joinList(g.mods)} ` : ""}${many ? plural(g.head) : g.head}`;
  return { text: `${sentenceCase(joinList(verbs.map((v) => tense(v, current))))} ${object}${g.tail ? ` ${g.tail}` : ""}`, kind };
}

/** Tools in their proper spelling ("power bi" → "Power BI") */
function caseTools(t: string): string {
  let out = t;
  for (const { term, surface } of findTerms(indexText(out)).values()) {
    if (term.category !== "tool" || surface.toLowerCase() !== term.canonical.toLowerCase()) continue;
    const escaped = surface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), term.canonical);
  }
  return out;
}

function withKeyword(t: string, keyword?: string): string {
  const kw = keyword?.trim();
  if (!kw) return t;
  const lower = t.toLowerCase();
  const words = kw.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const stemHits = words.filter((w) => lower.includes(w.slice(0, Math.max(4, w.length - 3)))).length;
  if (textHasTerm(indexText(t), kw) || lower.includes(kw.toLowerCase()) || (words.length > 0 && stemHits >= Math.ceil(words.length / 2))) return t;
  return `${t}, supporting ${kw.toLowerCase()}`;
}

/** The accurate bullet and, where the kind of work is recognised, a stronger one with its usual purpose. */
export function noteSuggestions(note: string, opts: NoteWriterOptions): NoteSuggestions {
  function finish(t: string) {
    const s = sentenceCase(caseTools(t.replace(/\s+/g, " ").replace(/[.;,]+$/, "").trim()));
    return opts.endWithPeriod ? `${s}.` : s;
  }
  // Already a finished bullet (e.g. the suggestion the user just picked): leave its wording alone
  const trimmed = note.trim().replace(/\s+/g, " ");
  const firstWord = trimmed.split(" ")[0] ?? "";
  const finished =
    /^[A-Z]/.test(firstWord) && !!verbFromAny(firstWord.toLowerCase()) && !/\b(i|we|my|me)\b/i.test(trimmed) && fixTypos(trimmed) === trimmed && trimmed.split(" ").length >= 4;
  if (finished) return { accurate: finish(trimmed) };

  // A note that doesn't say what was done ("worked on it sometimes") can't become a bullet without inventing it
  const FILLER = new Set(["i", "we", "it", "them", "this", "that", "yes", "yeah", "sometimes", "often", "always", "some", "things", "stuff", "work", "worked", "did", "do", "done", "on", "with", "in", "of", "the", "a", "an", "and", "also", "have", "had", "was", "a", "lot", "bit", "few"]);
  const content = fixTypos(note).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !FILLER.has(w));
  if (content.length < 2) return { accurate: "", needsMore: true };

  const groups = readActivities(note);
  // "A and B" for two tasks, "A, B, and C" for more
  const joinTasks = (parts: string[]) => (parts.length === 1 ? parts[0] : parts.length === 2 ? `${parts[0]} and ${lowerFirst(parts[1])}` : `${parts.slice(0, -1).map((p, i) => (i ? lowerFirst(p) : p)).join(", ")}, and ${lowerFirst(parts[parts.length - 1])}`);

  let accurate: string;
  let lead: { text: string; kind?: Kind } | null = null;
  let others: string[] = [];
  if (groups) {
    const parts = groups.map((g) => phrase(g, opts.current, false).text);
    accurate = finish(withKeyword(joinTasks(parts), opts.keyword));
    lead = phrase(groups[0], opts.current, true);
    others = parts.slice(1);
  } else {
    // Couldn't be read as clean activities — the conservative writer keeps the person's own wording
    accurate = noteToBullet(note, { keyword: opts.keyword, current: opts.current, endWithPeriod: opts.endWithPeriod });
  }

  // Stronger version: only for work we recognise, and only by adding its purpose (never numbers or tools)
  let stronger: string | undefined;
  if (lead?.kind && groups) {
    stronger = finish(`${joinTasks([lead.text, ...others])}, ${lead.kind.purpose(groups[0].mods)}`);
  } else if (!groups) {
    const words = accurate.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/);
    const kind = KINDS.find((k) => words.some((w) => k.head.test(singular(w))));
    if (kind) {
      const base = accurate.replace(/[.;,]+$/, "");
      const firstVerb = verbFromAny(words[0] ?? "");
      // Pair a verb only onto the verb that naturally takes it ("Prepared" → "Prepared and analyzed"),
      // never onto something else ("Supported and monitored the team" would be wrong)
      const paired = kind.pairVerb && firstVerb?.base === kind.verb ? base.replace(/^\S+/, (v) => `${v} and ${tense(kind.pairVerb!, opts.current)}`) : base;
      stronger = finish(`${paired}, ${kind.purpose(words)}`);
    }
  }
  if (stronger === accurate) stronger = undefined;
  return { accurate, stronger };
}

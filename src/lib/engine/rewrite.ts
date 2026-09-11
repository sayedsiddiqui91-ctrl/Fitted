import { NOMINALIZATIONS, WEAK_OPENERS, verbFromAny, verbFromBase, verbFromGerund, verbFromPast } from "./verbs";
import { lookupTerm, sentenceCase } from "./text";

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

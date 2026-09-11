import { CLUSTERS, LEXICON, STOPWORDS, type LexTerm } from "./lexicon";

/* ───────── normalization ───────── */

/** Lowercase, keep characters that matter in skill names (+ # . / &), collapse spaces. */
export function norm(s: string): string {
  return ` ${s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9+#./&'\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/** Same as norm but preserves case (for case-sensitive abbreviations like AP / AR). */
function normCase(s: string): string {
  return ` ${s.replace(/[^A-Za-z0-9+#./&\- ]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const reCache = new Map<string, RegExp>();
function phraseRe(phrase: string, caseSensitive: boolean): RegExp {
  const key = `${caseSensitive ? "C" : "i"}:${phrase}`;
  let re = reCache.get(key);
  if (!re) {
    const p = caseSensitive ? phrase : phrase.toLowerCase();
    re = new RegExp(`(?:^|[^A-Za-z0-9])${escapeRe(p)}(?=$|[^A-Za-z0-9+#])`, caseSensitive ? "" : "");
    reCache.set(key, re);
  }
  return re;
}

export interface TextIndex {
  lower: string;
  cased: string;
}

export function indexText(s: string): TextIndex {
  return { lower: norm(s), cased: normCase(s) };
}

export function hasPhrase(idx: TextIndex, phrase: string): boolean {
  const p = phrase.trim();
  if (!p) return false;
  const caseSensitive = p.length <= 2 && p === p.toUpperCase();
  return caseSensitive ? phraseRe(p, true).test(idx.cased) : phraseRe(norm(p).trim(), false).test(idx.lower);
}

/* ───────── lexicon lookups ───────── */

const byCanonical = new Map<string, LexTerm>();
const byAlias = new Map<string, LexTerm>();
for (const t of LEXICON) {
  byCanonical.set(t.canonical.toLowerCase(), t);
  for (const a of t.aliases) if (!byAlias.has(a.toLowerCase())) byAlias.set(a.toLowerCase(), t);
}

export function lookupTerm(term: string): LexTerm | undefined {
  const k = term.trim().toLowerCase();
  return byCanonical.get(k) ?? byAlias.get(k);
}

/** Find all lexicon terms present in the text. Returns canonical → surface form found. */
export function findTerms(idx: TextIndex, filter?: (t: LexTerm) => boolean): Map<string, { term: LexTerm; surface: string }> {
  const out = new Map<string, { term: LexTerm; surface: string }>();
  for (const t of LEXICON) {
    if (filter && !filter(t)) continue;
    // longest aliases first so "Advanced Excel" wins over "Excel"
    const aliases = [...t.aliases].sort((a, b) => b.length - a.length);
    for (const a of aliases) {
      if (hasPhrase(idx, a)) {
        out.set(t.canonical, { term: t, surface: a });
        break;
      }
    }
  }
  return out;
}

/** Does the text contain this term (via canonical, aliases, or — for unknown terms — its phrase)? */
export function textHasTerm(idx: TextIndex, term: string): string | null {
  const lex = lookupTerm(term);
  const candidates = lex ? [...lex.aliases].sort((a, b) => b.length - a.length) : [term];
  for (const a of candidates) if (hasPhrase(idx, a)) return a;
  return null;
}

export function relatedTerms(canonical: string): string[] {
  const out = new Set<string>();
  for (const c of CLUSTERS) if (c.includes(canonical)) c.forEach((x) => x !== canonical && out.add(x));
  return [...out];
}

/* ───────── tokens & similarity ───────── */

export function stem(w: string): string {
  let s = w.toLowerCase();
  if (s.length <= 4) return s;
  for (const suf of ["ational", "ization", "isation", "ations", "ation", "ments", "ment", "ities", "ity", "ings", "ing", "ies", "ers", "ed", "es", "er", "ly", "al", "s"]) {
    if (s.endsWith(suf) && s.length - suf.length >= 3) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  return s;
}

export function contentTokens(s: string): string[] {
  return norm(s)
    .split(" ")
    .map((w) => w.replace(/^[^a-z0-9+#]+|[^a-z0-9+#]+$/g, ""))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export function stemSet(s: string): Set<string> {
  return new Set(contentTokens(s).map(stem));
}

/** Overlap coefficient between two texts' stemmed content words. */
export function similarity(a: string, b: string): number {
  const A = stemSet(a);
  const B = stemSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.min(A.size, B.size) * 0.6 + (inter / (A.size + B.size - inter)) * 0.4;
}

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export function sentenceCase(s: string): string {
  const t = s.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

export function lowerFirst(s: string): string {
  if (!s) return s;
  // keep acronyms / proper nouns (two leading capitals) intact
  if (/^[A-Z]{2}/.test(s)) return s;
  return s[0].toLowerCase() + s.slice(1);
}

export function joinList(items: string[], conj = "and"): string {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs.join("");
  if (xs.length === 2) return `${xs[0]} ${conj} ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")} ${conj} ${xs[xs.length - 1]}`;
}

export function uniqueBy<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Numbers / metrics in text (used by the truthfulness guard). */
export function extractNumbers(s: string): string[] {
  return (s.match(/\$?\d[\d,.]*\s?(%|k|m|bn|million|billion|x)?\+?/gi) ?? []).map((n) => n.replace(/[,\s]/g, "").toLowerCase());
}

import { extractNumbers, findTerms, indexText, textHasTerm } from "./text";

/* "Optimize, don't fabricate."
   Every proposed text change is checked against what the user actually
   wrote (plus anything they explicitly confirmed). New numbers or new
   skills that don't exist in the source are flagged and blocked. */

export interface GuardResult {
  ok: boolean;
  problems: string[];
}

export function guardText(after: string, sourceCorpus: string): GuardResult {
  const problems: string[] = [];
  const src = indexText(sourceCorpus);
  const srcNumbers = new Set(extractNumbers(sourceCorpus).map(numKey));

  for (const n of extractNumbers(after)) {
    if (!srcNumbers.has(numKey(n))) problems.push(`Adds the number “${n}”, which isn't in your CV`);
  }
  for (const [canonical, { term, surface }] of findTerms(indexText(after))) {
    if (term.category === "soft") continue;
    if (!textHasTerm(src, canonical) && !textHasTerm(src, surface)) problems.push(`Mentions “${canonical}”, which your CV doesn't show`);
  }
  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}

function numKey(n: string) {
  return n.replace(/[$+]/g, "").replace(/\.0+$/, "");
}

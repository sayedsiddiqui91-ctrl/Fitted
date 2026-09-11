/* Action verbs: base:past[:gerund]. Gerund is derived when not given. */
const RAW = `achieve:achieved accelerate:accelerated administer:administered advise:advised align:aligned allocate:allocated analyze:analyzed analyse:analysed architect:architected assess:assessed audit:audited automate:automated balance:balanced build:built:building calculate:calculated champion:championed coach:coached collaborate:collaborated compile:compiled complete:completed conduct:conducted consolidate:consolidated coordinate:coordinated create:created cut:cut:cutting decrease:decreased define:defined deliver:delivered design:designed develop:developed direct:directed document:documented draft:drafted drive:drove eliminate:eliminated enable:enabled engineer:engineered establish:established evaluate:evaluated execute:executed expand:expanded facilitate:facilitated forecast:forecasted generate:generated grow:grew guide:guided handle:handled identify:identified implement:implemented improve:improved increase:increased initiate:initiated introduce:introduced investigate:investigated launch:launched lead:led maintain:maintained manage:managed map:mapped:mapping measure:measured mentor:mentored migrate:migrated model:modeled monitor:monitored negotiate:negotiated onboard:onboarded operate:operated optimize:optimized organize:organized oversee:oversaw own:owned partner:partnered perform:performed pilot:piloted plan:planned:planning prepare:prepared present:presented prioritize:prioritized process:processed produce:produced program:programmed:programming propose:proposed prototype:prototyped provide:provided publish:published recommend:recommended reconcile:reconciled record:recorded recruit:recruited redesign:redesigned reduce:reduced refine:refined report:reported research:researched resolve:resolved restructure:restructured review:reviewed run:ran:running save:saved schedule:scheduled secure:secured serve:served set:set:setting ship:shipped:shipping simplify:simplified solve:solved spearhead:spearheaded standardize:standardized streamline:streamlined strengthen:strengthened supervise:supervised support:supported survey:surveyed test:tested track:tracked train:trained transform:transformed translate:translated troubleshoot:troubleshot update:updated upgrade:upgraded use:used validate:validated verify:verified write:wrote:writing answer:answered assist:assisted help:helped work:worked prepare:prepared post:posted file:filed book:booked enter:entered issue:issued collect:collected contribute:contributed contact:contacted respond:responded sell:sold teach:taught make:made:making`;

export interface VerbForms {
  base: string;
  past: string;
  gerund: string;
  third: string;
}

function gerundOf(base: string): string {
  if (base.endsWith("ie")) return base.slice(0, -2) + "ying";
  if (base.endsWith("e") && !base.endsWith("ee")) return base.slice(0, -1) + "ing";
  return base + "ing";
}
function thirdOf(base: string): string {
  if (/(s|sh|ch|x|z|o)$/.test(base)) return base + "es";
  if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + "ies";
  return base + "s";
}

export const VERBS: VerbForms[] = RAW.split(/\s+/)
  .filter(Boolean)
  .map((e) => {
    const [base, past, ger] = e.split(":");
    return { base, past, gerund: ger ?? gerundOf(base), third: thirdOf(base) };
  });

const byGerund = new Map(VERBS.map((v) => [v.gerund, v]));
const byBase = new Map(VERBS.map((v) => [v.base, v]));
const byPast = new Map(VERBS.map((v) => [v.past, v]));

export const verbFromGerund = (w: string) => byGerund.get(w.toLowerCase());
export const verbFromBase = (w: string) => byBase.get(w.toLowerCase());
export const verbFromPast = (w: string) => byPast.get(w.toLowerCase());
export const verbFromAny = (w: string) => {
  const k = w.toLowerCase();
  return byGerund.get(k) ?? byPast.get(k) ?? byBase.get(k) ?? VERBS.find((v) => v.third === k);
};

/** Strong, specific action verbs (past tense) — used by the review to recognize good bullets. */
export const STRONG_VERBS = new Set(
  VERBS.map((v) => v.past).filter((p) => !["helped", "worked", "assisted", "used", "handled", "answered", "made", "entered"].includes(p)),
);
for (const v of VERBS) if (STRONG_VERBS.has(v.past)) STRONG_VERBS.add(v.base);

/** Weak openers → how to rewrite them. */
export const WEAK_OPENERS: { re: RegExp; label: string; replacement: string | null }[] = [
  { re: /^(?:i\s+)?(?:was|am|were)?\s*responsible\s+for\s+(?:the\s+)?/i, label: "Responsible for", replacement: null },
  { re: /^(?:my\s+)?(?:duties|responsibilities)\s+(?:included|include|were|involved)\s*:?\s*/i, label: "Duties included", replacement: null },
  { re: /^(?:i\s+)?(?:was\s+)?tasked\s+with\s+/i, label: "Tasked with", replacement: null },
  { re: /^(?:i\s+)?(?:was\s+)?in\s+charge\s+of\s+/i, label: "In charge of", replacement: "Led" },
  { re: /^(?:i\s+)?(?:was\s+)?(?:involved|participated)\s+in\s+/i, label: "Involved in", replacement: "Contributed to" },
  { re: /^(?:i\s+)?(?:helped|assisted)\s+(?:with|in)\s+/i, label: "Helped with", replacement: "Supported" },
  { re: /^(?:i\s+)?worked\s+on\s+/i, label: "Worked on", replacement: "Contributed to" },
  { re: /^(?:i\s+)?worked\s+(?:closely\s+)?with\s+/i, label: "Worked with", replacement: "Collaborated with" },
  { re: /^(?:i\s+)?(?:utili[sz]ed)\s+/i, label: "Utilized", replacement: "Used" },
  { re: /^(?:i\s+)?(?:did|do)\s+/i, label: "Did", replacement: "Completed" },
  { re: /^(?:i\s+)?(?:dealt\s+with)\s+/i, label: "Dealt with", replacement: "Handled" },
];

export const WEAK_PHRASE_RE = /^(?:i\s+)?(?:(?:was|am|were)\s+)?(?:responsible for|duties included|tasked with|in charge of|involved in|participated in|helped|assisted|worked on|utili[sz]ed|dealt with)\b/i;

/** Nominalizations that can be turned into a direct verb: "the preparation of X" → "Prepared X" */
export const NOMINALIZATIONS: Record<string, string> = {
  preparation: "prepare",
  management: "manage",
  analysis: "analyze",
  reconciliation: "reconcile",
  coordination: "coordinate",
  development: "develop",
  administration: "administer",
  implementation: "implement",
  creation: "create",
  maintenance: "maintain",
  processing: "process",
  review: "review",
  planning: "plan",
  organization: "organize",
  delivery: "deliver",
  monitoring: "monitor",
  tracking: "track",
  design: "design",
  production: "produce",
  execution: "execute",
  supervision: "supervise",
  evaluation: "evaluate",
};

export const BUZZWORDS = [
  "hardworking",
  "hard-working",
  "team player",
  "results-driven",
  "results driven",
  "go-getter",
  "self-starter",
  "motivated",
  "passionate",
  "dynamic",
  "synergy",
  "think outside the box",
  "detail-oriented",
  "proven track record",
  "dedicated",
  "strategic thinker",
  "best of breed",
  "rockstar",
  "ninja",
];

export const COMMON_MISSPELLINGS: Record<string, string> = {
  managment: "management",
  recieve: "receive",
  recieved: "received",
  acheive: "achieve",
  acheived: "achieved",
  responsable: "responsible",
  seperate: "separate",
  occured: "occurred",
  succesful: "successful",
  successfull: "successful",
  exellent: "excellent",
  experiance: "experience",
  enviroment: "environment",
  analysed_: "analysed",
  buisness: "business",
  comunication: "communication",
  developement: "development",
  knowlege: "knowledge",
  liase: "liaise",
  maintainance: "maintenance",
  proffesional: "professional",
  profesional: "professional",
  refered: "referred",
  relevent: "relevant",
  shedule: "schedule",
  suport: "support",
  teh: "the",
  untill: "until",
  wich: "which",
  accomodate: "accommodate",
  adress: "address",
  calender: "calendar",
  collegue: "colleague",
  definately: "definitely",
  independant: "independent",
  occassion: "occasion",
  persue: "pursue",
  reciept: "receipt",
  truely: "truly",
  finacial: "financial",
  accouting: "accounting",
  reconcilation: "reconciliation",
};

// More typos seen in real CVs (merged, so an existing key is never duplicated)
Object.assign(COMMON_MISSPELLINGS, {
  porcessing: "processing",
  proccessing: "processing",
  financila: "financial",
  anaylis: "analysis",
  anaylsis: "analysis",
  analysys: "analysis",
  analyis: "analysis",
  managemnt: "management",
  experiance: "experience",
  responsibilites: "responsibilities",
  coordiantion: "coordination",
  stakholder: "stakeholder",
  stakeholdr: "stakeholder",
  comunication: "communication",
  enviroment: "environment",
  documention: "documentation",
});

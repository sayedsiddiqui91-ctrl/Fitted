import type { CVContent } from "@/lib/cv/schema";
import { parseResumeText } from "./parseResume";

/* ATS read-back test (pure part): given the text a basic ATS would read from the CV's layout, parse it the way
   such a system does and compare the result with what the user actually wrote. This is a real test of the file's
   layout — not a guarantee for any specific employer's ATS. */

export type ReadStatus = "ok" | "partial" | "missed";
export interface ReadCheck {
  label: string;
  status: ReadStatus;
  detail: string;
}
export interface ReadBackResult {
  /** The raw text as a basic ATS reads it */
  text: string;
  checks: ReadCheck[];
  ok: number;
  partial: number;
  total: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9@.+]+/g, " ").trim();
const tokens = (s: string) => new Set(norm(s).split(/\s+/).filter((t) => t.length > 1));
/** Share of the words we expected that were actually read */
const coverage = (want: string, got: string) => {
  const w = [...tokens(want)];
  if (!w.length) return 1;
  const g = tokens(got);
  return w.filter((t) => g.has(t)).length / w.length;
};
const year = (d: string) => d.match(/\d{4}/)?.[0] ?? "";
const digits = (s: string) => s.replace(/\D/g, "");

export function compareReadBack(original: CVContent, text: string): ReadBackResult {
  const parsed = parseResumeText(text).content;
  const checks: ReadCheck[] = [];
  const push = (label: string, status: ReadStatus, detail: string) => checks.push({ label, status, detail });
  const p = original.personal;
  const q = parsed.personal;

  if (p.fullName.trim())
    push("Name", norm(q.fullName) === norm(p.fullName) ? "ok" : coverage(p.fullName, q.fullName) >= 0.5 ? "partial" : "missed", q.fullName ? `Read as “${q.fullName}”` : "Not found");
  if (p.email.trim()) push("Email", q.email.toLowerCase() === p.email.trim().toLowerCase() ? "ok" : "missed", q.email ? `Read as “${q.email}”` : "Not found");
  if (p.phone.trim()) {
    const want = digits(p.phone);
    push("Phone", digits(q.phone) === want ? "ok" : digits(text).includes(want) ? "partial" : "missed", q.phone ? `Read as “${q.phone}”` : digits(text).includes(want) ? "In the text, but not recognized as a phone number" : "Not found");
  }
  if (p.linkedin.trim()) {
    const slug = p.linkedin.split("/").filter(Boolean).pop() ?? p.linkedin;
    push("LinkedIn", q.linkedin.includes(slug) ? "ok" : "missed", q.linkedin ? `Read as “${q.linkedin}”` : "Not found");
  }

  // Main sections recognized
  const sections: [string, boolean, boolean][] = [
    ["summary", !!original.summary.trim(), !!parsed.summary.trim()],
    ["experience", original.experience.length > 0, parsed.experience.length > 0],
    ["education", original.education.length > 0, parsed.education.length > 0],
    ["skills", original.skills.length > 0, parsed.skills.length > 0],
  ];
  const want = sections.filter(([, has]) => has);
  const missing = want.filter(([, , got]) => !got).map(([n]) => n);
  if (want.length) push("Section headings", !missing.length ? "ok" : missing.length < want.length ? "partial" : "missed", !missing.length ? `All ${want.length} main sections recognized` : `Not recognized: ${missing.join(", ")}`);

  // Each job: title + company (+ start date)
  for (const e of original.experience) {
    const label = [e.role, e.company].filter(Boolean).join(" · ") || "A position";
    const best = parsed.experience.map((x) => ({ x, cov: coverage(`${e.role} ${e.company}`, `${x.role} ${x.company} ${x.location}`) })).sort((a, b) => b.cov - a.cov)[0];
    const dateOk = !year(e.startDate) || (!!best && year(best.x.startDate) === year(e.startDate));
    const status: ReadStatus = best && best.cov >= 0.8 && dateOk ? "ok" : best && best.cov >= 0.5 ? "partial" : "missed";
    push(
      `Job: ${label}`,
      status,
      status === "ok"
        ? `Title, company${year(e.startDate) ? " and dates" : ""} read correctly`
        : best && best.cov >= 0.5
          ? `Read as “${[best.x.role, best.x.company].filter(Boolean).join(" · ")}”${dateOk ? "" : " — dates didn't match"}`
          : "Not read as a job",
    );
  }

  // Each education entry
  for (const ed of original.education) {
    const label = ed.degree || ed.school || "An education entry";
    const best = parsed.education.map((x) => ({ x, cov: coverage(`${ed.degree} ${ed.school}`, `${x.degree} ${x.field} ${x.school} ${x.location}`) })).sort((a, b) => b.cov - a.cov)[0];
    const status: ReadStatus = best && best.cov >= 0.75 ? "ok" : best && best.cov >= 0.4 ? "partial" : "missed";
    push(`Education: ${label}`, status, status === "ok" ? "Read correctly" : best && best.cov >= 0.4 ? `Read as “${[best.x.degree, best.x.school].filter(Boolean).join(" · ")}”` : "Not read as education");
  }

  // Skills: found as skills, or at least present in the text keyword search sees
  if (original.skills.length) {
    const parsedNames = new Set(parsed.skills.map((s) => norm(s.name)));
    const low = ` ${norm(text)} `;
    const hit = original.skills.filter((s) => parsedNames.has(norm(s.name)) || low.includes(` ${norm(s.name)} `)).length;
    const r = hit / original.skills.length;
    push("Skills", r >= 0.9 ? "ok" : r >= 0.6 ? "partial" : "missed", `${hit} of ${original.skills.length} skills found`);
  }

  const ok = checks.filter((c) => c.status === "ok").length;
  const partial = checks.filter((c) => c.status === "partial").length;
  return { text, checks, ok, partial, total: checks.length };
}

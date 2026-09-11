const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Parse loose CV date strings ("Mar 2022", "03/2022", "2022", "March 2022") → {year, month(0-11)}. */
export function parseLooseDate(s: string): { year: number; month: number } | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (/present|current|now|today/.test(t)) {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  }
  const yearMatch = t.match(/(19|20)\d{2}/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[0]);
  let month = 0;
  const mName = MONTHS.findIndex((m) => t.includes(m));
  if (mName >= 0) month = mName;
  else {
    const num = t.match(/\b(0?[1-9]|1[0-2])\s*[/.-]\s*(19|20)\d{2}/);
    if (num) month = Number(num[1]) - 1;
  }
  return { year, month };
}

export function monthsBetween(start: string, end: string, current: boolean): number {
  const a = parseLooseDate(start);
  const b = current ? parseLooseDate("present") : parseLooseDate(end);
  if (!a || !b) return 0;
  return Math.max(0, (b.year - a.year) * 12 + (b.month - a.month) + 1);
}

export function formatRange(start: string, end: string, current = false): string {
  const s = start.trim();
  const e = current ? "Present" : end.trim();
  if (s && e) return `${s} – ${e}`;
  return s || e;
}

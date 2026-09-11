import type { CVContent } from "@/lib/cv/schema";

/* Personal/contact details (address, phone, email, links) belong in the CV header only.
   These helpers keep them out of generated text and stop an address being used as a job title. */

export const ROLE_WORD =
  /\b(analyst|manager|engineer|developer|specialist|assistant|coordinator|consultant|officer|executive|associate|intern|internship|director|designer|accountant|administrator|clerk|representative|technician|teacher|nurse|scientist|architect|advis[oe]r|supervisor|agent|editor|writer|marketer|strategist|controller|auditor|bookkeeper|student|graduate|lead|head of|researcher|founder|owner|partner|trainee|professional|tutor|lecturer|programmer|officer)\b/i;

const ADDRESS_WORD =
  /(\b|-)(block|blk|road|rd\.?|street|st\.|avenue|ave\.?|lane|ln\.?|house|flat|apt\.?|apartment|suite|floor|sector|r\/a|residential area|district|village|po box|p\.?o\.?|zip|postcode|post code|nagar|colony|thana|upazila|division|state|province|county|building|bldg|plot|holding)\b/i;

const COUNTRY =
  /\b(bangladesh|india|pakistan|sri lanka|nepal|united states|usa|u\.s\.a?\.?|united kingdom|uk|england|scotland|wales|ireland|canada|australia|new zealand|germany|france|spain|italy|netherlands|belgium|sweden|norway|denmark|finland|poland|portugal|switzerland|austria|uae|united arab emirates|saudi arabia|qatar|kuwait|oman|bahrain|egypt|nigeria|kenya|south africa|ghana|singapore|malaysia|indonesia|philippines|vietnam|thailand|china|japan|korea|hong kong|taiwan|brazil|mexico|argentina|chile|colombia|turkey)\s*\.?$/i;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const PHONE = /\+?\d[\d\s().-]{7,}\d/;
const URL = /(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|io|dev|me|net|org|co|app|ai)(?:\/\S*)?\b/i;

/** True for strings that read like a postal address or place ("G-block, Bashundhara R/A, Dhaka, Bangladesh"). */
export function looksLikeAddress(s: string): boolean {
  const t = s.trim().replace(/[.;]+$/, "");
  if (!t || t.length > 160) return false;
  const parts = t.split(/\s*,\s*/).filter(Boolean);
  if (ADDRESS_WORD.test(t) && (parts.length >= 2 || /\d/.test(t))) return true;
  if (COUNTRY.test(t) && parts.length >= 2) return true;
  if (parts.length >= 2 && /\b\d{4,6}\b/.test(t) && !ROLE_WORD.test(t)) return true; // postal code
  // "Austin, TX" / "Leeds, West Yorkshire, UK": ends in a state/region code
  if (parts.length >= 2 && /^[A-Z]{2,3}$/.test(parts[parts.length - 1]) && !ROLE_WORD.test(t)) return true;
  return false;
}

/** True for strings that can serve as a professional title (not an address, contact or sentence). */
export function looksLikeTitle(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 70 || t.split(/\s+/).length > 10) return false;
  if (looksLikeAddress(t) || EMAIL.test(t) || PHONE.test(t) || URL.test(t)) return false;
  if (/\d{3,}/.test(t) || /[.!?]$/.test(t)) return false;
  // Section headings ("PROFESSION SUMMARY", "Curriculum Vitae") are not job titles
  if (/\b(summary|profile|objective|overview|curriculum vitae|resum[eé]|cv|experience|education|skills|references|contact)\b/i.test(t)) return false;
  return /[A-Za-z]/.test(t);
}

/** The opener for a generated summary: the headline if it's a real title, else the latest role, else education. */
export function summaryLead(content: CVContent): string {
  const h = content.personal.headline.trim();
  if (looksLikeTitle(h)) return h;
  const role = content.experience.map((e) => e.role.trim()).find(looksLikeTitle);
  if (role) return role;
  const ed = content.education[0];
  if (ed) return `${ed.degree || "Graduate"}${ed.field ? ` in ${ed.field}` : ""}`;
  return "Professional";
}

/** Personal details that must never be written into the summary, bullets or skills. */
export function contactTerms(content: CVContent): string[] {
  const p = content.personal;
  const out = new Set<string>();
  const add = (s: string) => {
    const t = s.trim().replace(/[.;]+$/, "");
    if (t.length > 3) out.add(t);
  };
  for (const v of [p.email, p.phone, p.website, p.linkedin]) if (v) add(v);
  const places = [p.location, looksLikeAddress(p.headline) ? p.headline : ""].filter(Boolean);
  for (const place of places) {
    add(place);
    // Address fragments ("Bashundhara R/A"), but not bare countries — those can legitimately appear in text
    for (const part of place.split(/\s*,\s*/)) if (!COUNTRY.test(part) && part.length > 3) add(part);
  }
  return [...out];
}

/** Returns the contact detail or address fragment that `after` adds (and `before` didn't have), if any. */
export function addedContactDetail(after: string, before: string, content: CVContent): string | null {
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
  const a = n(after);
  const b = n(before);
  const term = contactTerms(content).find((t) => a.includes(n(t)) && !b.includes(n(t)));
  if (term) return term;
  if (EMAIL.test(after) && !EMAIL.test(before)) return after.match(EMAIL)![0];
  const addr = after.split(/(?<=[.;])\s+/).find((sentence) => looksLikeAddress(sentence.split(/\s+with\s+|\s+—\s+/)[0]) && !b.includes(n(sentence)));
  return addr ? addr.split(/\s+with\s+/)[0].trim() : null;
}

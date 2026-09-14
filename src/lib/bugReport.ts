import { z } from "zod";

/* "Report a bug" — the shape of a report and the Google Form submission it becomes.
   Reports land in the owner's Google Sheet through a Google Form linked to it: the form
   accepts anonymous responses, so nothing needs a key, a login or an Apps Script deployment.
   Pure (no server imports) so validation and the field mapping can be unit-tested. */

export const BUG_FEATURES = [
  "Building or editing a CV",
  "Importing a PDF or DOCX",
  "Job Optimizer",
  "Edit PDF",
  "Downloading (PDF / DOCX)",
  "Templates or design",
  "Job Tracker",
  "Landing page",
  "Something else",
] as const;

export const BugReportSchema = z.object({
  name: z.string().trim().max(80).optional().default(""),
  feature: z.enum(BUG_FEATURES),
  comment: z.string().trim().min(10, "Please describe what happened (at least 10 characters).").max(2000),
  page: z.string().trim().max(300).optional().default(""),
  // Honeypot: real users never see this field, so anything in it is a bot
  website: z.string().max(200).optional().default(""),
});
export type BugReport = z.infer<typeof BugReportSchema>;

/* The Google Form "Fitted-CV report bug" (owner's account), linked to the sheet.
   The form is public by design (anyone can submit a Google Form), so these ids are not secrets.
   BUG_FORM_ID overrides the form; the entry ids come from the form's viewform page. */
export const BUG_FORM_ID = "1FAIpQLScQYTDcBlon71gmq9ZvySRAPP73C0qUs3fbb0xbGCsacTMIlA";
export const BUG_FORM_FIELDS = {
  name: "entry.1272082836",
  feature: "entry.2106943712",
  comment: "entry.1158669682",
  page: "entry.438300345",
  browser: "entry.731575719",
  time: "entry.1409947225",
} as const;

export function bugFormUrl(formId = BUG_FORM_ID): string {
  return `https://docs.google.com/forms/d/e/${formId}/formResponse`;
}

/** The form fields for one report, in the sheet's column order: Name · Feature · Comment · Page · Browser · Time */
export function toFormBody(r: BugReport, meta: { browser: string; time: Date }): URLSearchParams {
  const body = new URLSearchParams();
  body.set(BUG_FORM_FIELDS.name, r.name);
  body.set(BUG_FORM_FIELDS.feature, r.feature);
  body.set(BUG_FORM_FIELDS.comment, r.comment);
  body.set(BUG_FORM_FIELDS.page, r.page);
  body.set(BUG_FORM_FIELDS.browser, meta.browser.slice(0, 300));
  body.set(BUG_FORM_FIELDS.time, meta.time.toISOString());
  return body;
}

/** A one-line, human-readable browser/OS from a user-agent string (the full UA is noise in a sheet). */
export function describeBrowser(ua: string | null): string {
  if (!ua) return "";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  const inApp = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|LinkedInApp/.test(ua) ? " (in-app browser)" : "";
  return [browser, os].filter(Boolean).join(" · ") + inApp || ua.slice(0, 80);
}

import { z } from "zod";

/* "Report a bug" — the shape of a report and the row it becomes in the owner's Google Sheet.
   Pure (no server imports) so the validation and the row layout can be unit-tested. */

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

/** Column order of the sheet: Name · Feature with problem · Comment · Page · Browser · Time */
export function toSheetRow(r: BugReport, meta: { browser: string; time: Date }): string[] {
  return [r.name, r.feature, r.comment, r.page, meta.browser.slice(0, 300), meta.time.toISOString()];
}

/** A one-line, human-readable browser/OS from a user-agent string (the full UA is noise in a sheet). */
export function describeBrowser(ua: string | null): string {
  if (!ua) return "";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  const inApp = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|LinkedInApp/.test(ua) ? " (in-app browser)" : "";
  return [browser, os].filter(Boolean).join(" · ") + inApp || ua.slice(0, 80);
}

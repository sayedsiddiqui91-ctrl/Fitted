import { BugReportSchema, describeBrowser, toSheetRow } from "@/lib/bugReport";
import { clientKey, rateLimit } from "@/lib/server/rateLimit";

/* Forwards a bug report to the owner's Google Sheet through its Apps Script web app.
   The script URL is server-side only (FITTED_BUG_SHEET_URL), so visitors can't post to the
   sheet directly; this route validates and rate-limits on their behalf. */
export const runtime = "nodejs";
export const maxDuration = 30;

const THANKS = "Thanks — your report has been sent.";

export async function POST(req: Request) {
  const url = process.env.FITTED_BUG_SHEET_URL;
  if (!url) return Response.json({ error: "Bug reports aren't set up on this site yet." }, { status: 503 });
  if (!rateLimit(`bug:${clientKey(req)}`, 5, 10 * 60_000)) return Response.json({ error: "You've sent a few reports already. Please wait a few minutes and try again." }, { status: 429 });

  const raw = await req.text();
  if (raw.length > 10_000) return Response.json({ error: "That report is too long." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = BugReportSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  // Bots fill the hidden field; pretend it worked so they stop trying
  if (parsed.data.website) return Response.json({ ok: true, message: THANKS });

  const row = toSheetRow(parsed.data, { browser: describeBrowser(req.headers.get("user-agent")), time: new Date() });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // text/plain avoids a CORS preflight that Apps Script can't answer
      body: JSON.stringify({ row }),
      redirect: "follow", // Apps Script answers a POST with a redirect to the result
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`sheet responded ${res.status}`);
    return Response.json({ ok: true, message: THANKS });
  } catch (err) {
    console.error("[bug] forwarding to sheet failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "We couldn't send your report right now. Please try again in a moment." }, { status: 502 });
  }
}

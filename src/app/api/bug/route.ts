import { BugReportSchema, bugFormUrl, describeBrowser, toFormBody } from "@/lib/bugReport";
import { clientKey, rateLimit } from "@/lib/server/rateLimit";

/* Forwards a bug report to the owner's Google Sheet by submitting the Google Form linked to it.
   This route validates and rate-limits on the visitor's behalf, and adds the browser and time. */
export const runtime = "nodejs";
export const maxDuration = 30;

const THANKS = "Thanks — your report has been sent.";

export async function POST(req: Request) {
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

  const form = toFormBody(parsed.data, { browser: describeBrowser(req.headers.get("user-agent")), time: new Date() });
  try {
    const res = await fetch(bugFormUrl(process.env.BUG_FORM_ID), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`form responded ${res.status}`);
    return Response.json({ ok: true, message: THANKS });
  } catch (err) {
    console.error("[bug] submitting to the form failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "We couldn't send your report right now. Please try again in a moment." }, { status: 502 });
  }
}

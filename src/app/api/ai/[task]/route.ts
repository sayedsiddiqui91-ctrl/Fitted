import { z } from "zod";
import { CVContentSchema, DesignSchema, LayoutSchema } from "@/lib/cv/schema";
import { JobAnalysisSchema } from "@/lib/ai/types";
import {
  analyzeJobDescription,
  assistantChat,
  claudeEnabled,
  generateInterviewQuestions,
  generateOptimizationSuggestions,
  parseResumeWithClaude,
  reviewCVWithClaude,
} from "@/lib/ai/server/claude";
import { clientKey, rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_BODY = 400_000;
const JobText = z.string().min(1).max(40_000);
const MatchSchema = z.object({ keywords: z.object({ have: z.array(z.any()), canAdd: z.array(z.any()), doNotAdd: z.array(z.any()) }) }).passthrough();

const schemas = {
  "analyze-job": z.object({ text: JobText }),
  optimize: z.object({ content: CVContentSchema, layout: LayoutSchema, design: DesignSchema, job: JobAnalysisSchema, match: MatchSchema, mode: z.enum(["conservative", "balanced", "aggressive"]), jobText: z.string().max(40_000) }),
  review: z.object({ content: CVContentSchema, design: DesignSchema, pages: z.number().int().min(1).max(20) }),
  interview: z.object({ content: CVContentSchema, job: JobAnalysisSchema, jobText: z.string().max(40_000) }).passthrough(),
  chat: z.object({
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) })).min(1).max(20),
    content: CVContentSchema,
    selection: z.object({ scope: z.enum(["global", "section", "entry", "bullet"]), section: z.string().optional(), itemId: z.string().optional(), bulletId: z.string().optional(), label: z.string().optional() }),
    job: z.object({ title: z.string(), company: z.string(), analysis: z.record(z.string(), z.any()), match: z.any().nullable() }).nullable(),
    template: z.string().max(40),
  }),
  parse: z.object({ text: z.string().min(20).max(80_000) }),
} as const;
type Task = keyof typeof schemas;

export async function POST(req: Request, ctx: { params: Promise<{ task: string }> }) {
  const { task } = await ctx.params;
  if (!(task in schemas)) return Response.json({ error: "Unknown task." }, { status: 404 });
  if (!claudeEnabled()) return Response.json({ error: "Enhanced AI is not configured." }, { status: 503 });
  if (!rateLimit(`ai:${clientKey(req)}`, 40, 10 * 60_000)) return Response.json({ error: "You're going a bit fast. Please wait a minute and try again." }, { status: 429 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "That's too much text to process at once." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schemas[task as Task].safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  try {
    const p = parsed.data as Record<string, unknown>;
    let result: unknown;
    switch (task as Task) {
      case "analyze-job":
        result = await analyzeJobDescription(p.text as string);
        break;
      case "optimize":
        result = await generateOptimizationSuggestions(parsed.data as Parameters<typeof generateOptimizationSuggestions>[0]);
        break;
      case "review": {
        const d = parsed.data as z.infer<(typeof schemas)["review"]>;
        result = await reviewCVWithClaude(d.content, d.design, d.pages);
        break;
      }
      case "interview": {
        const d = parsed.data as z.infer<(typeof schemas)["interview"]>;
        result = await generateInterviewQuestions(d.content, d.job, d.jobText);
        break;
      }
      case "chat": {
        const d = parsed.data as z.infer<(typeof schemas)["chat"]>;
        result = await assistantChat(d.history, d.content, d.selection, d.job as Parameters<typeof assistantChat>[3], d.template);
        break;
      }
      case "parse":
        result = await parseResumeWithClaude(p.text as string);
        break;
    }
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Never leak provider errors or stack traces to users; the client falls back to the on-device engine.
    return Response.json({ error: "The AI service is unavailable right now." }, { status: 502 });
  }
}

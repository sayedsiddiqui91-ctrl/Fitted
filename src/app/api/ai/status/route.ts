import { claudeEnabled, claudeModel } from "@/lib/ai/server/claude";

export const dynamic = "force-dynamic";

export function GET() {
  const enabled = claudeEnabled();
  return Response.json({ claude: enabled, model: enabled ? claudeModel() : null });
}

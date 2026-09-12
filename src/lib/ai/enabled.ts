/* Decides whether the paid Claude engine may run. Pure (takes the environment as an argument)
   so it can be unit-tested; `claude.ts` is server-only and can't be imported by tests.

   A key on its own is deliberately NOT enough in production: an API key left in a hosting
   dashboard would bill the site owner for every visitor's request. Fitted is free, so a
   deployed build must also opt in with FITTED_ENABLE_CLAUDE=1. Locally (npm run dev) a key
   is enough, so the owner can test with their own key. */
export interface AIEnv {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_AUTH_TOKEN?: string;
  FITTED_ENABLE_CLAUDE?: string;
  FITTED_DISABLE_CLAUDE?: string;
  NODE_ENV?: string;
}

export function claudeAllowed(env: AIEnv): boolean {
  if (env.FITTED_DISABLE_CLAUDE === "1") return false;
  if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) return false;
  return env.NODE_ENV !== "production" || env.FITTED_ENABLE_CLAUDE === "1";
}

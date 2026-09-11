/** Public site URL, used for SEO (sitemap, robots, social previews).
    Order: NEXT_PUBLIC_SITE_URL → Vercel's production domain (follows a renamed or custom domain
    automatically) → the current Vercel URL. */
const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || fromVercel || "https://fitted-eight.vercel.app").replace(/\/$/, "");

export const SITE_NAME = "Fitted";
export const SITE_TAGLINE = "Build a better CV. Tailored to every job.";
export const SITE_DESCRIPTION =
  "Create your CV from scratch, import your old one, or optimize it for any job description — completely free. ATS-friendly templates, honest AI suggestions, PDF export.";

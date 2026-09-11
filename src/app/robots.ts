import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Public marketing pages are indexable; the app itself (private, local-first) and the API are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/app/", "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

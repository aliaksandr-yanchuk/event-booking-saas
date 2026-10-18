export const SITE_NAME = "Seatline";

/**
 * Absolute URL of the deployment, for canonical links, Open Graph and the sitemap.
 * SITE_URL wins when set; on Vercel, the production domain is provided automatically.
 */
export function siteUrl(): URL {
  if (process.env.SITE_URL) {
    return new URL(process.env.SITE_URL);
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  return new URL("http://localhost:3000");
}

export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl()).toString();
}

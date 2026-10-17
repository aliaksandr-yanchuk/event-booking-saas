export const SITE_NAME = "Seatline";

/** Absolute URL of the deployment, for canonical links, Open Graph and the sitemap. */
export function siteUrl(): URL {
  return new URL(process.env.SITE_URL ?? "http://localhost:3000");
}

export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl()).toString();
}

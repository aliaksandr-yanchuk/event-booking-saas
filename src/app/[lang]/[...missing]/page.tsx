import { notFound } from "next/navigation";

// Any other path inside a language: the localized 404 page (app/[lang]/not-found.tsx),
// with the site's layout, instead of Next.js's bare default.
export default function MissingPage() {
  notFound();
}

import type { Metadata } from "next";
import { getDictionary } from "@/i18n";

// No auth check here: a layout does not re-render on navigation. Each page checks.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return {
    title: { default: t.dashboard.metaTitle, template: `%s · ${t.dashboard.metaTitle}` },
    robots: { index: false, follow: false },
  };
}

export default function DashboardLayout({ children }: LayoutProps<"/[lang]/dashboard">) {
  return children;
}

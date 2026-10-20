import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { getDictionary } from "@/i18n";
import { localizePath } from "@/i18n/config";

export default async function NotFound() {
  const { locale, t } = await getDictionary();
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">{t.notFound.title}</h1>
      <p className="text-muted">{t.notFound.text}</p>
      <Link href={localizePath(locale, "/")} className={buttonClasses("secondary")}>
        {t.notFound.home}
      </Link>
    </div>
  );
}

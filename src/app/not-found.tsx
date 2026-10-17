import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted">The organizer, event or booking you are looking for does not exist.</p>
      <Link href="/" className={buttonClasses("secondary")}>
        Go to the home page
      </Link>
    </div>
  );
}

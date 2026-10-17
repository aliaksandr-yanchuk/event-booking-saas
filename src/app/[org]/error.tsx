"use client";

import { useEffect } from "react";
import { buttonClasses } from "@/components/ui/button";

// Catches rendering errors below /[org], so a failing event page keeps the
// site header and offers a retry instead of a blank screen.
export default function OrganizationError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted">We could not load this page. Please try again in a moment.</p>
      <button type="button" onClick={() => retry()} className={buttonClasses("secondary")}>
        Try again
      </button>
    </div>
  );
}

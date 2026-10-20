"use client";

import { useActionState } from "react";
import type { CancelFormState } from "@/app/[org]/bookings/[reference]/actions";
import { buttonClasses } from "@/components/ui/button";

/** One-click cancel from the signed email link (the link replaces typing the email). */
export function ManageCancelForm({ action }: { action: (state: CancelFormState) => Promise<CancelFormState> }) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.message && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {state.message}
        </p>
      )}
      <div>
        <button type="submit" className={buttonClasses("danger")} disabled={pending}>
          {pending ? "Cancelling…" : "Cancel booking"}
        </button>
      </div>
    </form>
  );
}

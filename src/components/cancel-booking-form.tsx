"use client";

import { useActionState } from "react";
import type { CancelFormState } from "@/app/[org]/bookings/[reference]/actions";
import { buttonClasses } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { submitWithoutReset } from "@/lib/submit-without-reset";

type CancelBookingFormProps = {
  action: (state: CancelFormState, formData: FormData) => Promise<CancelFormState>;
};

export function CancelBookingForm({ action }: CancelBookingFormProps) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });

  return (
    // Keeps the typed email when the action returns an error.
    <form action={formAction} onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-4" noValidate>
      <TextField
        label="Email used for the booking"
        name="customerEmail"
        type="email"
        autoComplete="email"
        error={state.status === "error" ? state.message : undefined}
        required
      />
      <div>
        <button type="submit" className={buttonClasses("danger")} disabled={pending}>
          {pending ? "Cancelling…" : "Cancel booking"}
        </button>
      </div>
    </form>
  );
}

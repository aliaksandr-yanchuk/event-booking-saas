"use client";

import { Fragment, useActionState } from "react";
import type { DemoInboxState } from "@/app/[org]/bookings/[reference]/actions";
import { buttonClasses } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { submitWithoutReset } from "@/lib/submit-without-reset";

type DemoInboxProps = {
  action: (state: DemoInboxState, formData: FormData) => Promise<DemoInboxState>;
};

/** Shows the emails of this booking on a demo without an email provider. */
export function DemoInbox({ action }: DemoInboxProps) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-3" noValidate>
        <TextField
          label="Your email address"
          name="email"
          type="email"
          autoComplete="email"
          error={state.status === "error" ? state.message : undefined}
          required
        />
        <div>
          <button type="submit" className={buttonClasses("secondary")} disabled={pending}>
            {pending ? "Opening…" : state.status === "open" ? "Refresh inbox" : "Open inbox"}
          </button>
        </div>
      </form>

      {state.status === "open" &&
        (state.messages.length === 0 ? (
          <p className="text-sm text-muted">No emails yet. They are sent a moment after each change.</p>
        ) : (
          <ol className="flex flex-col gap-3" aria-label="Emails for this booking">
            {state.messages.map((message) => (
              <li key={message.id} className="rounded-xl border border-border bg-surface p-4">
                <article aria-label={message.subject}>
                  <h3 className="font-medium">{message.subject}</h3>
                  <p className="mt-2 text-sm break-words whitespace-pre-line">{linkify(message.text)}</p>
                </article>
              </li>
            ))}
          </ol>
        ))}
    </div>
  );
}

/** Turns the URLs in an email's text into links, the way a mail client does. */
function linkify(text: string) {
  return text.split(/(https?:\/\/\S+)/).map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a key={index} href={part} className="text-accent underline">
        {part}
      </a>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

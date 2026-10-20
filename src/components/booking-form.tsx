"use client";

import { useActionState, useState } from "react";
import type { BookingFormState } from "@/app/[lang]/[org]/events/[event]/actions";
import { buttonClasses } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { useLiveTakenSeats } from "@/components/use-live-taken-seats";
import { fill, plural, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatMoney, formatPrice } from "@/lib/money";
import { groupSeatsByRow } from "@/lib/seats";
import { submitWithoutReset } from "@/lib/submit-without-reset";
import type { SeatMap } from "@/server/repositories/events";

export type BookingFormText = { form: Dictionary["bookingForm"]; seats: Dictionary["seats"]; free: string };

type BookingFormProps = {
  action: (state: BookingFormState, formData: FormData) => Promise<BookingFormState>;
  locale: Locale;
  t: BookingFormText;
  sections: SeatMap;
  currency: string;
  maxSeats: number;
  idempotencyKey: string;
  // Public API URL of this event, polled to keep the seat map current.
  availabilityUrl: string;
};

const initialState: BookingFormState = { status: "idle" };

export function BookingForm({
  action,
  locale,
  t,
  sections,
  currency,
  maxSeats,
  idempotencyKey,
  availabilityUrl,
}: BookingFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [lostNotice, setLostNotice] = useState<string | null>(null);
  const liveTaken = useLiveTakenSeats(availabilityUrl);

  // Once polled, the live map replaces the server-rendered one, so seats released by a
  // cancellation become free again. Seats a failed submit reported as taken count too.
  const takenNow = new Set(state.takenSeatIds ?? []);
  const isTaken = (seat: { id: string; taken: boolean }) =>
    (liveTaken ? liveTaken.has(seat.id) : seat.taken) || takenNow.has(seat.id);

  const money = (amountMinor: number) => formatMoney(amountMinor, currency, locale);
  const label = (seat: { section: { name: string }; row: string; number: number }) =>
    fill(t.seats.label, { section: seat.section.name, row: seat.row, number: seat.number });

  const seatsById = new Map(
    sections.flatMap((section) => section.seats.map((seat) => [seat.id, { ...seat, section }] as const)),
  );

  // Someone else booked a seat this visitor had selected: drop it from the selection and
  // say so, instead of letting the submit fail. Adjusting state during render (rather than
  // in an effect) is React's pattern for reacting to new data without an extra paint.
  const lost = liveTaken ? [...selected].filter((id) => liveTaken.has(id)) : [];
  if (lost.length > 0) {
    setSelected((current) => new Set([...current].filter((id) => !liveTaken!.has(id))));
    const labels = lost.flatMap((id) => {
      const seat = seatsById.get(id);
      return seat ? [label(seat)] : [];
    });
    setLostNotice(
      labels.length === 1
        ? fill(t.form.lostOne, { seat: labels[0] })
        : fill(t.form.lostMany, { seats: labels.join(", ") }),
    );
  }
  const selectedSeats = [...selected].flatMap((id) => {
    const seat = seatsById.get(id);
    return seat && !isTaken(seat) ? [seat] : [];
  });
  const total = selectedSeats.reduce((sum, seat) => sum + seat.section.priceMinor, 0);
  const limitReached = selectedSeats.length >= maxSeats;

  function toggle(seatId: string) {
    setLostNotice(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(seatId)) {
        next.delete(seatId);
      } else {
        next.add(seatId);
      }
      return next;
    });
  }

  const seatError = state.fieldErrors?.seatIds;

  // Paid seats are held and the customer goes on to pay; free seats are booked at once.
  function submitLabel() {
    if (pending) return total > 0 ? t.form.holding : t.form.booking;
    if (selectedSeats.length === 0) return t.form.bookSeats;
    const seats = plural(t.seats.count, selectedSeats.length);
    return total > 0 ? fill(t.form.continueToPayment, { seats, total: money(total) }) : fill(t.form.book, { seats });
  }

  return (
    // Without the reset guard, a failed submit would uncheck the seat checkboxes
    // while `selected` still holds them, and the next submit would send no seats.
    <form action={formAction} onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-8" noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <fieldset
        // Fieldsets default to min-inline-size: min-content, so without min-w-0 a wide
        // seat row stretches the whole page on phones instead of scrolling inside its box.
        className="flex min-w-0 flex-col gap-6"
        aria-describedby={seatError ? "seat-error" : "seat-hint"}
      >
        <legend className="mb-2 text-xl font-semibold">{t.form.chooseSeats}</legend>
        <p id="seat-hint" className="text-sm text-muted">
          {fill(t.form.hint, { max: maxSeats })}
        </p>

        {sections.map((section) => (
          <div key={section.id} className="flex flex-col gap-3">
            <h3 className="font-medium">
              {section.name}{" "}
              <span className="text-muted">
                · {formatPrice(section.priceMinor, currency, { locale, free: t.free })}
              </span>
            </h3>
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-max flex-col gap-1.5">
                {groupSeatsByRow(section.seats).map(({ row, seats }) => (
                  <div key={row} className="flex items-center gap-1.5">
                    <span className="w-6 text-center text-xs text-muted" aria-hidden="true">
                      {row}
                    </span>
                    {seats.map((seat) => {
                      const taken = isTaken(seat);
                      const checked = selected.has(seat.id) && !taken;
                      return (
                        // Native checkboxes: keyboard, screen reader and no-JS submission work for free.
                        <label key={seat.id} className="relative">
                          <input
                            type="checkbox"
                            name="seatIds"
                            value={seat.id}
                            checked={checked}
                            disabled={taken || (limitReached && !checked)}
                            onChange={() => toggle(seat.id)}
                            aria-label={
                              fill(t.seats.ariaLabel, { section: section.name, row, number: seat.number }) +
                              (taken ? t.seats.ariaTaken : "")
                            }
                            className="peer sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className="flex size-8 cursor-pointer items-center justify-center rounded-md border border-border bg-seat-free text-xs transition-colors select-none peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed peer-disabled:border-transparent peer-disabled:bg-seat-taken peer-disabled:text-muted"
                          >
                            {seat.number}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {seatError && (
          <p id="seat-error" className="text-sm text-danger">
            {seatError}
          </p>
        )}
      </fieldset>

      <section
        aria-labelledby="summary-heading"
        className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5"
      >
        <h3 id="summary-heading" className="font-medium">
          {t.form.yourSelection}
        </h3>
        {/* Always rendered, so screen readers announce the notice when it appears. */}
        <p role="status" className="text-sm text-danger empty:hidden">
          {lostNotice}
        </p>
        {selectedSeats.length === 0 ? (
          <p className="text-sm text-muted">{t.form.noSeats}</p>
        ) : (
          <ul className="text-sm" aria-live="polite">
            {selectedSeats.map((seat) => (
              <li key={seat.id} className="flex justify-between gap-4">
                <span>{label(seat)}</span>
                <span>{money(seat.section.priceMinor)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="flex justify-between border-t border-border pt-2 font-medium">
          <span>{t.form.total}</span>
          <span data-testid="booking-total">{money(total)}</span>
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t.form.fullName}
          name="customerName"
          autoComplete="name"
          // Only used without JavaScript, when the page re-renders after a submit.
          defaultValue={state.values?.customerName}
          error={state.fieldErrors?.customerName}
          required
        />
        <TextField
          label={t.form.email}
          name="customerEmail"
          type="email"
          autoComplete="email"
          hint={t.form.emailHint}
          defaultValue={state.values?.customerEmail}
          error={state.fieldErrors?.customerEmail}
          required
        />
      </div>

      {state.message && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {state.message}
        </p>
      )}

      <div>
        <button type="submit" className={buttonClasses("primary", "w-full sm:w-auto")} disabled={pending}>
          {submitLabel()}
        </button>
      </div>
    </form>
  );
}

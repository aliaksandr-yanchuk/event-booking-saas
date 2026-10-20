"use client";

import { useActionState, useState } from "react";
import type { BookingFormState } from "@/app/[org]/events/[event]/actions";
import { buttonClasses } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { formatMoney } from "@/lib/money";
import { groupSeatsByRow } from "@/lib/seats";
import { submitWithoutReset } from "@/lib/submit-without-reset";
import type { SeatMap } from "@/server/repositories/events";

type BookingFormProps = {
  action: (state: BookingFormState, formData: FormData) => Promise<BookingFormState>;
  sections: SeatMap;
  currency: string;
  maxSeats: number;
  idempotencyKey: string;
};

const initialState: BookingFormState = { status: "idle" };

export function BookingForm({ action, sections, currency, maxSeats, idempotencyKey }: BookingFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // Seats lost to another customer since the page loaded count as taken too.
  const takenNow = new Set(state.takenSeatIds ?? []);
  const isTaken = (seat: { id: string; taken: boolean }) => seat.taken || takenNow.has(seat.id);

  const seatsById = new Map(
    sections.flatMap((section) => section.seats.map((seat) => [seat.id, { ...seat, section }] as const)),
  );
  const selectedSeats = [...selected].flatMap((id) => {
    const seat = seatsById.get(id);
    return seat && !isTaken(seat) ? [seat] : [];
  });
  const total = selectedSeats.reduce((sum, seat) => sum + seat.section.priceMinor, 0);
  const limitReached = selectedSeats.length >= maxSeats;

  function toggle(seatId: string) {
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
        <legend className="mb-2 text-xl font-semibold">Choose your seats</legend>
        <p id="seat-hint" className="text-sm text-muted">
          Up to {maxSeats} seats per booking. Grey seats are already taken.
        </p>

        {sections.map((section) => (
          <div key={section.id} className="flex flex-col gap-3">
            <h3 className="font-medium">
              {section.name} <span className="text-muted">· {formatMoney(section.priceMinor, currency)}</span>
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
                            aria-label={`${section.name}, row ${row}, seat ${seat.number}${taken ? ", taken" : ""}`}
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
          Your selection
        </h3>
        {selectedSeats.length === 0 ? (
          <p className="text-sm text-muted">No seats selected yet.</p>
        ) : (
          <ul className="text-sm" aria-live="polite">
            {selectedSeats.map((seat) => (
              <li key={seat.id} className="flex justify-between gap-4">
                <span>
                  {seat.section.name} · Row {seat.row} · Seat {seat.number}
                </span>
                <span>{formatMoney(seat.section.priceMinor, currency)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="flex justify-between border-t border-border pt-2 font-medium">
          <span>Total</span>
          <span data-testid="booking-total">{formatMoney(total, currency)}</span>
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Full name"
          name="customerName"
          autoComplete="name"
          // Only used without JavaScript, when the page re-renders after a submit.
          defaultValue={state.values?.customerName}
          error={state.fieldErrors?.customerName}
          required
        />
        <TextField
          label="Email"
          name="customerEmail"
          type="email"
          autoComplete="email"
          hint="Needed to manage or cancel your booking."
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
          {pending
            ? "Booking…"
            : selectedSeats.length > 0
              ? `Book ${selectedSeats.length} ${selectedSeats.length === 1 ? "seat" : "seats"} · ${formatMoney(total, currency)}`
              : "Book seats"}
        </button>
      </div>
    </form>
  );
}

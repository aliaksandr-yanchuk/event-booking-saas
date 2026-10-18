import { z } from "zod";

/**
 * Shape of the booking form. The same schema validates on the server
 * (the source of truth) and drives the error messages shown in the form.
 */
export const bookingInputSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(80, "Use 80 characters or fewer."),
  customerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address, like name@example.com.")),
  seatIds: z
    .array(z.string().min(1))
    .min(1, "Choose at least one seat.")
    // The per-event limit is checked again in the booking service; this cap only
    // stops oversized payloads before they reach the database.
    .max(20, "Too many seats selected.")
    .refine((ids) => new Set(ids).size === ids.length, "Each seat can be chosen only once."),
});

export type BookingInput = z.infer<typeof bookingInputSchema>;

export type BookingFieldErrors = Partial<Record<keyof BookingInput, string>>;

export function parseBookingForm(formData: FormData) {
  return parseBookingInput({
    customerName: formData.get("customerName") ?? "",
    customerEmail: formData.get("customerEmail") ?? "",
    seatIds: formData.getAll("seatIds").map(String),
  });
}

/** Validates booking input from any source (form or JSON API) into one message per field. */
export function parseBookingInput(input: unknown) {
  const result = bookingInputSchema.safeParse(input);

  if (result.success) {
    return { success: true as const, data: result.data };
  }

  const fieldErrors: BookingFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof BookingInput | undefined;
    if (field && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return { success: false as const, fieldErrors };
}

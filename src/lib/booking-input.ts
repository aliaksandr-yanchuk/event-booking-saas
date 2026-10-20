import { z } from "zod";
import { en, type Dictionary } from "@/i18n/dictionaries/en";

type ValidationMessages = Dictionary["validation"];

/**
 * Shape of the booking form. The same schema validates on the server (the source of
 * truth) and produces the error messages shown in the form, in the page's language.
 * The API always uses English messages.
 */
export function bookingInputSchemaWith(messages: ValidationMessages) {
  return z.object({
    customerName: z.string().trim().min(1, messages.nameRequired).max(80, messages.nameTooLong),
    customerEmail: z
      .string()
      // Trimmed before the email check, so " aiko@example.com " is accepted. The meta
      // documents the format in OpenAPI, where only the pre-pipe input side is shown.
      .meta({ format: "email" })
      .trim()
      .toLowerCase()
      .pipe(z.email(messages.emailInvalid)),
    seatIds: z
      .array(z.string().min(1))
      .min(1, messages.seatsRequired)
      // The per-event limit is checked again in the booking service; this cap only
      // stops oversized payloads before they reach the database.
      .max(20, messages.seatsTooMany)
      .refine((ids) => new Set(ids).size === ids.length, messages.seatsDuplicate),
  });
}

/** The English schema: the API contract (OpenAPI) and the API's error messages. */
export const bookingInputSchema = bookingInputSchemaWith(en.validation);

export type BookingInput = z.infer<typeof bookingInputSchema>;

export type BookingFieldErrors = Partial<Record<keyof BookingInput, string>>;

export function parseBookingForm(formData: FormData, messages: ValidationMessages = en.validation) {
  return parseBookingInput(
    {
      customerName: formData.get("customerName") ?? "",
      customerEmail: formData.get("customerEmail") ?? "",
      seatIds: formData.getAll("seatIds").map(String),
    },
    messages,
  );
}

/** Validates booking input from any source (form or JSON API) into one message per field. */
export function parseBookingInput(input: unknown, messages: ValidationMessages = en.validation) {
  const schema = messages === en.validation ? bookingInputSchema : bookingInputSchemaWith(messages);
  const result = schema.safeParse(input);

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

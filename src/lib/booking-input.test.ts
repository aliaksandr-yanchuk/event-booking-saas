import { parseBookingForm } from "./booking-input";

function formData(fields: { customerName?: string; customerEmail?: string; seatIds?: string[] }) {
  const data = new FormData();
  if (fields.customerName !== undefined) data.set("customerName", fields.customerName);
  if (fields.customerEmail !== undefined) data.set("customerEmail", fields.customerEmail);
  for (const id of fields.seatIds ?? []) data.append("seatIds", id);
  return data;
}

describe("parseBookingForm", () => {
  it("accepts a valid booking and normalizes the email", () => {
    const result = parseBookingForm(
      formData({ customerName: "  Aiko Tanaka ", customerEmail: " Aiko@Example.COM ", seatIds: ["s1", "s2"] }),
    );

    expect(result).toEqual({
      success: true,
      data: { customerName: "Aiko Tanaka", customerEmail: "aiko@example.com", seatIds: ["s1", "s2"] },
    });
  });

  it("returns one message per invalid field", () => {
    const result = parseBookingForm(formData({ customerName: "   ", customerEmail: "not-an-email" }));

    expect(result).toEqual({
      success: false,
      fieldErrors: {
        customerName: "Enter your name.",
        customerEmail: "Enter a valid email address, like name@example.com.",
        seatIds: "Choose at least one seat.",
      },
    });
  });

  it("treats missing fields as empty instead of crashing", () => {
    const result = parseBookingForm(new FormData());
    expect(result.success).toBe(false);
  });

  it("rejects the same seat sent twice", () => {
    const result = parseBookingForm(
      formData({ customerName: "Aiko", customerEmail: "aiko@example.com", seatIds: ["s1", "s1"] }),
    );

    expect(result).toEqual({ success: false, fieldErrors: { seatIds: "Each seat can be chosen only once." } });
  });

  it("rejects names longer than 80 characters", () => {
    const result = parseBookingForm(
      formData({ customerName: "a".repeat(81), customerEmail: "aiko@example.com", seatIds: ["s1"] }),
    );

    expect(result).toEqual({ success: false, fieldErrors: { customerName: "Use 80 characters or fewer." } });
  });
});

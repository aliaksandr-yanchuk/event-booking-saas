import { renderEmail, type EmailData } from "./templates";

const data: EmailData = {
  customerName: 'Aiko <script>alert("x")</script>',
  reference: "7KQM-4XPA",
  eventTitle: "Midnight Jazz Session",
  eventStartsAt: new Date("2026-10-28T10:00:00Z"),
  venue: "Harbor Hall, Yokohama",
  seatLabels: ["Floor · Row B · Seat 1"],
  totalMinor: 8000,
  currency: "JPY",
  refunded: false,
  bookingUrl: "https://seatline.example/harbor-hall/bookings/7KQM-4XPA",
  manageUrl: "https://seatline.example/harbor-hall/bookings/7KQM-4XPA/manage?t=v1.1.x",
};

describe("renderEmail", () => {
  it("writes the confirmation with the details and both links", () => {
    const email = renderEmail("booking-confirmed", data);

    expect(email.subject).toBe("Your booking for Midnight Jazz Session (7KQM-4XPA)");
    expect(email.text).toContain("Floor · Row B · Seat 1");
    expect(email.text).toContain("Total: ¥8,000");
    expect(email.text).toContain(`Manage or cancel your booking: ${data.manageUrl}`);
  });

  it("escapes the customer's name in the HTML version", () => {
    const { html } = renderEmail("booking-confirmed", data);

    expect(html).not.toContain("<script>");
    expect(html).toContain("Aiko &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("mentions the refund when a paid booking is cancelled", () => {
    expect(renderEmail("booking-cancelled", { ...data, refunded: true }).text).toContain("refunded in full");
    expect(renderEmail("booking-cancelled", data).text).not.toContain("refunded");
  });
});

/**
 * @jest-environment node
 */
import { createResendSender } from "./sender";

const message = { to: "aiko@example.com", subject: "Hi", text: "Hello", html: "<p>Hello</p>" };

describe("Resend sender", () => {
  it("posts the message with the API key and the idempotency key", async () => {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    const sender = createResendSender("re_test", "Seatline <tickets@seatline.example>", fetchMock);

    await sender.send(message, { idempotencyKey: "email-msg_1" });

    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer re_test",
        "Content-Type": "application/json",
        "Idempotency-Key": "email-msg_1",
      },
      body: JSON.stringify({
        from: "Seatline <tickets@seatline.example>",
        to: ["aiko@example.com"],
        subject: "Hi",
        text: "Hello",
        html: "<p>Hello</p>",
      }),
    });
  });

  it("fails on an error answer, so the outbox tries again later", async () => {
    const fetchMock = jest.fn(async () => new Response("rate limited", { status: 429 }));
    const sender = createResendSender("re_test", "tickets@seatline.example", fetchMock);

    await expect(sender.send(message, { idempotencyKey: "k" })).rejects.toThrow("Resend answered 429: rate limited");
  });
});

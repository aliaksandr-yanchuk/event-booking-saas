# Decision log

Short records of the decisions that shaped this project: the context, what was decided,
and what it costs. Newest last. The README explains how things work; this file explains
why they work that way and what was rejected.

## 1. Double booking is prevented by a database constraint (2026-10-17)

**Context.** Two visitors can submit the same seat at the same moment. An "is it free?"
check in application code has a race window between the check and the insert.

**Decision.** `booking_seats.seat_id` is `UNIQUE`. The service still checks first, for a
friendly error, but correctness rests on the constraint: the second insert fails and its
transaction rolls back. Cancelling deletes the rows, which releases the seats.

**Rejected.** `SELECT … FOR UPDATE` row locks or advisory locks: correct, but every new
code path has to remember to take them. A constraint cannot be forgotten.

**Consequences.** Proven by an integration test with 10 concurrent requests. Booking
history needs its own copy of the seat labels (`bookings.seatLabels`), because the
`booking_seats` rows disappear on cancellation.

## 2. Tenant isolation lives in the repositories (2026-10-17)

**Context.** Every organizer's data shares one database. A query that finds an event by
slug alone would leak across tenants.

**Decision.** Every repository read takes an `organizationId`; slugs are unique per
tenant (`@@unique([organizationId, slug])`), and seat IDs are always resolved within
their event. `AGENTS.md` makes this a rule for every change.

**Rejected.** PostgreSQL row-level security: stronger, but it needs a per-request session
variable, which fights connection pooling on serverless.

## 3. Forms are Server Actions that also work without JavaScript (2026-10-17)

**Decision.** Seats are native checkboxes styled as tiles; the form posts to a Server
Action, and `useActionState` enhances it when JavaScript is available. The organizer
and event are bound with `.bind()`, which Next.js encrypts, so a client cannot redirect a
booking to another tenant's event.

**Consequences.** React resets a form after its action; `submitWithoutReset` prevents
that, because the reset unchecked seats that were still listed as selected (a bug the
tests found).

## 4. Cache what changes rarely, never cache the seat map (2026-10-17)

**Decision.** Cache Components: event details are cached for minutes, the "seats left"
count for seconds and invalidated by tag after each booking. The seat map is read per
request. Every page prerenders a static shell, and `next build` needs no database.

## 5. One service layer, two entry points (2026-10-18)

**Decision.** The pages (Server Components and Actions) and the REST API call the same
service and repository functions. Booking rules exist only in the service.

**Rejected.** Pages that call the REST API over HTTP: an extra network hop and a second
serialization for no gain inside one deployment.

## 6. The API contract is defined once, in Zod (2026-10-18)

**Decision.** Request and response bodies are Zod schemas. They type the serializers at
compile time, generate the OpenAPI document, and validate real responses in the API
tests. Response schemas are strict, so an extra field (say, the customer's email) fails.

**Rejected.** Hand-written OpenAPI: it drifts from the code within weeks.

## 7. Errors follow RFC 9457, with 409 and 422 kept apart (2026-10-18)

**Decision.** Every error is Problem Details with a stable `code`. `400` means the body is
invalid, `409` a conflict with current state (seat taken), `422` a valid request that
breaks a rule (too many seats). Cancelling is `POST …/cancel`: it needs a body (the
email) and keeps the booking as `cancelled`.

## 8. Money in minor units, references from a CSPRNG (2026-10-17)

**Decision.** Prices are integers in the currency's minor unit, formatted with
`Intl.NumberFormat`. Booking references are 8 characters from a 31-letter alphabet
without look-alikes (no 0/O, 1/I/L), generated with `crypto.randomInt`. The email works as a second
factor for cancelling, so a leaked link alone cannot cancel a booking.

## 9. Tests at the level where the guarantee lives (2026-10-18)

**Decision.** Pure logic gets unit tests, database guarantees (constraints, races,
tenancy) integration tests against real PostgreSQL, user flows Playwright on desktop and
mobile. CI runs E2E against the production build, with no retries: a retry would find its
seats already booked, and it would hide flakiness.

## 10. Vercel and Neon for the demo, Docker for everything else (2026-10-18)

**Decision.** `vercel-build` runs `prisma migrate deploy` before `next build`; the app
uses Neon's pooled URL, migrations the direct one. A weekly workflow re-seeds the demo so
its events stay upcoming. The same code runs as a standalone Docker image.

## 11. Prettier with the existing line width (2026-10-20)

**Decision.** Prettier with `printWidth: 120`, which matches how the code was already
written, so adopting it changed little. The Tailwind plugin sorts class names. CI fails on
unformatted files.

## 12. A Content Security Policy without nonces (2026-10-20)

**Context.** Nonce-based CSP is the strictest option, but a nonce must differ per request,
so every page would have to be rendered per request.

**Decision.** A static CSP in `next.config.ts`: same-origin resources only, no plugins,
no `<base>` changes, no framing, forms only post to this site. `script-src` keeps
`'unsafe-inline'`, because Next.js inlines its payload in the prerendered shell.

**Rejected.** Nonces: they would turn off the static shells of Cache Components.
Experimental SRI: hashes only cover external scripts, not the inline payload.

**Consequences.** An E2E test fails on any CSP violation the browser reports. If the site
ever renders user-supplied HTML, the policy needs to become nonce-based.

## 13. Automated accessibility checks in E2E (2026-10-20)

**Decision.** axe-core scans every page type for WCAG 2.2 A/AA in light and dark mode.
The scan waits for CSS transitions, because right after switching the color scheme,
buttons are mid-fade and axe measured the halfway colors as low contrast.

**Consequences.** axe finds roughly a third of accessibility problems; keyboard and
screen reader behavior is still covered by the flow tests and by using native elements.

## 14. Idempotency keys are stored with the booking (2026-10-20)

**Context.** The seat constraint already stops a retry from booking twice, but the retry
fails with `SEATS_TAKEN`: the customer's own first attempt holds the seats.

**Decision.** `POST …/bookings` accepts `Idempotency-Key` (IETF draft). The key row is
inserted in the booking's transaction, with a hash of the request, keyed per tenant. A
retry with the same key and request returns the original `201`
(`Idempotent-Replayed: true`); the same key with another request gets `422`.

**Rejected.** The common "in progress, then completed" key table with a stored response:
it needs a lock timeout and cleanup after crashes. Writing the key with the booking means
either both exist or neither does.

**Consequences.** Only successful bookings are remembered; a failed request can be
retried as it is. The booking form uses the same mechanism with a key per page view.

## 15. Rate limits in PostgreSQL, fixed windows (2026-10-20)

**Decision.** A `rate_limits` table and one atomic `INSERT … ON CONFLICT DO UPDATE` per
check. Booking and cancelling are limited per client address; cancelling also per
booking, which stops guessing the email for a known reference.

**Rejected.** Redis (Upstash): another service and secret for a demo. Sliding windows:
more precise, but not one statement.

**Consequences.** Up to twice the limit can pass around a window boundary. The client
address comes from `X-Forwarded-For`, which Vercel overwrites; self-hosting needs a proxy
that does the same. E2E tests each use their own address, derived from the test ID.

## 16. The live seat map polls the API with ETags (2026-10-20)

**Decision.** The page polls the public event API every 5 seconds while visible. The API
returns `Cache-Control: no-cache` with an `ETag`, so the browser revalidates each poll and
unchanged data is an empty `304`.

**Rejected.** Server-Sent Events or WebSockets: on serverless hosting a stream keeps a
function running per visitor, and seat maps change rarely enough that 5 seconds is fine.

**Consequences.** Another visitor's booking shows up within about 5 seconds; the server
still has the final word at submit.

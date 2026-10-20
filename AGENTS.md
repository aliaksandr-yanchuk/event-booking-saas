<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules

### Data and tenancy

- Every read in `src/server/repositories` takes an `organizationId`. Never add a query
  that finds tenant-owned data by slug or ID alone.
- Seat availability is guaranteed by the UNIQUE constraint on `booking_seats.seat_id`.
  Do not replace it with an application-level check or a lock.
- Schema changes go through `npx prisma migrate dev --name <change>`; commit the migration.

### Payments

- Booking states change only in `src/server/booking-service.ts` and `src/server/payment-service.ts`.
  Every transition is an `UPDATE … WHERE status = <expected>`, so repeated reports of the
  same payment are no-ops. Never update a booking's status unconditionally.
- Held seats are protected by the same UNIQUE constraint as sold ones. Reads that decide
  whether a seat is free use `activeSeatWhere(now)` from `src/server/holds.ts`.
- Call the payment provider outside database transactions; refunds always pass an
  idempotency key.
- Tests use `createFakePayments()`; E2E runs against the demo checkout, never Stripe.

### Caching

- Cached reads live in `src/server/queries.ts` (`"use cache"` + `cacheLife` + `cacheTag`).
  Tag names come from `src/server/cache-tags.ts`.
- Anything that must reflect the latest bookings (seat map, booking page) is not cached.
- A Server Action that changes bookings calls `updateTag` for the affected tags.
- No page may touch the database during `next build`: read runtime data inside
  `<Suspense>`, after `await params` or `await connection()`.

### Forms

- Validate on the server with Zod; return typed field errors, never throw for user errors.
- Forms keep `action={dispatch}` (works without JavaScript) and use
  `submitWithoutReset` for `onSubmit`, so errors do not wipe user input.

### REST API (`src/app/api/v1`)

- Route handlers stay thin: parse and validate, call the same service or repository
  functions the pages use, and map typed results to status codes. No business rules here.
- Errors go through `problem()` (RFC 9457) with a stable `code`; never return ad-hoc error JSON.
- Every request and response body has a Zod schema in `src/server/api/schemas.ts`,
  registered in `requestSchemas` or `responseSchemas` (that is what puts it in OpenAPI).
  Response schemas use `z.strictObject`.
- Return responses with `jsonResponse(Schema, body)`, built by the serializers in
  `src/server/api/serializers.ts`; never return Prisma rows directly.
- A new endpoint needs its path in `src/server/api/openapi.ts` and an API test that
  parses the response with its schema. Breaking changes need a new version prefix.
- Route handlers cannot call `updateTag`; invalidate with `revalidateTag(tag, { expire: 0 })`.

### Verification

- Prove behavior with a test at the right level: pure logic → unit test,
  database guarantees → integration test, user flows → Playwright.
- Before finishing a change, run `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:integration` and, for UI changes, `npm run test:e2e`.
- Fix root causes. Do not add fallbacks that hide a failing query or a bad state.

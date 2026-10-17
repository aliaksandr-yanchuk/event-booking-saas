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

### Verification
- Prove behavior with a test at the right level: pure logic → unit test,
  database guarantees → integration test, user flows → Playwright.
- Before finishing a change, run `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:integration` and, for UI changes, `npm run test:e2e`.
- Fix root causes. Do not add fallbacks that hide a failing query or a bad state.

import type { Db } from "@/server/db";
import { clientAddress, consumeRateLimit, limitCancellation, rateLimits } from "@/server/rate-limit";
import { createTestDb, resetDatabase } from "../../test/integration/factories";

let db: Db;

beforeAll(() => {
  db = createTestDb();
});

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await db.$disconnect();
});

const rule = { limit: 3, windowMs: 60_000 };
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 20, 12, 0, seconds));

describe("consumeRateLimit", () => {
  it("allows hits up to the limit, then says how long to wait", async () => {
    const results = [];
    for (const second of [0, 10, 20, 30]) {
      results.push(await consumeRateLimit(db, "k", rule, at(second)));
    }

    expect(results).toEqual([
      { allowed: true },
      { allowed: true },
      { allowed: true },
      // The window started at 0 s and lasts 60 s.
      { allowed: false, retryAfterSeconds: 30 },
    ]);
  });

  it("starts a new window once the old one has ended", async () => {
    for (const second of [0, 1, 2, 3]) {
      await consumeRateLimit(db, "k", rule, at(second));
    }

    expect(await consumeRateLimit(db, "k", rule, at(59))).toMatchObject({ allowed: false });
    expect(await consumeRateLimit(db, "k", rule, at(60))).toEqual({ allowed: true });
    expect(await consumeRateLimit(db, "k", rule, at(61))).toEqual({ allowed: true });
  });

  it("counts keys separately", async () => {
    for (const second of [0, 1, 2, 3]) {
      await consumeRateLimit(db, "a", rule, at(second));
    }

    expect(await consumeRateLimit(db, "b", rule, at(4))).toEqual({ allowed: true });
  });

  it("is exact under concurrency: of 20 simultaneous hits, exactly the limit get through", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consumeRateLimit(db, "burst", { limit: 5, windowMs: 60_000 }, at(0))),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    const row = await db.rateLimit.findUniqueOrThrow({ where: { key: "burst" } });
    expect(row.count).toBe(20);
  });
});

describe("limitCancellation", () => {
  it("limits attempts per booking, whatever address they come from", async () => {
    const booking = { organizationId: "org_1", reference: "ABCD-EFGH" };
    const results = [];
    for (let i = 0; i <= rateLimits.cancelPerBooking.limit; i++) {
      results.push(await limitCancellation(new Headers({ "x-forwarded-for": `198.51.100.${i}` }), booking, db));
    }

    expect(results.slice(0, -1).every((result) => result.allowed)).toBe(true);
    expect(results.at(-1)).toMatchObject({ allowed: false });
  });
});

describe("clientAddress", () => {
  it("uses the first X-Forwarded-For entry, which the proxy added for the client", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientAddress(new Headers({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});

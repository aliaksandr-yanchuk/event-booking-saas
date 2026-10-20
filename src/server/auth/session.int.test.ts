import { createSession, deleteSession, findSessionUserId, SESSION_TTL_MS } from "@/server/auth/session";
import type { Db } from "@/server/db";
import { createTestDb, resetDatabase } from "../../../test/integration/factories";

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

const t0 = new Date("2026-10-20T03:00:00Z");

async function createUser() {
  return db.user.create({ data: { email: `u${Math.random()}@example.com`, name: "User", passwordHash: "x" } });
}

describe("sessions", () => {
  it("finds the user of a valid token until the session expires", async () => {
    const user = await createUser();
    const { token, expiresAt } = await createSession(db, user.id, t0);

    expect(expiresAt).toEqual(new Date(t0.getTime() + SESSION_TTL_MS));
    expect(await findSessionUserId(db, token, new Date(expiresAt.getTime() - 1))).toBe(user.id);
    expect(await findSessionUserId(db, token, expiresAt)).toBeNull();
    expect(await findSessionUserId(db, "not-a-token", t0)).toBeNull();
  });

  it("stores only a hash of the token", async () => {
    const user = await createUser();
    const { token } = await createSession(db, user.id, t0);

    const [stored] = await db.session.findMany();
    expect(stored.id).not.toContain(token);
    expect(stored.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ends a session for good when the user signs out", async () => {
    const user = await createUser();
    const first = await createSession(db, user.id, t0);
    const second = await createSession(db, user.id, t0);

    await deleteSession(db, first.token);

    expect(await findSessionUserId(db, first.token, t0)).toBeNull();
    // Other devices stay signed in.
    expect(await findSessionUserId(db, second.token, t0)).toBe(user.id);
  });

  it("clears the user's expired sessions when a new one starts", async () => {
    const user = await createUser();
    await createSession(db, user.id, t0);

    await createSession(db, user.id, new Date(t0.getTime() + SESSION_TTL_MS + 1));

    expect(await db.session.count()).toBe(1);
  });
});

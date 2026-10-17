import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;

export function createDb(connectionString: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// One client per process. In development, Next.js reloads modules on every
// change, so the client is kept on globalThis to avoid exhausting connections.
const globalForDb = globalThis as unknown as { db?: Db };

function getDb(): Db {
  if (!globalForDb.db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
    }
    globalForDb.db = createDb(url);
  }
  return globalForDb.db;
}

// Created on first use rather than at import time, so `next build` does not
// need a database: no route touches the database while prerendering.
export const db = new Proxy({} as Db, {
  get: (_target, property) => {
    const client = getDb();
    const value = Reflect.get(client, property);
    // Bind methods such as $transaction to the real client, not to the proxy.
    return typeof value === "function" ? value.bind(client) : value;
  },
});

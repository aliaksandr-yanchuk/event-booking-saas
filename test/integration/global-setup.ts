import { execSync } from "node:child_process";
import "dotenv/config";

/** Applies all migrations to the test database once, before any test runs. */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set. See .env.example.");
  }
  if (url === process.env.DATABASE_URL) {
    // The tests truncate every table; refuse to run against the development data.
    throw new Error("TEST_DATABASE_URL must point to a different database than DATABASE_URL.");
  }
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}

import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // process.env instead of env(): `prisma generate` runs in the Docker build,
    // where no database URL exists, and env() would throw there.
    url: process.env["DATABASE_URL"],
  },
});

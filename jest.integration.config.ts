import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

// Integration tests: the booking service against a real PostgreSQL database,
// because the guarantees under test (unique constraints, transactions, races)
// only exist in the database. Run serially: tests share one database.
const config: Config = {
  displayName: "integration",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.int.test.ts"],
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  globalSetup: "<rootDir>/test/integration/global-setup.ts",
  testTimeout: 20_000,
};

export default createJestConfig(config);

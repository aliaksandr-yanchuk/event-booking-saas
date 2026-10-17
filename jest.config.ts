import type { Config } from "jest";
import nextJest from "next/jest.js";

// next/jest compiles TypeScript/JSX with SWC and resolves the "@/" path alias.
const createJestConfig = nextJest({ dir: "./" });

// Unit tests: pure functions and React components, no database.
const config: Config = {
  displayName: "unit",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  testPathIgnorePatterns: ["\\.int\\.test\\.ts$"],
  // The standalone build output contains a copy of package.json.
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  coverageProvider: "v8",
  collectCoverageFrom: ["src/lib/**/*.ts", "src/components/**/*.tsx"],
};

export default createJestConfig(config);

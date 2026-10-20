import { createHash } from "node:crypto";
import { test as base } from "@playwright/test";

export { expect, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

/**
 * Every test is its own client. The app rate-limits by client address (X-Forwarded-For),
 * and the whole suite runs from 127.0.0.1, so without this all tests would share one
 * budget and later tests would fail with 429 depending on how many ran before them.
 *
 * The address comes from the test ID, which is unique per test and project. (A counter
 * would not do: each project starts a new worker, so the counts repeat across projects.)
 */
// The fixture callback is named `provide`, not `use`, so the React hooks lint rule leaves it alone.
export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, provide, testInfo) => {
    const [a, b, c] = createHash("sha256").update(testInfo.testId).digest();
    await provide({ ...extraHTTPHeaders, "X-Forwarded-For": `10.${a}.${b}.${c}` });
  },
});

import { execSync } from "node:child_process";

/** Every run starts from the same demo data, so seat numbers in the tests are stable. */
export default function globalSetup() {
  execSync("npm run db:seed", { stdio: "inherit" });
}

import { connection } from "next/server";
import { db } from "@/server/db";

// Liveness and readiness check for the container platform: 200 only when
// the database answers, so traffic is not routed to an instance that cannot serve it.
export async function GET() {
  await connection();
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error", reason: "database unavailable" }, { status: 503 });
  }
}

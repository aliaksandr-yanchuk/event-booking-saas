import { Prisma } from "@/generated/prisma/client";

/** A UNIQUE constraint rejected the write (for example, a seat that is already held). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

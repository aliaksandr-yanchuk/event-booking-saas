import { buildOpenApiDocument } from "@/server/api/openapi";

/**
 * GET /api/v1/openapi.json — OpenAPI 3.1 description of the public API,
 * generated from the Zod schemas the server validates and responds with.
 * Contains no runtime data, so Next.js prerenders it at build time.
 */
export function GET() {
  return Response.json(buildOpenApiDocument());
}

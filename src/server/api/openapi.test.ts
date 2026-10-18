/**
 * @jest-environment node
 */
import { buildOpenApiDocument } from "./openapi";
import { PROBLEM_CODES } from "./schemas";

const document = buildOpenApiDocument();
const schemas = document.components.schemas as Record<string, Record<string, unknown>>;

function collectRefs(node: unknown, refs: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((item) => collectRefs(item, refs));
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") refs.push(value);
      else collectRefs(value, refs);
    }
  }
  return refs;
}

describe("OpenAPI document", () => {
  it("resolves every $ref to a component schema", () => {
    const missing = collectRefs(document)
      .map((ref) => ref.replace("#/components/schemas/", ""))
      .filter((id) => !(id in schemas));

    expect(missing).toEqual([]);
  });

  it("uses every component schema somewhere", () => {
    const used = new Set(collectRefs(document).map((ref) => ref.replace("#/components/schemas/", "")));
    const unused = Object.keys(schemas).filter((id) => !used.has(id));

    expect(unused).toEqual([]);
  });

  it("documents the booking request as the client sends it, from the Zod schema", () => {
    const request = schemas.CreateBookingRequest as {
      required: string[];
      properties: Record<string, { maxLength?: number; maxItems?: number; format?: string }>;
    };

    expect(request.required).toEqual(["customerName", "customerEmail", "seatIds"]);
    expect(request.properties.customerName.maxLength).toBe(80);
    expect(request.properties.customerEmail.format).toBe("email");
    expect(request.properties.seatIds.maxItems).toBe(20);
  });

  it("lists every problem code", () => {
    const problem = schemas.Problem as { properties: { code: { enum: string[] } } };
    expect(problem.properties.code.enum).toEqual([...PROBLEM_CODES]);
  });

  it("marks response objects as closed, so undocumented fields are a contract change", () => {
    expect(schemas.EventDetail.additionalProperties).toBe(false);
  });

  it("strips generator noise", () => {
    const serialized = JSON.stringify(document);
    expect(serialized).not.toContain("$schema");
    expect(serialized).not.toContain(String(Number.MAX_SAFE_INTEGER));
    expect((schemas.EventSummary as { properties: { startsAt: object } }).properties.startsAt).toEqual({
      type: "string",
      format: "date-time",
    });
  });
});

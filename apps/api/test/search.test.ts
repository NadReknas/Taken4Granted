import { describe, expect, it } from "vitest";
import { buildFilters, searchParamsSchema } from "../src/services/opportunities.js";

describe("search parameter parsing", () => {
  it("parses CSV filters and applies defaults", () => {
    const p = searchParamsSchema.parse({ states: "CA,OR", entityTypes: "small_business", minAmount: "5000" });
    expect(p.states).toEqual(["CA", "OR"]);
    expect(p.entityTypes).toEqual(["small_business"]);
    expect(p.minAmount).toBe(5000);
    expect(p.status).toBe("open");
    expect(p.page).toBe(1);
  });
  it("rejects unknown states and oversized pages", () => {
    expect(searchParamsSchema.safeParse({ states: "XX" }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ pageSize: 1000 }).success).toBe(false);
  });
});

describe("filter SQL", () => {
  it("treats nationwide opportunities and unknown amounts as matches", () => {
    const params: unknown[] = [];
    const where = buildFilters(searchParamsSchema.parse({ states: "IA", minAmount: 1000, maxAmount: 50000 }), params);
    expect(where.join(" AND ")).toContain("states = '{}' OR states &&");
    expect(where.join(" AND ")).toContain("amount_max IS NULL OR amount_max >=");
    expect(where.join(" AND ")).toContain("amount_min IS NULL OR amount_min <=");
    expect(params).toEqual(["open", ["IA"], 1000, 50000]);
  });
});

import { describe, expect, it } from "vitest";
import { STATE_CODES } from "../src/domain/opportunity.js";
import { STATE_PORTALS } from "../src/domain/state-portals.js";

describe("state portals", () => {
  it("has an https portal for every state code", () => {
    for (const code of STATE_CODES) {
      const p = STATE_PORTALS[code];
      expect(p, code).toBeDefined();
      expect(p!.name.length, code).toBeGreaterThan(3);
      expect(p!.url, code).toMatch(/^https:\/\/[^ ]+$/);
    }
    expect(Object.keys(STATE_PORTALS).sort()).toEqual([...STATE_CODES].sort());
  });
});

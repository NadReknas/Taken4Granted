import { describe, expect, it } from "vitest";
import { keepPost, normalizeWpPost, wpPostSchema } from "../src/sources/wp-rest.js";
import type { WpRestSourceConfig } from "../src/sources/types.js";

const cfg: WpRestSourceConfig = {
  id: "ks_commerce_programs",
  name: "KS",
  kind: "wp_rest",
  siteUrl: "https://www.kansascommerce.gov",
  postType: "program",
  level: "state",
  states: ["KS"],
  agency: "Kansas Department of Commerce",
  includeTitle: "grant|fund",
  excludeTitle: "form|archive",
  defaultCategories: ["business"],
};

const post = wpPostSchema.parse({
  id: 42,
  date_gmt: "2026-01-05T10:00:00",
  modified_gmt: "2026-02-01T12:00:00",
  link: "https://www.kansascommerce.gov/program/rural-energy-grant/",
  title: { rendered: "Rural Energy &#038; Broadband Grant" },
  excerpt: { rendered: "<p>Helps rural businesses.</p>" },
  content: { rendered: "<p>Solar and wind projects for small towns. Applications are due March 15, 2027.</p>" },
});

describe("wp_rest adapter", () => {
  it("normalises a WordPress post into a state-level opportunity", () => {
    const o = normalizeWpPost(post, cfg);
    expect(o).toMatchObject({
      sourceId: "ks_commerce_programs",
      externalId: "42",
      title: "Rural Energy & Broadband Grant",
      level: "state",
      states: ["KS"],
      agency: "Kansas Department of Commerce",
      summary: "Helps rural businesses.",
      applyUrl: "https://www.kansascommerce.gov/program/rural-energy-grant/",
      status: "open",
    });
    expect(o.categories).toContain("business");
    expect(o.categories).toContain("energy");
    expect(o.postedAt?.toISOString()).toBe("2026-02-01T12:00:00.000Z");
    expect(o.deadline?.toISOString().slice(0, 10)).toBe("2027-03-15");
  });

  it("applies include/exclude title filters", () => {
    expect(keepPost(post, cfg)).toBe(true);
    expect(keepPost({ ...post, title: { rendered: "Grant Request Form" } }, cfg)).toBe(false);
    expect(keepPost({ ...post, title: { rendered: "Staff Directory" } }, cfg)).toBe(false);
    expect(keepPost(post, { ...cfg, includeTitle: undefined, excludeTitle: undefined })).toBe(true);
  });
});

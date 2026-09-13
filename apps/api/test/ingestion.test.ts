import { describe, expect, it } from "vitest";
import { normalizedOpportunitySchema, parseMoney, stripHtml, inferCategories, buildSlug, MAX_TEXT } from "../src/domain/opportunity.js";
import { GrantsGovSource, normalizeHit, parseGrantsGovDate, searchResponseSchema } from "../src/sources/grants-gov.js";
import { logger } from "../src/lib/logger.js";
import { normalizeCaRecord, parseAmountRange, parseCaDate, caRecordSchema } from "../src/sources/ca-grants.js";
import { extractDeadline, extractItems, normalizeRssItem, rssItemSchema } from "../src/sources/rss.js";
import { loadSources } from "../src/sources/index.js";
import { HttpError, backoffDelay, withRetry } from "../src/lib/retry.js";

describe("normalisation helpers", () => {
  it("parses money and treats zero/unknown as null", () => {
    expect(parseMoney("$1,500,000")).toBe(1_500_000);
    expect(parseMoney(250000)).toBe(250000);
    expect(parseMoney("0")).toBeNull();
    expect(parseMoney("N/A")).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });

  it("strips HTML, decodes entities and clips to the schema limit", () => {
    expect(stripHtml("<p>Solar &amp; storage &ndash; round&nbsp;2</p>")).toBe("Solar & storage – round 2");
    expect(stripHtml("   ")).toBeNull();
    const long = stripHtml("x".repeat(MAX_TEXT + 500))!;
    expect(long.length).toBeLessThanOrEqual(MAX_TEXT);
  });

  it("infers categories from keywords and builds stable slugs", () => {
    expect(inferCategories("Rural broadband and solar microgrid pilot")).toEqual(expect.arrayContaining(["energy", "rural_development"]));
    expect(buildSlug({ title: "Solar – Round 2!", externalId: "ABC-123" })).toBe("solar-round-2-abc-123");
  });
});

describe("normalized opportunity schema", () => {
  const valid = {
    sourceId: "s",
    externalId: "1",
    title: "Test",
    agency: null,
    level: "federal",
    states: [],
    entityTypes: ["small_business"],
    categories: ["energy"],
    summary: null,
    eligibilityText: null,
    amountMin: 1000,
    amountMax: 5000,
    totalFunding: null,
    postedAt: null,
    deadline: new Date(),
    deadlineText: null,
    applyUrl: "https://example.gov/apply",
    status: "open",
    raw: {},
  };
  it("accepts valid records", () => {
    expect(normalizedOpportunitySchema.parse(valid).title).toBe("Test");
  });
  it("rejects bad urls, unknown enums and inverted amount ranges", () => {
    expect(() => normalizedOpportunitySchema.parse({ ...valid, applyUrl: "not a url" })).toThrow();
    expect(() => normalizedOpportunitySchema.parse({ ...valid, states: ["ZZ"] })).toThrow();
    expect(() => normalizedOpportunitySchema.parse({ ...valid, entityTypes: ["martian"] })).toThrow();
    expect(() => normalizedOpportunitySchema.parse({ ...valid, amountMin: 9000, amountMax: 5000 })).toThrow();
  });
});

describe("Grants.gov adapter", () => {
  it("validates the search2 response shape", () => {
    const parsed = searchResponseSchema.parse({
      errorcode: 0,
      data: {
        hitCount: 1,
        startRecord: 0,
        oppHits: [{ id: "358000", number: "USDA-RD-1", title: "Rural Energy for America", agency: "USDA", openDate: "08/01/2026", closeDate: "10/15/2026", oppStatus: "posted" }],
      },
    });
    expect(parsed.data.oppHits).toHaveLength(1);
    expect(() => searchResponseSchema.parse({ errorcode: 0, data: { hitCount: 1, startRecord: 0, oppHits: [{ title: "missing id" }] } })).toThrow();
  });

  it("normalises a hit + synopsis into the shared schema", () => {
    const hit = { id: "358000", number: "USDA-RD-1", title: "Rural Energy for America &ndash; REAP", agency: "USDA", openDate: "08/01/2026", closeDate: "10/15/2026", oppStatus: "posted" as const };
    const detail = {
      synopsisDesc: "<p>Grants for <b>renewable energy</b> systems on farms.</p>",
      applicantEligibilityDesc: "Agricultural producers and rural small businesses.",
      applicantTypes: [{ id: "23", description: "Small businesses" }, { id: "99", description: "Other" }],
      fundingActivityCategories: [{ id: "EN", description: "Energy" }],
      awardCeiling: "1000000",
      awardFloor: "2500",
      estimatedFunding: "50000000",
      responseDateStr: "10/15/2026",
      postingDateStr: "08/01/2026",
      agencyName: "Rural Business-Cooperative Service",
    };
    const o = normalizeHit(hit, detail, "grants_gov");
    expect(o.title).toBe("Rural Energy for America – REAP");
    expect(o.level).toBe("federal");
    expect(o.entityTypes).toEqual(["small_business", "any"]);
    expect(o.categories).toContain("energy");
    expect(o.amountMin).toBe(2500);
    expect(o.amountMax).toBe(1_000_000);
    expect(o.deadline?.toISOString()).toBe("2026-10-15T23:59:59.000Z");
    expect(o.applyUrl).toBe("https://www.grants.gov/search-results-detail/358000");
    expect(o.summary).toBe("Grants for renewable energy systems on farms.");
  });

  it("fetches through the retrying HTTP client and survives a transient 503", async () => {
    let searchCalls = 0;
    const fetchImpl: typeof fetch = async (url) => {
      const u = String(url);
      if (u.endsWith("/search2")) {
        searchCalls++;
        if (searchCalls === 1) return new Response("upstream down", { status: 503 });
        return Response.json({
          errorcode: 0,
          data: {
            hitCount: 1,
            startRecord: 0,
            oppHits: [{ id: "1", number: "X-1", title: "Water Grant", agency: "EPA", openDate: "01/01/2026", closeDate: "12/31/2026", oppStatus: "posted" }],
          },
        });
      }
      return Response.json({ errorcode: 0, data: { id: "1", synopsis: { synopsisDesc: "Clean water.", awardCeiling: "10000" } } });
    };
    const src = new GrantsGovSource({ id: "gg", kind: "grants_gov", name: "gg", keywords: ["water"] });
    const items = await src.fetch({ log: logger, maxItems: 10, fetchImpl });
    expect(searchCalls).toBe(2);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ externalId: "1", amountMax: 10000, summary: "Clean water." });
  });

  it("parses MM/DD/YYYY dates and rejects junk", () => {
    expect(parseGrantsGovDate("01/31/2027")?.toISOString()).toBe("2027-01-31T00:00:00.000Z");
    expect(parseGrantsGovDate("soon")).toBeNull();
    expect(parseGrantsGovDate(null)).toBeNull();
  });
});

describe("California Grants Portal adapter", () => {
  it("normalises a CKAN record", () => {
    const rec = caRecordSchema.parse({
      PortalID: "173241",
      Title: "Transformative Climate Communities",
      AgencyDept: "Strategic Growth Council",
      Status: "active",
      Categories: "Environment & Water; Energy",
      ApplicantType: "Nonprofit; Business; Tribal Government",
      Purpose: "Fund neighborhood-level climate projects.",
      EstAmounts: "Between $500,000 and $30,000,000",
      ApplicationDeadline: "2026-10-16 23:59:00",
      GrantURL: "https://sgc.ca.gov/programs/tcc/",
    });
    const o = normalizeCaRecord(rec, "ca_grants_portal");
    expect(o.level).toBe("state");
    expect(o.states).toEqual(["CA"]);
    expect(o.entityTypes).toEqual(expect.arrayContaining(["nonprofit", "small_business", "tribal"]));
    expect(o.amountMin).toBe(500_000);
    expect(o.amountMax).toBe(30_000_000);
    expect(o.status).toBe("open");
    expect(o.deadline?.toISOString()).toBe("2026-10-16T23:59:00.000Z");
  });
  it("parses amount ranges and dates defensively", () => {
    expect(parseAmountRange("Up to $50,000")).toEqual({ min: null, max: 50_000 });
    expect(parseAmountRange("Not specified")).toEqual({ min: null, max: null });
    expect(parseCaDate("garbage")).toBeNull();
  });
});

describe("RSS adapter", () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>
    <item><title>Clean Water Grants</title><link>https://example.gov/cw</link><guid>cw-1</guid>
      <description>Applications due October 31, 2026. Municipalities and nonprofits eligible.</description>
      <pubDate>Mon, 01 Sep 2026 12:00:00 GMT</pubDate></item></channel></rss>`;

  it("extracts items, deadlines and normalises", () => {
    const items = extractItems(xml);
    expect(items).toHaveLength(1);
    const item = rssItemSchema.parse(items[0]);
    const cfg = { id: "wa_commerce", kind: "rss" as const, name: "WA", url: "https://example.gov/feed", level: "state" as const, states: ["WA"], enabled: true };
    const o = normalizeRssItem(item, cfg);
    expect(o.externalId).toBe("cw-1");
    expect(o.states).toEqual(["WA"]);
    expect(o.deadline?.toISOString().slice(0, 10)).toBe("2026-10-31");
    expect(o.categories).toContain("environment");
    expect(extractDeadline("no dates here").deadline).toBeNull();
  });
});

describe("source configuration", () => {
  it("loads and validates the shipped sources.json", async () => {
    const adapters = await loadSources();
    expect(adapters.length).toBeGreaterThanOrEqual(3);
    expect(adapters.map((a) => a.config.kind)).toEqual(expect.arrayContaining(["grants_gov", "ca_grants"]));
  });
});

describe("retry with exponential backoff", () => {
  it("grows delays exponentially up to the cap", () => {
    expect(backoffDelay(0, 100, 10_000, 2, false)).toBe(100);
    expect(backoffDelay(3, 100, 10_000, 2, false)).toBe(800);
    expect(backoffDelay(10, 100, 10_000, 2, false)).toBe(10_000);
    const j = backoffDelay(2, 100, 10_000, 2, true);
    expect(j).toBeGreaterThanOrEqual(200);
    expect(j).toBeLessThanOrEqual(400);
  });

  it("retries 5xx/429 and network errors, but not 4xx", async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls === 1) throw new HttpError(503, "unavailable");
        if (calls === 2) throw new HttpError(429, "slow down");
        if (calls === 3) throw new Error("ECONNRESET");
        return "ok";
      },
      { retries: 5, baseMs: 10, jitter: false, sleep: async (ms) => void delays.push(ms) },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(4);
    expect(delays).toEqual([10, 20, 40]);

    calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new HttpError(404, "nope");
      }, { retries: 3, sleep: async () => {} }),
    ).rejects.toThrow("nope");
    expect(calls).toBe(1);
  });

  it("gives up after the configured number of retries", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new HttpError(500, "down");
      }, { retries: 2, sleep: async () => {} }),
    ).rejects.toThrow("down");
    expect(calls).toBe(3);
  });
});

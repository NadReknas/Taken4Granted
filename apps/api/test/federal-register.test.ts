import { describe, expect, it } from "vitest";
import { logger } from "../src/lib/logger.js";
import type { FederalRegisterSourceConfig } from "../src/sources/types.js";
import {
  FederalRegisterSource,
  datesSection,
  duplicatesGrantsGov,
  frDocumentSchema,
  keepDocument,
  normalizeFrDocument,
  searchUrl,
} from "../src/sources/federal-register.js";

const cfg: FederalRegisterSourceConfig = {
  id: "federal_register_funding",
  name: "Federal Register",
  kind: "federal_register",
  agencies: ["rural-business-cooperative-service", "small-business-administration"],
};

const doc = (over: Record<string, unknown> = {}) =>
  frDocumentSchema.parse({
    document_number: "2026-12345",
    title: "Notice of Funding Opportunity for the Intermediary Relending Program for Fiscal Year 2026",
    abstract: "The Rural Business-Cooperative Service announces loan funds for intermediaries.",
    action: "Notice.",
    dates: "June 18, 2026.",
    agencies: [
      { name: "Agriculture Department", slug: "agriculture-department" },
      { name: "Rural Business-Cooperative Service", slug: "rural-business-cooperative-service" },
    ],
    html_url: "https://www.federalregister.gov/documents/2026/06/18/2026-12345/irp",
    publication_date: "2026-06-18",
    raw_text_url: "https://www.federalregister.gov/documents/full_text/text/2026/06/18/2026-12345.txt",
    ...over,
  });

const SBA_TEXT = `SMALL BUSINESS ADMINISTRATION
[Disaster Declaration #21596 and #21597; TEXAS Disaster Number TX-20031]
Presidential Declaration of a Major Disaster for the State of Texas
SUMMARY: This is a notice of a Presidential declaration of a major disaster for the State of Texas.
DATES: Issued on 10/30/2026.
Physical Loan Application Deadline Date: December 29, 2026.
Economic Injury (EIDL) Loan Application Deadline Date: July 30, 2027.
ADDRESSES: Visit the MySBA Loan Portal at https://lending.sba.gov to apply.
SUPPLEMENTARY INFORMATION: Primary Counties: Travis.`;

describe("Federal Register adapter", () => {
  it("keeps funding notices and drops routine paperwork", () => {
    expect(keepDocument(doc(), cfg)).toBe(true);
    expect(keepDocument(doc({ title: "Agency Information Collection Activities; Loan Program Forms" }), cfg)).toBe(false);
    expect(keepDocument(doc({ title: "Notice of Funding Opportunity for X", action: "Notice; correction." }), cfg)).toBe(false);
    expect(keepDocument(doc({ title: "Rural Business Development Advisory Committee Meeting" }), cfg)).toBe(false);
  });

  it("skips notices whose full announcement is posted on Grants.gov", () => {
    expect(duplicatesGrantsGov("DATES: May 15, 2026.\n\nADDRESSES: Full funding notice is available on grants.gov.\n\nSUPPLEMENTARY INFORMATION: ...")).toBe(true);
    expect(duplicatesGrantsGov("DATES: June 18, 2026.\n\nADDRESSES: The full IRP notice is on the RBCS website.\n\nSUPPLEMENTARY INFORMATION: see grants.gov for grants")).toBe(false);
  });

  it("normalises a loan notice as a nationwide federal loan", () => {
    const o = normalizeFrDocument(doc(), null, cfg);
    expect(o.fundingTypes).toEqual(["loan"]);
    expect(o.level).toBe("federal");
    expect(o.states).toEqual([]);
    expect(o.agency).toBe("Rural Business-Cooperative Service");
    expect(o.externalId).toBe("2026-12345");
    expect(o.status).toBe("open");
  });

  it("files SBA disaster declarations as state-scoped disaster aid with the latest loan deadline", () => {
    const o = normalizeFrDocument(
      doc({
        title: "Presidential Declaration of a Major Disaster for the State of Texas",
        abstract: "This is a notice of a Presidential declaration of a major disaster.",
        agencies: [{ name: "Small Business Administration", slug: "small-business-administration" }],
      }),
      SBA_TEXT,
      cfg,
    );
    expect(o.fundingTypes).toEqual(["disaster_aid"]);
    expect(o.states).toEqual(["TX"]);
    expect(o.entityTypes).toEqual(expect.arrayContaining(["small_business", "nonprofit", "individual"]));
    expect(o.deadline?.toISOString().slice(0, 10)).toBe("2027-07-30");
    expect(o.deadlineText).toContain("Physical Loan Application Deadline Date: December 29, 2026");
    expect(datesSection(SBA_TEXT)).toContain("Economic Injury");
  });

  it("builds an agency- and date-scoped notice query", () => {
    const u = new URL(searchUrl({ ...cfg, lookbackDays: 30 }, 2, new Date("2026-11-14T00:00:00Z")));
    expect(u.searchParams.getAll("conditions[agencies][]")).toEqual(cfg.agencies);
    expect(u.searchParams.get("conditions[publication_date][gte]")).toBe("2026-10-15");
    expect(u.searchParams.get("conditions[type][]")).toBe("NOTICE");
    expect(u.searchParams.get("page")).toBe("2");
  });

  it("fetches, filters and reads full text through the injected fetch", async () => {
    const results = [
      doc(),
      doc({
        document_number: "2026-2",
        title: "Notice of Funding Opportunity for the Rural Business Development Grants",
        raw_text_url: "https://www.federalregister.gov/documents/full_text/text/2026/06/18/2026-2.txt",
      }),
      doc({ document_number: "2026-3", title: "Privacy Act of 1974; System of Records" }),
    ];
    const fetchImpl = (async (url: string) => {
      if (url.includes("documents.json")) return new Response(JSON.stringify({ count: 3, total_pages: 1, results }), { status: 200 });
      const text = url.includes("2026-12345") ? "DATES: June 18, 2026.\nADDRESSES: RBCS website." : "ADDRESSES: Full funding notice is available on grants.gov.";
      return new Response(`<html><pre>${text}</pre></html>`, { status: 200 });
    }) as typeof fetch;
    const items = await new FederalRegisterSource(cfg).fetch({ log: logger, maxItems: 100, fetchImpl });
    expect(items.map((i) => i.externalId)).toEqual(["2026-12345"]);
  });
});

describe("state inference", () => {
  it("does not read West Virginia as Virginia too", async () => {
    const { inferStates } = await import("../src/domain/opportunity.js");
    expect(inferStates("Administrative Declaration of a Disaster for the State of West Virginia")).toEqual(["WV"]);
    expect(inferStates("Virginia and West Virginia").sort()).toEqual(["VA", "WV"]);
  });
});

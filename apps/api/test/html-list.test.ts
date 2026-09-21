import { describe, expect, it } from "vitest";
import { HtmlListSource, extractItems, keepItem, normalizeHtmlItem, pageUrl } from "../src/sources/html-list.js";
import { loadSources } from "../src/sources/index.js";
import type { HtmlListSourceConfig } from "../src/sources/types.js";
import { logger } from "../src/lib/logger.js";

const cardCfg: HtmlListSourceConfig = {
  id: "mi_medc_programs",
  name: "MI",
  kind: "html_list",
  urls: ["https://www.michiganbusiness.org/data-list---filter/"],
  itemSelector: ".data-item",
  titleSelector: ".data-title",
  linkSelector: ".data-cta a",
  summarySelector: ".data-description",
  metaSelector: ".data-category",
  pagination: { param: "page", first: 1, maxPages: 5 },
  level: "state",
  states: ["MI"],
  agency: "Michigan Economic Development Corporation",
  defaultCategories: ["business"],
};

const cardHtml = (items: { title: string; href: string; desc?: string; cat?: string }[]) =>
  `<html><body>${items
    .map(
      (i) => `<div class="data-item">
        <div class="data-category"><p>${i.cat ?? "Find Funding"}</p></div>
        <p class="data-title">${i.title}</p>
        <div class="data-description"><p>${i.desc ?? ""}</p></div>
        <div class="data-cta"><a href="${i.href}" class="btn">Learn More</a></div>
      </div>`,
    )
    .join("")}</body></html>`;

const headingCfg: HtmlListSourceConfig = {
  id: "tx_governor_incentives",
  name: "TX",
  kind: "html_list",
  urls: ["https://gov.texas.gov/business/page/incentives"],
  itemSelector: "section.l-content h3",
  titleSelector: "a",
  summaryFollowing: true,
  level: "state",
  states: ["TX"],
  agency: "Texas Economic Development & Tourism Office",
  defaultCategories: ["business"],
};

const headingHtml = `<section class="l-content">
  <h2>Incentives</h2>
  <h3><a href="/business/page/texas-enterprise-fund">Texas Enterprise Fund</a></h3>
  <p>A deal-closing <b>grant</b> for projects creating jobs.</p>
  <p>Applications close on January 31, 2020.</p>
  <h3><a href="https://gov.texas.gov/business/page/skills-development-fund">Skills Development Fund</a></h3>
  <p>Customised job training for employers.</p>
  <h3>No link here</h3>
</section>`;

describe("html_list adapter", () => {
  it("extracts repeated card items, resolving relative links", () => {
    const html = cardHtml([
      { title: "Capital Access Program", href: "/services/access-capital/", desc: "Loans for &lt;500 employees.", cat: "Find Funding, Loans" },
      { title: "Anchor only", href: "#top" },
      { title: "Mail", href: "mailto:x@y.z" },
    ]);
    const items = extractItems(html, "https://www.michiganbusiness.org/data-list---filter/?page=1", cardCfg);
    expect(items).toEqual([
      {
        title: "Capital Access Program",
        link: "https://www.michiganbusiness.org/services/access-capital/",
        summary: "Loans for <500 employees.",
        meta: "Find Funding, Loans",
      },
    ]);
  });

  it("uses the heading anchor and following paragraphs when summaryFollowing is set", () => {
    const items = extractItems(headingHtml, "https://gov.texas.gov/business/page/incentives", headingCfg);
    expect(items.map((i) => i.title)).toEqual(["Texas Enterprise Fund", "Skills Development Fund"]);
    expect(items[0].link).toBe("https://gov.texas.gov/business/page/texas-enterprise-fund");
    expect(items[0].summary).toBe(
      "A deal-closing grant for projects creating jobs.\nApplications close on January 31, 2020.",
    );
    expect(items[1].summary).toBe("Customised job training for employers.");
  });

  it("normalises an item into a state-level opportunity with deadline and categories", () => {
    const [item] = extractItems(headingHtml, "https://gov.texas.gov/business/page/incentives", headingCfg);
    const o = normalizeHtmlItem(item, headingCfg);
    expect(o).toMatchObject({
      sourceId: "tx_governor_incentives",
      externalId: "https://gov.texas.gov/business/page/texas-enterprise-fund",
      applyUrl: "https://gov.texas.gov/business/page/texas-enterprise-fund",
      level: "state",
      states: ["TX"],
      agency: "Texas Economic Development & Tourism Office",
      status: "closed",
    });
    expect(o.deadline?.toISOString().slice(0, 10)).toBe("2020-01-31");
    expect(o.categories).toContain("business");
    expect(normalizeHtmlItem(item, headingCfg, { sharedLink: true }).externalId).toBe(
      "https://gov.texas.gov/business/page/texas-enterprise-fund#texas-enterprise-fund",
    );
  });

  it("applies title/meta and link filters", () => {
    const item = { title: "Small Business Council", link: "https://x.gov/contact-us", summary: null, meta: "Board" };
    expect(keepItem(item, { ...cardCfg, excludeTitle: "council|board" })).toBe(false);
    expect(keepItem(item, { ...cardCfg, includeTitle: "grant" })).toBe(false);
    expect(keepItem(item, { ...cardCfg, excludeLink: "/contact-us$" })).toBe(false);
    expect(keepItem(item, { ...cardCfg, includeLink: "/programs/" })).toBe(false);
    expect(keepItem(item, cardCfg)).toBe(true);
  });

  it("builds page urls without clobbering existing query params", () => {
    const cfg = { ...cardCfg, urls: ["https://oedit.colorado.gov/programs-and-funding?f%5B0%5D=grants"] };
    expect(pageUrl(cfg.urls[0], cfg, 2)).toBe("https://oedit.colorado.gov/programs-and-funding?f%5B0%5D=grants&page=2");
    expect(pageUrl(cfg.urls[0], { ...cfg, pagination: undefined }, 2)).toBe(cfg.urls[0]);
  });

  it("paginates until a page adds nothing new and disambiguates shared links", async () => {
    const pages: Record<string, string> = {
      "https://www.michiganbusiness.org/data-list---filter/?page=1": cardHtml([
        { title: "Capital Access Program", href: "/services/small-business/" },
        { title: "Collateral Support Program", href: "/services/small-business/" },
      ]),
      "https://www.michiganbusiness.org/data-list---filter/?page=2": cardHtml([
        { title: "Collateral Support Program", href: "/services/small-business/" },
        { title: "Match on Main", href: "https://www.miplace.org/match-on-main/" },
      ]),
      "https://www.michiganbusiness.org/data-list---filter/?page=3": cardHtml([
        { title: "Match on Main", href: "https://www.miplace.org/match-on-main/" },
      ]),
    };
    const requested: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      requested.push(url);
      const body = pages[url];
      return new Response(body ?? "<html></html>", { status: body ? 200 : 404 });
    };

    const out = await new HtmlListSource(cardCfg).fetch({ log: logger, maxItems: 100, fetchImpl });
    expect(requested).toEqual(Object.keys(pages));
    expect(out.map((o) => [o.title, o.externalId])).toEqual([
      ["Capital Access Program", "https://www.michiganbusiness.org/services/small-business/#capital-access-program"],
      ["Collateral Support Program", "https://www.michiganbusiness.org/services/small-business/#collateral-support-program"],
      ["Match on Main", "https://www.miplace.org/match-on-main/"],
    ]);
  });

  it("loads the configured html_list state sources", async () => {
    const ids = (await loadSources()).filter((s) => s.config.kind === "html_list").map((s) => s.config.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "ny_esd_programs",
        "tx_governor_incentives",
        "wa_commerce_programs",
        "co_oedit_programs",
        "mi_medc_programs",
      ]),
    );
  });
});

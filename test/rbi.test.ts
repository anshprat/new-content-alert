import { describe, it, expect } from "vitest";
import { parseRssItems } from "../src/adapters/rbi";
import { fixture } from "./helpers";

const NOW = "2026-06-30T00:00:00.000Z";

describe("parseRssItems (RBI, live fixtures)", () => {
  it("parses notifications and keys on the numeric Id", () => {
    const items = parseRssItems(fixture("rbi_notifications.xml"), "notification", 25, NOW);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(25);
    for (const it of items) {
      expect(it.source).toBe("RBI");
      expect(it.category).toBe("notification");
      expect(it.title.length).toBeGreaterThan(0);
      expect(it.url).toContain("NotificationUser.aspx");
      expect(it.id).toMatch(/^\d+$/); // numeric Id extracted from the link
      expect(() => new Date(it.publishedAt).toISOString()).not.toThrow();
    }
  });

  it("parses press releases and keys on prid", () => {
    const items = parseRssItems(fixture("rbi_pressreleases.xml"), "press_release", 25, NOW);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].url).toContain("BS_PressReleaseDisplay.aspx");
    expect(items[0].id).toMatch(/^\d+$/);
  });

  it("falls back to fetch time when pubDate is missing/invalid", () => {
    const xml =
      `<?xml version="1.0"?><rss><channel><item>` +
      `<title>X</title><link>https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=999</link>` +
      `</item></channel></rss>`;
    const [item] = parseRssItems(xml, "notification", 25, NOW);
    expect(item.id).toBe("999");
    expect(item.publishedAt).toBe(NOW);
  });
});

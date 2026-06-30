import { describe, it, expect } from "vitest";
import { parseIrdaiListing } from "../src/adapters/irdai";
import { fixture } from "./helpers";

const NOW = "2026-06-30T00:00:00.000Z";
const PAGE = "https://irdai.gov.in/circulars";

describe("parseIrdaiListing (live fixture)", () => {
  const items = parseIrdaiListing(fixture("irdai_circulars.html"), PAGE, "circular", 25, NOW);

  it("extracts circular rows with documentId as id", () => {
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.source).toBe("IRDAI");
      expect(it.id).toMatch(/^\d+$/);
      expect(it.url).toContain("documentId=");
    }
  });

  it("uses the shortDesc cell as the title, not the link text 'Circular'", () => {
    for (const it of items) {
      expect(it.title.length).toBeGreaterThan(0);
      expect(it.title).not.toMatch(/^परिपत्र \/ Circular$/i);
    }
  });

  it("excludes the dropdown/nav document-detail link (documentId 7858787)", () => {
    expect(items.find((i) => i.id === "7858787")).toBeUndefined();
  });

  it("parses DD-MM-YYYY dates to ISO", () => {
    const withDate = items.find((i) => i.publishedAt !== NOW);
    expect(withDate).toBeDefined();
    expect(withDate!.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

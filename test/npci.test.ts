import { describe, it, expect } from "vitest";
import { parseNpciResponse } from "../src/adapters/npci";
import { fixture } from "./helpers";

const NOW = "2026-06-30T00:00:00.000Z";
const BASE = "https://www.npci.org.in";

describe("parseNpciResponse", () => {
  it("maps data.files[] tolerantly across field-name variants", () => {
    const json = JSON.parse(fixture("npci_files.sample.json"));
    const items = parseNpciResponse(json, "upi", BASE, 25, NOW);
    expect(items).toHaveLength(2);

    const [a, b] = items;
    expect(a.id).toBe("upi:4821");
    expect(a.title).toContain("UPI transaction limits");
    expect(a.url).toBe("https://www.npci.org.in/uploads/upi_limits_2026.pdf"); // relative -> absolute
    expect(a.publishedAt).toMatch(/^2026-06-20T/);

    expect(b.url).toBe("https://www.npci.org.in/uploads/upi_lite.pdf"); // already absolute
    expect(b.source).toBe("NPCI");
  });

  it("returns [] for the 'Data not found' envelope", () => {
    const json = { status: 404, message: "Data not found", data: {} };
    expect(parseNpciResponse(json, "upi", BASE, 25, NOW)).toHaveLength(0);
  });
});

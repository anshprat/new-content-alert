import { describe, it, expect } from "vitest";
import { parseNpciResponse } from "../src/adapters/npci";
import { fixture } from "./helpers";

const NOW = "2026-06-30T00:00:00.000Z";
const BASE = "https://www.npci.org.in";

describe("parseNpciResponse (captured live shape)", () => {
  it("maps data.files[] (fileName + media.url + id) to normalized Items", () => {
    const json = JSON.parse(fixture("npci_files.sample.json"));
    const items = parseNpciResponse(json, "upi", BASE, 25, NOW);
    expect(items).toHaveLength(2);

    const [a] = items;
    expect(a.id).toBe("upi:3941"); // product-namespaced numeric id
    expect(a.source).toBe("NPCI");
    expect(a.category).toBe("circular");
    expect(a.title).toContain("Mandatory Brand Guidelines");
    expect(a.url).toBe(
      "https://www.npci.org.in/uploads/UPI_OC_No_100_B_FY_2026_27_Addendum_to_Mandatory_Brand_Guidelines_for_BHIM_UPI_Merchant_QR_e88d1b6cd2.pdf",
    );
    expect(a.publishedAt).toBe(NOW); // no per-item date in the API -> fetch-time fallback
  });

  it("returns [] for the 'Data not found' envelope (year with no items)", () => {
    const json = { status: 404, message: "Data not found", data: {} };
    expect(parseNpciResponse(json, "upi", BASE, 25, NOW)).toHaveLength(0);
  });

  it("respects topN", () => {
    const json = JSON.parse(fixture("npci_files.sample.json"));
    expect(parseNpciResponse(json, "upi", BASE, 1, NOW)).toHaveLength(1);
  });
});

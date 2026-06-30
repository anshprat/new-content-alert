import { describe, it, expect } from "vitest";
import { buildResendPayload } from "../src/notifiers/email";
import type { Item } from "../src/types";

const item: Item = {
  id: "RBI:13553",
  source: "RBI",
  category: "notification",
  title: 'Master Direction on "Credit" <Derivatives>',
  url: "https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=13553",
  publishedAt: "2026-06-25T00:00:00.000Z",
};

describe("buildResendPayload", () => {
  const p = buildResendPayload(item, "Monitor <alerts@example.com>", "grp@googlegroups.com");

  it("sets from, to (array), and a source-tagged subject", () => {
    expect(p.from).toBe("Monitor <alerts@example.com>");
    expect(p.to).toEqual(["grp@googlegroups.com"]);
    expect(p.subject.startsWith("[RBI] ")).toBe(true);
  });

  it("includes title, link and date in the text body (no summary)", () => {
    expect(p.text).toContain(item.title);
    expect(p.text).toContain(item.url);
    expect(p.text).toContain(item.publishedAt);
  });

  it("escapes HTML special characters in the html body", () => {
    expect(p.html).toContain("&quot;Credit&quot; &lt;Derivatives&gt;");
    expect(p.html).toContain(`href="${item.url}"`);
  });
});

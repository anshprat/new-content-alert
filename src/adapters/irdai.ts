import { parse } from "node-html-parser";
import type { AdapterContext, Item, SourceAdapter } from "../types";

/**
 * IRDAI's circulars page is a server-rendered Liferay table. Structure confirmed
 * live (see VERIFICATION.md):
 *   <tbody class="table-data">
 *     <tr>
 *       <td class="... table-col-shortDesc"> TITLE </td>
 *       <td class="... table-col-subTitle"><a href="...document-detail?documentId=NNN">Circular</a></td>
 *       <td class="... table-col-lastUpdated"> DD-MM-YYYY </td>
 *       ...
 * The dedup key is documentId. NOTE: the anchor text is "परिपत्र / Circular", NOT
 * the title — the title lives in the shortDesc cell. Nav links also use
 * document-detail but sit in `.dropdown-item` outside the table, so selecting
 * within `tbody.table-data tr` naturally excludes them.
 */

/** Bound CPU: parse only the data-rows region, not the ~500KB head full of scripts. */
function sliceTableRegion(html: string): string {
  const start = html.indexOf('<tbody class="table-data"');
  if (start < 0) return html;
  const endIdx = html.indexOf("</tbody>", start);
  const body = endIdx < 0 ? html.slice(start) : html.slice(start, endIdx + "</tbody>".length);
  return `<table>${body}</table>`;
}

function ddmmyyyyToIso(s: string, fallbackIso: string): string {
  const m = s.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t).toISOString() : fallbackIso;
  }
  const [, dd, mm, yyyy] = m;
  const t = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isFinite(t) ? new Date(t).toISOString() : fallbackIso;
}

function absolutize(href: string, pageUrl: string): string {
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return href;
  }
}

/** Pure parser (unit-tested against a live fixture). */
export function parseIrdaiListing(
  html: string,
  pageUrl: string,
  category: string,
  topN: number,
  nowIso: string,
): Item[] {
  const root = parse(sliceTableRegion(html));
  const rows = root.querySelectorAll("tr");
  const items: Item[] = [];

  for (const row of rows) {
    const link = row.querySelector('td.table-col-subTitle a[href*="documentId="]');
    if (!link) continue;
    const href = link.getAttribute("href") ?? "";
    const idMatch = href.match(/documentId=(\d+)/);
    if (!idMatch) continue;

    const title =
      row.querySelector("td.table-col-shortDesc")?.text.replace(/\s+/g, " ").trim() ?? "";
    if (!title) continue;

    const dateText = row.querySelector("td.table-col-lastUpdated")?.text.trim() ?? "";

    items.push({
      id: idMatch[1],
      source: "IRDAI",
      category,
      title,
      url: absolutize(href, pageUrl),
      publishedAt: ddmmyyyyToIso(dateText, nowIso),
    });
    if (items.length >= topN) break;
  }
  return items;
}

export const irdaiAdapter: SourceAdapter = {
  name: "IRDAI",
  async fetchLatest(ctx: AdapterContext): Promise<Item[]> {
    const nowIso = new Date().toISOString();
    const all: Item[] = [];
    for (const page of ctx.config.irdai.pages) {
      try {
        const html = await ctx.fetcher.fetchText(page.url);
        const items = parseIrdaiListing(html, page.url, page.category, ctx.config.topN, nowIso);
        ctx.log.info("irdai page parsed", { url: page.url, items: items.length });
        if (items.length === 0) {
          ctx.log.warn("irdai page yielded 0 rows — markup may have changed", { url: page.url });
        }
        all.push(...items);
      } catch (err) {
        ctx.log.error("irdai page failed", { url: page.url, error: String(err) });
      }
    }
    if (all.length === 0) throw new Error("IRDAI: all pages failed or yielded no rows");
    return all;
  },
};

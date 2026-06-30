import type { AdapterContext, Item, SourceAdapter } from "../types";

/**
 * NPCI is a React SPA backed by a Strapi JSON API (its old server-rendered HTML
 * with `.pdf-item` rows no longer exists). The real file-listing endpoint was
 * captured live by driving Chrome via CDP (see VERIFICATION.md):
 *
 *   GET /api/circulars/<product>?pageNum=1&year=<YYYY>&sort=desc&size=<n>&locale=en
 *     -> { status: 200, data: { pageNum, size, totalCount, files: [ … ] } }
 *
 *   file = { id, fileName, mediaType, isDownloadable, isViewable, yearLabel, media: { url } }
 *
 * The product is the path segment (no separate slug). There is no per-item date,
 * so publishedAt falls back to fetch time — dedup is by the stable numeric id.
 */

function absolutize(url: string, baseUrl: string): string {
  if (!url) return url;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

/** Pure parser of the file-listing response (unit-tested against a captured fixture). */
export function parseNpciResponse(
  json: unknown,
  product: string,
  baseUrl: string,
  topN: number,
  nowIso: string,
): Item[] {
  const data = (json as any)?.data;
  const files = Array.isArray(data?.files) ? data.files : [];
  const items: Item[] = [];

  for (const f of files.slice(0, topN)) {
    if (!f || typeof f !== "object") continue;
    const file = f as Record<string, any>;
    const title = typeof file.fileName === "string" ? file.fileName.trim() : "";
    const rawUrl = typeof file.media?.url === "string" ? file.media.url : "";
    if (!title || !rawUrl) continue;
    const id = file.id !== undefined && file.id !== null ? String(file.id) : rawUrl;
    items.push({
      id: `${product}:${id}`,
      source: "NPCI",
      category: "circular",
      title,
      url: absolutize(rawUrl, baseUrl),
      publishedAt: nowIso, // API exposes only a coarse FY label, not a date
    });
  }
  return items;
}

function buildUrl(baseUrl: string, product: string, year: number, size: number): string {
  const u = new URL(`/api/circulars/${encodeURIComponent(product)}`, baseUrl);
  u.searchParams.set("pageNum", "1");
  u.searchParams.set("year", String(year));
  u.searchParams.set("sort", "desc");
  u.searchParams.set("size", String(size));
  u.searchParams.set("locale", "en");
  return u.toString();
}

export const npciAdapter: SourceAdapter = {
  name: "NPCI",
  async fetchLatest(ctx: AdapterContext): Promise<Item[]> {
    const nowIso = new Date().toISOString();
    const cfg = ctx.config.npci;
    const byId = new Map<string, Item>();
    let anyOk = false;

    // product × year fan-out. Both years are queried so circulars are caught across
    // the rollover; results are merged and de-duped by id.
    for (const product of cfg.products) {
      for (const year of cfg.years) {
        const url = buildUrl(cfg.baseUrl, product, year, cfg.pageSize);
        try {
          const json = await ctx.fetcher.fetchJson(url);
          anyOk = true;
          const status = (json as any)?.status;
          if (status && status !== 200) {
            // e.g. {"status":404,"message":"Data not found"} for a year with no items — benign.
            continue;
          }
          for (const item of parseNpciResponse(json, product, cfg.baseUrl, ctx.config.topN, nowIso)) {
            if (!byId.has(item.id)) byId.set(item.id, item);
          }
        } catch (err) {
          ctx.log.error("npci request failed", { product, year, error: String(err) });
        }
      }
    }

    if (!anyOk) throw new Error("NPCI: all requests failed");
    const items = [...byId.values()];
    ctx.log.info("npci parsed", { products: cfg.products.length, years: cfg.years, items: items.length });
    return items;
  },
};

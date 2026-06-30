import type { AdapterContext, Item, NpciProduct, SourceAdapter } from "../types";

/**
 * NPCI is a React SPA backed by a Strapi JSON API (its old server-rendered HTML
 * with `.pdf-item` rows no longer exists). Confirmed live (see VERIFICATION.md):
 *
 *   GET /api/circulars/searchByName/?slug=<slug>&pageNum=1&size=<n>&sortBy=desc
 *     -> { status: 200, data: { files: [ ... ], totalCount, ... } }
 *
 * The per-product `slug` is the internal API key (fed from a separate dropdown
 * XHR; it is NOT reliably the URL segment) and must be captured once via browser
 * DevTools — until then the product is skipped, not errored. The `files[]` item
 * shape is mapped tolerantly across likely field names and should be re-checked
 * against a real response (steps in VERIFICATION.md).
 */

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

function toIso(s: string, fallbackIso: string): string {
  if (!s) return fallbackIso;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : fallbackIso;
}

function absolutize(url: string, baseUrl: string): string {
  if (!url) return url;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

/** Pure parser of the file-listing response (unit-tested against a synthetic fixture). */
export function parseNpciResponse(
  json: unknown,
  product: string,
  baseUrl: string,
  topN: number,
  nowIso: string,
): Item[] {
  const data = (json as any)?.data;
  const files = Array.isArray(data?.files) ? data.files : Array.isArray(data) ? data : [];
  const items: Item[] = [];

  for (const f of files.slice(0, topN)) {
    if (!f || typeof f !== "object") continue;
    const file = f as Record<string, unknown>;
    const title = pickString(file, ["title", "name", "fileName", "heading", "circularName"]);
    const url = absolutize(
      pickString(file, ["url", "fileUrl", "file", "link", "path", "documentUrl"]),
      baseUrl,
    );
    if (!title || !url) continue;
    const id =
      pickString(file, ["id", "documentId", "fileId", "circularId"]) || url;
    const date = pickString(file, [
      "publishedAt",
      "date",
      "circularDate",
      "uploadDate",
      "updatedAt",
      "createdAt",
    ]);
    items.push({
      id: `${product}:${id}`,
      source: "NPCI",
      category: "circular",
      title,
      url,
      publishedAt: toIso(date, nowIso),
    });
  }
  return items;
}

function buildUrl(baseUrl: string, listPath: string, p: NpciProduct, size: number, sortBy: string): string {
  const u = new URL(listPath, baseUrl);
  u.searchParams.set("slug", p.slug);
  u.searchParams.set("pageNum", "1");
  u.searchParams.set("size", String(size));
  u.searchParams.set("sortBy", sortBy);
  return u.toString();
}

export const npciAdapter: SourceAdapter = {
  name: "NPCI",
  async fetchLatest(ctx: AdapterContext): Promise<Item[]> {
    const nowIso = new Date().toISOString();
    const cfg = ctx.config.npci;
    const configured = cfg.products.filter((p) => p.slug.trim().length > 0);

    if (configured.length === 0) {
      // Expected state until slugs are captured — benign, not a failure.
      ctx.log.warn("NPCI not configured: no product slugs set; skipping (see VERIFICATION.md)");
      return [];
    }

    const all: Item[] = [];
    let anyOk = false;
    for (const p of configured) {
      const url = buildUrl(cfg.baseUrl, cfg.listPath, p, cfg.pageSize, cfg.sortBy);
      try {
        const json = await ctx.fetcher.fetchJson(url);
        if ((json as any)?.status && (json as any).status !== 200) {
          ctx.log.warn("npci product returned non-200 envelope", {
            product: p.product,
            status: (json as any).status,
          });
          anyOk = true; // endpoint reachable; just no data for this slug
          continue;
        }
        const items = parseNpciResponse(json, p.product, cfg.baseUrl, ctx.config.topN, nowIso);
        ctx.log.info("npci product parsed", { product: p.product, items: items.length });
        all.push(...items);
        anyOk = true;
      } catch (err) {
        ctx.log.error("npci product failed", { product: p.product, error: String(err) });
      }
    }
    if (!anyOk) throw new Error("NPCI: all configured products failed");
    return all;
  },
};

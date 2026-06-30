import { XMLParser } from "fast-xml-parser";
import type { AdapterContext, Item, SourceAdapter } from "../types";

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  // CDATA (RBI wraps title/description in CDATA) is returned as plain text.
  cdataPropName: false as unknown as string,
});

/** RBI item identity is the numeric Id/prid in the link; fall back to the URL. */
function ridFromLink(link: string): string {
  const m = link.match(/[?&](?:Id|prid)=(\d+)/i);
  return m ? m[1] : link;
}

function toIso(pubDate: unknown, fallbackIso: string): string {
  if (typeof pubDate !== "string" || !pubDate.trim()) return fallbackIso;
  const t = Date.parse(pubDate);
  return Number.isFinite(t) ? new Date(t).toISOString() : fallbackIso;
}

function text(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return "";
}

/**
 * Parse one RBI RSS feed into normalized Items (pure; unit-tested against a live
 * fixture). Caps at `topN` — change detection only needs the newest entries.
 */
export function parseRssItems(
  xml: string,
  category: string,
  topN: number,
  nowIso: string,
): Item[] {
  const doc = parser.parse(xml) as any;
  const channel = doc?.rss?.channel ?? doc?.channel;
  let raw = channel?.item ?? [];
  if (!Array.isArray(raw)) raw = raw ? [raw] : [];

  const items: Item[] = [];
  for (const it of raw.slice(0, topN)) {
    const url = text(it?.link);
    const title = text(it?.title);
    if (!url || !title) continue;
    items.push({
      id: ridFromLink(url),
      source: "RBI",
      category,
      title,
      url,
      publishedAt: toIso(it?.pubDate, nowIso),
    });
  }
  return items;
}

export const rbiAdapter: SourceAdapter = {
  name: "RBI",
  async fetchLatest(ctx: AdapterContext): Promise<Item[]> {
    const nowIso = new Date().toISOString();
    const all: Item[] = [];
    // Feeds are independent: one failing feed must not lose the others.
    for (const feed of ctx.config.rbi.feeds) {
      try {
        const xml = await ctx.fetcher.fetchText(feed.url);
        const items = parseRssItems(xml, feed.category, ctx.config.topN, nowIso);
        ctx.log.info("rbi feed parsed", { url: feed.url, items: items.length });
        all.push(...items);
      } catch (err) {
        ctx.log.error("rbi feed failed", { url: feed.url, error: String(err) });
      }
    }
    if (all.length === 0) throw new Error("RBI: all feeds failed or empty");
    return all;
  },
};

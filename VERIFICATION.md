# Verification — live vs. assumed

The brief required confirming endpoints/markup at build time rather than assuming
them. This records exactly what was checked live, what is assumed, and what to
re-check when a source changes. Verified on **2026-06-30**.

## Summary

| Source | Surface | Status | Dedup key | Notes |
|---|---|---|---|---|
| RBI | `notifications_rss.xml` | ✅ Verified live | numeric `Id` | RSS 2.0, items current (24–29 Jun 2026). |
| RBI | `pressreleases_rss.xml` | ✅ Verified live | numeric `prid` | RSS 2.0, current (30 Jun 2026). |
| IRDAI | `/circulars` | ✅ Verified live | `documentId` | Server-rendered Liferay table; parser written against captured HTML. |
| NPCI | `/api/circulars/<product>` | ✅ Verified live (CDP) | `product:fileId` | React SPA + Strapi JSON API; real endpoint + item shape captured via headless Chrome. |
| robots.txt (all) | `/robots.txt` | ⚠️ See "robots.txt" | — | RBI 418; IRDAI/NPCI disallow unnamed bots. Deviation accepted (below). |

## RBI — RSS (verified)

- Both feeds returned HTTP 200 with current items.
- Item fields present: `title` (CDATA), `description` (CDATA HTML — **not used**, we
  never fetch/parse content), `link`, `pubDate` (RFC-822). **No `guid`.**
- Link formats (the dedup key is the numeric id in the link):
  - Notifications: `https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=<n>&Mode=0`
  - Press releases: `https://www.rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=<n>`
- **Assumed:** `pubDate` is IST; we store the parsed `Date` as ISO. If a feed omits
  `pubDate`, we fall back to fetch time.
- Captured fixtures: `test/fixtures/rbi_notifications.xml`, `rbi_pressreleases.xml`
  (parser is unit-tested against them).
- The brief's fallback (Liferay `website.rbi.org.in`) was **not needed** — the legacy
  `www.rbi.org.in` feeds are live. If they are ever deprecated, add an HTML adapter for
  the `website.rbi.org.in` notifications listing.

## IRDAI — HTML listing (verified)

- `/circulars` returned HTTP 200, fully server-rendered (a browser-like `User-Agent`
  was used to capture). Structure (captured in `test/fixtures/irdai_circulars.html`):
  ```
  <tbody class="table-data">
    <tr>
      <td class="… table-col-shortDesc">  TITLE  </td>
      <td class="… table-col-subTitle"><a href="…document-detail?documentId=NNN">परिपत्र / Circular</a></td>
      <td class="… table-col-lastUpdated"> DD-MM-YYYY </td>
      …
  ```
- **Gotchas handled (and unit-tested):**
  - The `documentId` anchor text is the literal "परिपत्र / Circular", **not** the
    title — the title is in the `table-col-shortDesc` cell.
  - Navigation menu links also use `document-detail` but live in `.dropdown-item`
    **outside** `tbody.table-data`, so they are correctly excluded.
  - Dates are `DD-MM-YYYY`; parsed to ISO (UTC midnight), with fetch-time fallback.
- **Re-check if markup changes:** the cell class names (`table-col-shortDesc`,
  `table-col-subTitle`, `table-col-lastUpdated`) and the `tbody.table-data` anchor.
  Adapter logs a warning if a page yields 0 rows.
- `/rules` and `/regulations` are the same portlet; left commented in config to enable
  after a quick confirm.

## NPCI — JSON API (shape verified; per-product slug pending)

The brief assumed a static HTML listing. **That is no longer true.** Findings:

- NPCI is a **React SPA** (`/static/js/main.*.js`) backed by a **Strapi** JSON API.
  A plain fetch of `/circulars/<product>` returns only the JS shell — there are **no
  server-rendered rows**, so the commonly-referenced `.pdf-item` HTML scraping
  approach no longer works.
- Circular pages are split across ~12 product surfaces (UPI, IMPS, RuPay, NACH, NETC,
  AePS, NFS, CTS, BBPS, *99#, BHIM-Aadhaar, e-RUPI) — there is no single listing.
- **Confirmed file-listing endpoint (captured live by driving headless Chrome via the
  Chrome DevTools Protocol):**
  ```
  GET /api/circulars/<product>?pageNum=1&year=<YYYY>&sort=desc&size=<n>&locale=en
    -> { status: 200, data: { pageNum, size, totalCount, files: [ … ] } }
  ```
  - The **product is the path segment** (`upi`, `imps`, `rupay`, `nach`, `netc`, `aeps`,
    `others`, …) — there is **no separate slug**. (Earlier `slug`-based guesses returned
    `{"status":404,"message":"Data not found"}` because the listing endpoint is path-based
    and the required `year`/`sort`/`locale` params were missing.)
  - `year` is **required**; the SPA defaults to the latest year that has data (e.g. `others`
    showed `2025`, others `2026`). The adapter queries **current + previous calendar year**
    per product and merges, so new circulars are caught across the year rollover.
  - Confirmed `files[]` item shape:
    ```json
    { "id": 3941, "fileName": "UPI | OC No. 100B | FY 2026-27 …", "mediaType": "pdf",
      "isDownloadable": true, "isViewable": true, "yearLabel": "FY 26-27",
      "media": { "url": "/uploads/UPI_OC_No_100_B_…_e88d1b6cd2.pdf" } }
    ```
    → `id` = numeric (dedup key, namespaced `product:id`); `fileName` = title;
    `media.url` = link (relative → absolutised). **No per-item date field** — only a coarse
    `yearLabel`, so `publishedAt` falls back to fetch time (dedup is by id).
- **Capture method (reproducible):** `scripts/capture-npci-endpoint.mjs` launches Chrome
  `--headless=new` with `--remote-debugging-port`, attaches over CDP, enables the `Network`
  domain, navigates each `/circulars/<product>` page, and records the `/api/circulars/…`
  XHR the SPA fires. Re-run it if NPCI's API changes.
- **Re-check if NPCI changes:** the path shape, the `year/sort/size/locale` params, and the
  `fileName` / `media.url` fields. The adapter logs per-request failures and continues.

## robots.txt — checked, deviation accepted

- **RBI** `/robots.txt`: returned HTTP **418** (bot challenge) and could not be read,
  though the RSS feeds themselves serve fine. Re-check at build time.
- **IRDAI** `/robots.txt`: `User-agent: * → Disallow: /` (disallows all unnamed bots).
- **NPCI** `/robots.txt`: allows only named search/AI bots; `Disallow: /` for everyone
  else. Internet Archive explicitly blocked.

**Decision (owner-approved):** poll all three anyway, as a **low-volume, hourly,
top-N-only, no-PDF** personal monitor of public regulatory notices, with a descriptive
`User-Agent`. This is a deliberate, documented deviation from IRDAI/NPCI robots.txt. To
honour robots.txt strictly instead, set `ENABLED_SOURCES = "RBI"`.

> Manners note: the configured `USER_AGENT` is descriptive (identifies the monitor).
> NPCI's API may only return data to browser-like clients; if so, the adapter logs and
> skips rather than spoofing a browser. Pacing is hourly with per-request timeout, retry
> with backoff, and jitter.

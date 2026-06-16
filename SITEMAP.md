# Sitemap & robots.txt — How It Works

This document explains how the ISII sitemap is generated, served, and kept up to
date automatically, plus how `robots.txt` is handled per environment.

It spans both repos:

- **isii-backend** — generates and serves `/sitemap.xml`
- **isii-frontend** — generates `robots.txt` at build time

---

## 1. The core idea

The sitemap is **not a stored file**. There is no `sitemap.xml` sitting in S3.

Instead, it is **generated on demand from the database** every time it is
requested (and then cached at CloudFront for one hour). The database is the
single source of truth, so the sitemap always reflects the current content.

This is the key difference from the old setup:

| | Old (static) | New (dynamic) |
|---|---|---|
| Where it lives | a file in S3 | nowhere — built on request |
| Updating it | hand-edit the file | automatic, from the DB |
| New articles | never appeared | appear automatically |

---

## 2. What the sitemap contains

1. **Static pages** — the fixed frontend routes (home, about, people,
   capabilities, etc.). Maintained as a list in `utils/buildSitemap.js`
   (`STATIC_PATHS`).
2. **Articles** (Pivotal Thinking) — each article's PDF, as an on-domain URL.
3. **Reports** (Perspectives) — each report's PDF.
4. **News** (Press & News) — only items with an uploaded file on our domain.
   News that links to an external site is **skipped** (a sitemap may only list
   URLs on its own domain).

All content URLs are emitted on the canonical domain, e.g.
`https://www.isii.global/files/pivotal-thinking/<slug>.pdf`, with a `<lastmod>`
date from the record's `updatedAt`/`createdAt`.

> Note: articles are served as **PDFs**, not dedicated HTML pages. They get
> indexed by Google as `[PDF]` results. Building HTML article pages (better
> ranking) is a possible future upgrade — see §10.

---

## 3. Request flow

```
        Google / browser requests  https://<site>/sitemap.xml
                          │
                          ▼
                    ┌───────────┐
                    │ CloudFront │  ← checks its cache
                    └───────────┘
                     │           │
        cache HIT ◄──┘           └──► cache MISS / expired
        (within 1h)                        │
        serve cached copy                  ▼
        (backend NOT touched)        ┌──────────────┐
                                     │ API Gateway   │
                                     │   → Lambda    │   routes/sitemap.js
                                     └──────────────┘
                                            │
                                            ▼
                                    queries MongoDB
                                (articles + reports + news)
                                            │
                                            ▼
                                  buildSitemap.js builds XML
                                            │
                                            ▼
                          returns XML + Cache-Control: max-age=3600
                                            │
                                            ▼
                          CloudFront caches it (1h) and returns it
```

- **Cache MISS** (first request, or after 1 hour): the request reaches the
  Lambda, which queries the DB and builds the XML fresh.
- **Cache HIT** (any request within the hour): CloudFront serves the stored
  copy; the Lambda does not run and the DB is not queried.

There is **no cron/timer**. Generation is lazy — it happens on the next request
after the cache expires (usually triggered by a search-engine crawler).

---

## 4. How it auto-updates

Because the builder always reads the **live database**, any content change is
picked up the next time the sitemap is rebuilt. The 1-hour cache only controls
how often that rebuild happens.

Example timeline:

```
10:00  Crawler requests sitemap → cache empty → Lambda builds it (40 articles)
       → cached until 11:00
10:15  You publish article #41 → saved to MongoDB
       (sitemap still shows 40 — cached copy not yet expired)
11:00  Cache expires
11:05  Next request → cache MISS → Lambda rebuilds from DB → now 41 articles
       → cached until 12:05
```

So a newly published article appears **automatically within ~1 hour**. No manual
step.

**Want it instant?** Run a CloudFront invalidation on `/sitemap.xml` (manually,
or automatically on publish). This clears the cache immediately so the next
request rebuilds with the new content. Not required for SEO.

---

## 5. Implementation (backend)

| File | Responsibility |
|---|---|
| `routes/sitemap.js` | Queries articles/reports/news (`.lean()`), assembles items, returns XML with a 1-hour `Cache-Control`. |
| `utils/buildSitemap.js` | Holds the `STATIC_PATHS` list and assembles the final XML (escaping, `<lastmod>`). |
| `utils/sitemapUrls.js` | Converts a stored raw-S3 or already-masked file URL into an on-domain `/files/<key>` URL. Mirrors the frontend's `getMaskedFileUrl`. Returns `null` for external/unresolvable URLs so they are skipped. |
| `api/sitemap/index.js` | Lambda entry — wraps the route with `createServiceApp` (DB connection + handler). |
| `serverless.yml` | Declares the `sitemap` function on `GET /sitemap.xml` and the `SITE_BASE_URL` env var. |

---

## 6. Configuration

The sitemap builds URLs from two environment variables:

| Variable | Purpose | Staging | Production |
|---|---|---|---|
| `SITE_BASE_URL` | Canonical site domain used for **all** sitemap URLs (so they satisfy the same-domain rule). | `https://staging.isii.global` | `https://www.isii.global` (default) |
| `PUBLIC_FILES_BASE_URL` | Used only to derive the `/files` path segment. | `https://d1gbpolz5fkmu.cloudfront.net/files` | `https://www.isii.global/files` |

`SITE_BASE_URL` is intentionally separate from `PUBLIC_FILES_BASE_URL` because on
some environments `PUBLIC_FILES_BASE_URL` points at the raw CloudFront domain,
which is **not** the canonical domain the sitemap must use.

Where it is set:

- **serverless.yml** defaults `SITE_BASE_URL` to `https://www.isii.global`
  (correct for production with no extra config).
- **Staging** overrides it: set in `.github/workflows/deploy-staging.yml`
  (CI) and `.env.staging` (local deploys).

---

## 7. CloudFront setup (per environment)

To serve the dynamic sitemap at `https://<site>/sitemap.xml`, CloudFront must
route that path to the backend API instead of S3.

**Origin** (create if it doesn't exist):

- Origin domain: the environment's API Gateway host
  - Staging: `usmp97gg65.execute-api.us-east-1.amazonaws.com`
  - Production: `6qtz2ej9na.execute-api.us-east-1.amazonaws.com`
- Protocol: HTTPS only, TLSv1.2, origin path empty.

**Behavior:**

- Path pattern: `/sitemap.xml`
- Origin: the API Gateway origin above
- Allowed methods: GET, HEAD
- Cache policy: `CachingOptimized` (honors the backend's 1-hour `Cache-Control`)
- Origin request policy: `AllViewerExceptHostHeader`

> **Gotcha:** API Gateway returns **403** if CloudFront forwards its `Host`
> header. The `AllViewerExceptHostHeader` policy strips it — this is required.

**After any behavior/origin change, invalidate `/sitemap.xml`** — otherwise
CloudFront keeps serving the previously cached object and the change looks like
it didn't work.

Distributions:

- Staging: `E35PX9JBYDU87M`
- Production: (production distribution id)

---

## 8. robots.txt (frontend, per environment)

`robots.txt` is generated at **build time** by a small Vite plugin in
`isii-frontend/vite.config.ts` — there is no static `public/robots.txt`.

| Build | Output | Why |
|---|---|---|
| `npm run build:production` | `Allow: /` + `Sitemap: https://www.isii.global/sitemap.xml` | The real site should be crawled and indexed. |
| `npm run build:staging` (and dev) | `User-agent: *` / `Disallow: /` | Keep non-production out of search engines (avoids duplicate content and the wrong site appearing in results). |

This removes the risk of one shared file being misconfigured for the wrong
environment. Each environment gets the correct file automatically on deploy.

---

## 9. Deployment checklist

**Staging** (done):

1. Deploy backend to staging (adds `/sitemap.xml` route + `SITE_BASE_URL`).
2. Add the CloudFront behavior on `E35PX9JBYDU87M` (see §7).
3. Invalidate `/sitemap.xml`.
4. Verify: `curl -sI https://staging.isii.global/sitemap.xml` → `200`,
   `content-type: application/xml`.

**Production:**

1. Deploy backend to production (no `SITE_BASE_URL` needed — default is correct).
2. Add the CloudFront behavior on the production distribution (production API
   origin).
3. Invalidate `/sitemap.xml`.
4. Verify on `https://www.isii.global/sitemap.xml`.
5. Submit `https://www.isii.global/sitemap.xml` in Google Search Console.
   **Do not** submit the staging sitemap.

---

## 10. Maintenance & future work

- **Adding a new static page:** add its path to `STATIC_PATHS` in
  `utils/buildSitemap.js`. (Articles/reports/news are automatic — only fixed
  pages are manual.)
- **Articles are PDFs:** they index as `[PDF]` results. For stronger ranking and
  nicer search listings, build HTML article pages (e.g.
  `/capabilities/pivotal-thinking/content-library/:slug`) and list those instead
  of the PDFs. This is a larger change (routes, per-article meta tags,
  prerendering) and is optional.

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Sitemap shows old content after a change | CloudFront serving a cached copy | Invalidate `/sitemap.xml` |
| `403` from `/sitemap.xml` | CloudFront forwarding the `Host` header to API Gateway | Use the `AllViewerExceptHostHeader` origin request policy |
| URLs use the wrong domain | `SITE_BASE_URL` not set for that environment | Set `SITE_BASE_URL` (CI env + `.env`) |
| A news item is missing | It links to an external site (skipped) or has no uploaded file | Expected behavior |
| Browser still shows old version, curl shows new | Browser cache | Hard refresh, or trust `curl` |

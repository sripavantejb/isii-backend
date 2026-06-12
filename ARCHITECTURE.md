# ISII Platform — Architecture

Architecture overview for engineers who need to understand how the ISII platform
fits together — request flows, the file/URL model, environment isolation, and the
Vercel→AWS migration — without reading the whole codebase.

For deploy mechanics and CI/CD config, see [`DEPLOYMENT_FLOW.md`](./DEPLOYMENT_FLOW.md).

> **Doc status:** flows + URL model + environments + migration are written.
> AWS-service sections marked _📸 screenshot_ are pending a visual pass.

---

## 1. Overview

Three tiers, fully on AWS:

- **Edge / CDN** — one **CloudFront** distribution per environment, two behaviors:
  `Default(*)` serves the SPA, `/files/*` serves uploaded assets. Both origins are
  private S3 buckets (Block Public Access on), reachable only through CloudFront.
- **API** — **API Gateway (httpApi)** → 5 **Lambda** handlers (`auth`, `articles`,
  `news`, `reports`, `upload`). The existing Express app is adapted to Lambda via
  `serverless-http`. Stateless; the active environment is determined entirely by the
  Lambda's env vars (`AWS_S3_BUCKET`, `PUBLIC_FILES_BASE_URL`, `MONGODB_URI`).
- **Data** — **MongoDB Atlas**, one database per environment (`isii-<env>`).

```
                        ┌──────────── CloudFront (per env) ────────────┐
   Browser ──────────►  │  Default(*) → S3 isii-frontend-<env>  (SPA)  │
                        │  /files/*   → S3 isii-files-<env>   (assets) │
                        └───────────────────────────────────────────────┘
       │
       │ XHR (VITE_API_URL)
       ▼
   API Gateway ─► Lambda (auth | articles | news | reports | upload) ─► MongoDB Atlas
```

---

## 2. Request flows

### 2.1 SPA delivery
```
Browser → CloudFront Default(*) → S3 isii-frontend-<env> → React bundle
```
The frontend is a static Vite build in S3; CloudFront fronts it for caching and to
keep the bucket private.

### 2.2 Data read/write
```
React → API Gateway (httpApi) → <resource> Lambda → MongoDB Atlas → JSON
```
Each resource is an independent Lambda (cold-start on demand, no always-on server).

### 2.3 File upload (admin)
```
Admin form → upload Lambda → PutObject → S3 isii-files-<env>/<key>
                           → returns raw S3 URL → persisted on the document in Mongo
```
The object key is **env-prefix-free** (`images/<file>`, `pivotal-thinking/<file>`).
The environment boundary is the **bucket**, not a folder.

### 2.4 Asset read (the URL contract)
```
Mongo stores canonical raw-S3:   https://s3.ap-south-2.amazonaws.com/isii-files-<env>/<key>
        │  getMaskedFileUrl() at render time
        ▼
Browser requests:                https://<env-cloudfront>/files/<key>
        │  CloudFront /files/* behavior + CloudFront Function strips "/files"
        ▼
Origin fetch:                    S3 isii-files-<env>/<key>
```
Buckets are private, so assets are reachable **only** via CloudFront. We persist the
real S3 location but always hand the browser a CloudFront URL. See §6.

---

## 3. AWS services (reference)

| Service              | Role in ISII                                                        |
| -------------------- | ------------------------------------------------------------------- |
| S3                   | Stores the SPA build and uploaded assets (per-env buckets)          |
| CloudFront           | CDN + single public entry point in front of the private buckets     |
| CloudFront Function  | Viewer-request rewrite that strips the `/files` prefix              |
| Lambda               | Runs the Express API (via `serverless-http`), one fn per resource   |
| API Gateway (httpApi)| HTTP front for the Lambdas                                          |
| MongoDB Atlas        | Application database, one per environment                           |

> 📸 _Screenshot: AWS console landing showing the services in use (optional)._

---

## 4. CloudFront + S3

One distribution per environment, two behaviors evaluated by precedence:

| Precedence | Path pattern | Origin                  | Serves            |
| ---------- | ------------ | ----------------------- | ----------------- |
| 0          | `/files/*`   | `isii-files-<env>`      | uploaded assets   |
| 1          | `Default(*)` | `isii-frontend-<env>`   | the SPA           |

- **Why a path-strip Function:** CloudFront forwards the *matched* path to the
  origin, so `/files/pivotal-thinking/x.pdf` would request key
  `files/pivotal-thinking/x.pdf` from S3. A **viewer-request CloudFront Function**
  removes the leading `/files`, mapping the request to the real key at the bucket root.
- **Private origins:** buckets keep Block Public Access on; a bucket policy grants
  `s3:GetObject` only to the CloudFront distribution (OAC / `AWS:SourceArn`). Direct
  S3 URLs return 403 — by design.

> 📸 _Screenshot: CloudFront → Behaviors (the two rows above)._
> 📸 _Screenshot: CloudFront → Origins (frontend + files origins)._
> 📸 _Screenshot: CloudFront → Functions (the strip-`/files` function code)._

---

## 5. S3 setup

Buckets (region `ap-south-2`):

| Bucket                         | Purpose                          |
| ------------------------------ | -------------------------------- |
| `isii-files-dev/staging/prod`  | uploaded assets, per environment |
| `isii-frontend-dev/...`        | SPA build, per environment       |
| `www.isii.global`              | shared static design assets       |

- **Block Public Access: ON** for the files buckets.
- **Bucket policy** allows only CloudFront (`cloudfront.amazonaws.com`, scoped to the
  distribution ARN) to `GetObject`.
- Content sits at the **bucket root** (no `dev/`/`staging/`/`prod/` folder).

> 📸 _Screenshot: S3 → bucket list (the per-env buckets)._
> 📸 _Screenshot: S3 → isii-files-staging → Permissions → bucket policy._
> 📸 _Screenshot: S3 → bucket → objects at root (images/, pivotal-thinking/, ...)._

---

## 6. How URLs work

**Canonical stored form = raw S3.** The DB always holds:
```
https://s3.ap-south-2.amazonaws.com/isii-files-<env>/<key>
```
The frontend converts it to a public CloudFront URL **only at render time** via
`getMaskedFileUrl()`:
```
raw S3   https://s3.ap-south-2.amazonaws.com/isii-files-staging/images/abc.jpg
masked   https://d1gbpolz5fkmu.cloudfront.net/files/images/abc.jpg
served   S3 isii-files-staging/images/abc.jpg   (Function stripped "/files")
```

Design rules:
- **Bucket = environment.** No env folder in the key; switching env = switching bucket.
- **`/files` is a behavior selector**, not part of the key — added on the way out,
  stripped before the origin.
- **Resilience:** `getMaskedFileUrl` also strips any legacy `dev/`/`staging/`/`prod/`
  segment, so both migrated and not-yet-migrated URLs resolve to the current env's CDN.
- **Rule of thumb:** any stored file URL must pass through `getMaskedFileUrl` before
  it is displayed (public pages, admin dashboards, and form previews all do).

Legacy → current mapping (handled by `scripts/migrateBucketUrls.js`):
```
…/www.isii.global/<env>/<path>   →   …/isii-files-<env>/<path>
```

---

## 7. Environments

| Item                 | dev                             | staging                         | production            |
| -------------------- | ------------------------------- | ------------------------------- | --------------------- |
| Deploys on branch    | _(local only)_                  | `staging`                       | `main`                |
| Files bucket         | `isii-files-dev`                | `isii-files-staging`            | `isii-files-prod`     |
| Files CloudFront     | `d3eiydz39dyooe.cloudfront.net` | `d1gbpolz5fkmu.cloudfront.net`  | _not created yet_     |
| Mongo database       | `isii-dev`                      | `isii-staging`                  | `isii-prod`           |

**Staging walkthrough.** A request in staging is fully isolated by config — the
frontend builds with `.env.staging` (`VITE_API_URL`, `VITE_PUBLIC_FILES_BASE_URL`=
staging CloudFront); the API Lambda runs with `AWS_S3_BUCKET=isii-files-staging`,
`PUBLIC_FILES_BASE_URL=…d1gbpolz5fkmu…`, `MONGODB_URI=…/isii-staging`. An upload
therefore lands in `isii-files-staging` and is read back through the staging
distribution — never crossing into dev or prod.

> Static design assets are **shared** across envs (not segregated); see
> `VITE_STATIC_ASSET_BASE_URL`.

---

## 8. Migration: Vercel → AWS Lambda

| Concern        | Before (Vercel)              | After (AWS)                                   |
| -------------- | ---------------------------- | --------------------------------------------- |
| Frontend       | Vercel hosting               | S3 + CloudFront                               |
| Backend        | Vercel serverless functions  | AWS Lambda (Serverless Framework) + API GW    |
| Express app    | ran on Vercel                | unchanged code, wrapped by `serverless-http`  |
| Files          | legacy `isii-v2` (ap-south-1)| per-env `isii-files-<env>` (ap-south-2) + CDN |

The Express app was **not rewritten** — `createLambdaHandler.js` wraps it with
`serverless-http`, and `serverless.yml` maps each resource to a Lambda behind
API Gateway. `vercel.json` was removed from both repos.

---

## 9. CI/CD (summary)

Push `staging`→ staging, push `main`→ production; GitHub Actions with OIDC role
assumption (no static keys). Backend: `serverless deploy`. Frontend: `vite build`
→ `aws s3 sync` → CloudFront invalidation. Full detail and the required
secrets/vars are in [`DEPLOYMENT_FLOW.md`](./DEPLOYMENT_FLOW.md).

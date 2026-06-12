# ISII — Deployment & Runtime Flow

End-to-end reference for how the ISII platform is built, runs, and deploys on AWS.
Covers **both** repos:

- `isii-backend` — Express API on AWS Lambda (Serverless Framework) + API Gateway
- `isii-frontend` — Vite SPA on S3 + CloudFront

> This consolidates `BACKEND_AWS_LAMBDA_DEPLOYMENT.md` and
> `FRONTEND_DEPLOYMENT_S3_CLOUDFRONT.md`.

---

## 1. Migration: Vercel → AWS

| Concern        | Old (Vercel)                     | New (AWS)                                                        |
| -------------- | -------------------------------- | --------------------------------------------------------------- |
| Frontend       | Vercel hosting                   | **S3** static site behind **CloudFront**                        |
| Backend        | Vercel serverless (`vercel.json`)| **AWS Lambda** (Serverless Framework) + **API Gateway** (httpApi)|
| Express app    | ran on Vercel                    | wrapped by `serverless-http` in `createLambdaHandler.js`        |
| Uploaded files | legacy `isii-v2` bucket (ap-south-1) | per-env **S3** `isii-files-<env>` (ap-south-2) via **CloudFront** |
| Static assets  | raw S3 (`www.isii.global`)       | **CloudFront** (`VITE_STATIC_ASSET_BASE_URL`)                   |
| Database       | MongoDB Atlas                    | MongoDB Atlas (unchanged)                                       |

`vercel.json` has been removed from both repos — the Vercel path is fully retired.

---

## 2. Runtime request flow

```
                       ┌──────────────── CloudFront (per env) ─────────────────┐
 Browser ── GET / ───► │  Default (*)  → S3  isii-frontend-<env>   (the SPA)    │
                       │  /files/*     → S3  isii-files-<env>      (uploads)    │
                       └────────────────────────────────────────────────────────┘
    │
    ├─ API calls (VITE_API_URL) ─► API Gateway ─► Lambda {auth, articles, news,
    │                                              reports, upload} ─► MongoDB Atlas
    │
    ├─ File UPLOAD ─► upload Lambda ─► S3 isii-files-<env>/<key>   (key has NO env prefix)
    │                                  └─ stores the raw S3 URL in MongoDB
    │
    └─ File READ ─► getMaskedFileUrl() rewrites the stored raw-S3 URL to
                    https://<env-cf>/files/<key> ─► CloudFront strips "/files"
                    ─► S3 isii-files-<env>/<key>
```

The `/files/*` CloudFront behavior uses a **CloudFront Function** to strip the
`/files` prefix and serve from the **bucket root** — which is why object keys no
longer carry a `dev/`/`staging/`/`prod/` folder.

---

## 3. Environments

| Item                     | dev                              | staging                              | production                          |
| ------------------------ | -------------------------------- | ------------------------------------ | ----------------------------------- |
| Git branch (deploys on)  | _(local only)_                   | `staging`                            | `main`                              |
| Files bucket             | `isii-files-dev`                 | `isii-files-staging`                 | `isii-files-prod`                   |
| Files CloudFront         | `d3eiydz39dyooe.cloudfront.net`  | `d1gbpolz5fkmu.cloudfront.net`       | **not created yet**                 |
| Frontend bucket          | `isii-frontend-dev`              | `isii-frontend-staging-639920117892` | `isii-frontend-prod`                |
| MongoDB database         | `isii-dev`                       | `isii-staging`                       | `isii-prod`                         |
| S3 region                | `ap-south-2`                     | `ap-south-2`                         | `ap-south-2`                        |
| Lambda deploy region     | _(n/a)_                          | `us-east-1`                          | `us-east-1`                         |

Static assets are **shared across all envs** (not segregated) and served via
`d1gbpolz5fkmu.cloudfront.net/files/isii-static` (`VITE_STATIC_ASSET_BASE_URL`).

---

## 4. File storage model

- One **bucket per environment**: `isii-files-<env>`, content at the **root**
  (`images/…`, `pivotal-thinking/…`, `press-and-news/…`, `pdfs/…`).
- **No env-folder prefix** on keys — `getStageUploadPrefix()` in
  `utils/fileSlug.js` returns `''`; the environment is decided by *which bucket*
  (`AWS_S3_BUCKET`) the request targets.
- **Stored format in MongoDB = raw S3 URL**:
  `https://s3.ap-south-2.amazonaws.com/isii-files-<env>/<key>`
- The frontend masks that to CloudFront at render time via
  `getMaskedFileUrl()` (`src/lib/fileUrls.ts`). It also strips any leftover
  `dev/`/`staging/`/`prod/` folder, so legacy + migrated URLs both resolve.
- **Every displayed file URL must go through `getMaskedFileUrl`** (public pages,
  admin dashboards, and form previews all do).

### Migrating stored URLs (old shared bucket → per-env buckets)

`scripts/migrateBucketUrls.js` rewrites
`…/www.isii.global/<env>/<path>` → `…/isii-files-<env>/<path>` and repairs
malformed "missing-bucket" URLs. Idempotent; run once per environment DB.

```bash
# DEV  (.env → isii-dev)
node scripts/migrateBucketUrls.js                       # dry run
APPLY_CHANGES=true node scripts/migrateBucketUrls.js    # apply

# STAGING  (.env.staging → isii-staging)
ENV_FILE=.env.staging node scripts/migrateBucketUrls.js
ENV_FILE=.env.staging APPLY_CHANGES=true node scripts/migrateBucketUrls.js

# PROD  (no .env.production → pass values explicitly)
MONGODB_URI="<isii-prod uri>" OLD_PREFIX=prod NEW_BUCKET=isii-files-prod \
  APPLY_CHANGES=true node scripts/migrateBucketUrls.js
```

---

## 5. CI/CD flow (GitHub Actions)

Both repos authenticate to AWS with **OIDC role assumption**
(`permissions: id-token: write`, `role-to-assume: ${{ secrets.AWS_ROLE_ARN }}`)
— no long-lived keys in CI. Trigger: push to `staging` → staging; push to
`main` → production (plus `workflow_dispatch`).

### Backend (`isii-backend/.github/workflows/deploy-*.yml`)

```
push staging ─► checkout ─► npm ci ─► assume AWS role ─► npm run deploy:staging
                                                          └─ serverless deploy --stage staging --region us-east-1
```

Serverless reads env vars via `${env:...}` in `serverless.yml` and bakes them
into the Lambda environment. **A config change only takes effect after a
redeploy.** Functions: `auth`, `articles`, `news`, `reports`, `upload` (httpApi).

### Frontend (`isii-frontend/.github/workflows/deploy-*.yml`)

```
push staging ─► npm ci ─► npm run build:staging ─► assume role
             ─► aws s3 sync dist/ s3://$S3_BUCKET_NAME --delete
             ─► aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*"
```

`build:staging` = `vite build --mode staging`, baking in `.env.staging`
(`VITE_API_URL`, `VITE_PUBLIC_FILES_BASE_URL`, `VITE_STATIC_ASSET_BASE_URL`).

### Required GitHub configuration (per Environment: `staging`, `production`)

**Backend**
- Secrets: `MONGODB_URI`, `JWT_SECRET`, `SERVERLESS_ACCESS_KEY`, `AWS_ROLE_ARN`
- Vars: `AWS_REGION`
- Staging sets `AWS_S3_BUCKET` / `PUBLIC_FILES_BASE_URL` as literals in the
  workflow; **production reads them from secrets** — set those before deploying.

**Frontend**
- Secrets: `AWS_ROLE_ARN`
- Vars: `AWS_REGION`, `S3_BUCKET_NAME`, `CLOUDFRONT_DISTRIBUTION_ID`

---

## 6. Local development

```bash
# Backend
cd isii-backend
npm run dev            # .env        → isii-files-dev   + dev CloudFront   + isii-dev DB
npm run dev:staging    # .env.staging → isii-files-staging + staging CF     + isii-staging DB

# Frontend
cd isii-frontend
npm run dev            # mode development → .env.development (dev CloudFront)
npm run dev:staging    # mode staging     → .env.staging     (staging CloudFront)
```

Backend env files (`.env`, `.env.staging`) are **gitignored** (they hold AWS
keys). Frontend env files are **tracked** (URLs only, no secrets).

---

## 7. Production checklist (when the prod CloudFront exists + code merged to `main`)

1. Create the production files CloudFront distribution (origin `isii-files-prod`,
   `/files/*` behavior + the prefix-stripping CloudFront Function).
2. Frontend `.env.production` → add
   `VITE_PUBLIC_FILES_BASE_URL=https://<prod-cf>/files`.
3. Backend `production` GitHub-env secrets → `AWS_S3_BUCKET=isii-files-prod`,
   `PUBLIC_FILES_BASE_URL=https://<prod-cf>/files` (or switch the workflow to
   literals like staging).
4. Run `migrateBucketUrls.js` against `isii-prod` (`OLD_PREFIX=prod
   NEW_BUCKET=isii-files-prod`).
5. Merge to `main` → workflows deploy backend + frontend to production.

# Backend Deployment on AWS Lambda

This document explains the recommended deployment model for the backend and how staging and production should be handled safely for this repo.

## Environment Model

The backend should be treated as three separate environments:

- local/dev
- staging
- production

Local/dev is used for development with `node server.js` or `npm run dev`.
Staging is the pre-production environment used for testing.
Production is the live environment.

## Core Principle

Staging should behave like production without touching production data.

That means staging should use its own:

- API Gateway / Lambda deployment stage
- MongoDB database or cluster namespace
- S3 bucket or clearly separated S3 prefix
- JWT secret
- environment variable set

## AWS Services Used

The backend deployment uses these AWS services:

### 1. AWS Lambda

Used to run backend logic as serverless functions.

Functions currently deployed:

- `auth`
- `articles`
- `news`
- `reports`
- `upload`

These are defined in [serverless.yml](./serverless.yml).

### 2. API Gateway HTTP API

Used to expose Lambda functions as HTTP endpoints.

Examples:

- `/api/auth`
- `/api/articles`
- `/api/news`
- `/api/reports`
- `/api/upload`

### 3. Amazon S3

Used for file storage.

Recommended setup:

- `isii-dev` for local/dev uploads
- `isii-staging` for staging uploads
- current production bucket for production uploads

### 4. IAM

Used for deployment permissions and Lambda runtime access to S3 and logs.

### 5. CloudWatch Logs

Used for runtime logs and debugging.

### 6. CloudFront

Used for masked public file delivery through:

- `https://www.isii.global/files/...`

### 7. MongoDB Atlas

Used as the main application database for:

- users
- articles
- news
- reports
- file references

Recommended Mongo database names:

- `isii-dev` for local/dev
- `isii-staging` for staging
- keep the current production database unchanged

## Request Flow

```text
Frontend
  -> API Gateway
  -> Lambda
  -> MongoDB Atlas / S3
  -> Response back to frontend
```

For file access:

```text
Frontend
  -> https://www.isii.global/files/...
  -> CloudFront
  -> S3
```

## Stage Naming

This repo now standardizes on:

- `staging`
- `production`

The default deploy stage in `serverless.yml` is `staging`.

## Important Files

- [server.js](./server.js): local server entry point
- [createApp.js](./createApp.js): shared Express app creation
- [createLambdaHandler.js](./createLambdaHandler.js): wraps Express with `serverless-http`
- [serverless.yml](./serverless.yml): AWS and stage deployment config
- [config/db.js](./config/db.js): MongoDB connection handling
- [config/aws.js](./config/aws.js): S3 client setup
- [routes/upload.js](./routes/upload.js): S3 upload flow

## Runtime Environment Variables

The deployed Lambda environment requires:

- `MONGODB_URI`
- `JWT_SECRET`
- `AWS_S3_BUCKET`
- `PUBLIC_FILES_BASE_URL`

The Lambda deployment also exposes:

- `APP_STAGE`

Notes:

- `AWS_REGION` is provided automatically by Lambda.
- AWS access keys should not be used inside the Lambda runtime.
- Lambda should use its execution role for AWS permissions.

## Local Development

Local development should continue to use `isii-backend/.env`.

That file is for local backend runtime only and should not be treated as the source of truth for deployed staging or production.
The local `AWS_S3_BUCKET` should point to `isii-dev`.
The local `MONGODB_URI` should point to the `isii-dev` database.

## Deploy Commands

From `isii-backend`:

```bash
npm run deploy:staging
```

```bash
npm run deploy:production
```

Remove a stage:

```bash
npm run remove:staging
```

```bash
npm run remove:production
```

## GitHub Actions CI/CD

The backend repo can auto-deploy through GitHub Actions with two workflows:

- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-production.yml`

Recommended branch flow:

- push to `staging` -> deploy staging
- push to `main` -> deploy production

Recommended GitHub environments:

- `staging`
- `production`

Recommended environment configuration:

- add repository or environment variable `AWS_REGION`
- add environment secret `AWS_ROLE_ARN`
- add environment secrets `MONGODB_URI`, `JWT_SECRET`, `AWS_S3_BUCKET`, `PUBLIC_FILES_BASE_URL`

For safety, add approval rules to the `production` environment before enabling automatic production deploys.

## Deployment Checklist

Before deploying staging:

- set staging `MONGODB_URI` to the `isii-staging` database
- set staging `JWT_SECRET`
- use staging `AWS_S3_BUCKET=isii-staging`
- set staging `PUBLIC_FILES_BASE_URL`
- confirm staging frontend points to staging backend

Before deploying production:

- keep production `MONGODB_URI` on the current production database
- set production `JWT_SECRET`
- set production `AWS_S3_BUCKET`
- set production `PUBLIC_FILES_BASE_URL`
- confirm production frontend points to production backend

## Recommended Safety Rules

- Do not share the same writable MongoDB database between dev, staging, and production.
- Do not share the same writable S3 bucket between environments unless isolation is intentional.
- Do not store secrets in frontend `VITE_*` variables.
- Test CRUD flows and uploads in staging before production deploys.

## Frontend Coordination

The frontend should use Vite mode-based files:

- `.env.development`
- `.env.staging`
- `.env.production`

The frontend API client should read:

- `VITE_API_URL`

This keeps the frontend and backend aligned:

- development frontend -> local backend
- staging frontend -> staging backend
- production frontend -> production backend

# Backend CI/CD Implementation Guide

This document explains how the backend CI/CD pipeline was implemented for this project, how it works today, what configuration is required outside the codebase, and what issues were faced while setting it up.

The goal is to make it easy for any team member to understand the setup and continue working on it safely.

## What We Implemented

We implemented GitHub Actions based CI/CD for the backend repo.

Current flow:

- push to `staging` branch -> deploy backend to AWS staging
- push to `main` branch -> deploy backend to AWS production

This deployment is done through:

- GitHub Actions
- AWS IAM OIDC authentication
- Serverless Framework
- AWS Lambda
- API Gateway

## Why We Chose This Setup

We chose this setup because it gives us:

- automatic deployment on push
- no long-lived AWS access keys in GitHub
- clear staging and production separation
- repeatable deployments
- simpler maintenance for the team

## Repo Files Involved

These are the main files that make the backend CI/CD work:

- [serverless.yml](./serverless.yml)
- [package.json](./package.json)
- [package-lock.json](./package-lock.json)
- [.github/workflows/deploy-staging.yml](./.github/workflows/deploy-staging.yml)
- [.github/workflows/deploy-production.yml](./.github/workflows/deploy-production.yml)
- [BACKEND_AWS_LAMBDA_DEPLOYMENT.md](./BACKEND_AWS_LAMBDA_DEPLOYMENT.md)

## Final Deployment Flow

### Staging

When code is pushed to the `staging` branch:

1. GitHub Actions starts the staging workflow
2. the repo is checked out
3. Node.js is set up
4. backend dependencies are installed with `npm ci`
5. GitHub Actions assumes the staging AWS IAM role using OIDC
6. Serverless deploys the backend to the AWS `staging` stage

### Production

When code is pushed to the `main` branch:

1. GitHub Actions starts the production workflow
2. the repo is checked out
3. Node.js is set up
4. backend dependencies are installed with `npm ci`
5. GitHub Actions assumes the production AWS IAM role using OIDC
6. Serverless deploys the backend to the AWS `production` stage

## GitHub Workflows

### Staging Workflow

File:

- [.github/workflows/deploy-staging.yml](./.github/workflows/deploy-staging.yml)

Trigger:

- push to `staging`
- manual trigger through `workflow_dispatch`

### Production Workflow

File:

- [.github/workflows/deploy-production.yml](./.github/workflows/deploy-production.yml)

Trigger:

- push to `main`
- manual trigger through `workflow_dispatch`

## Required GitHub Environment Setup

We use GitHub Environments so staging and production each have their own settings and secrets.

Required environments:

- `staging`
- `production`

### Required Variables

In each environment:

- `AWS_REGION`

Example:

```text
AWS_REGION=ap-south-1
```

### Required Secrets

In each environment:

- `AWS_ROLE_ARN`
- `MONGODB_URI`
- `JWT_SECRET`
- `AWS_S3_BUCKET`
- `PUBLIC_FILES_BASE_URL`
- `SERVERLESS_ACCESS_KEY`

### Example Meaning

- `AWS_ROLE_ARN`: IAM role GitHub Actions should assume
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: token signing secret
- `AWS_S3_BUCKET`: S3 bucket name for file uploads
- `PUBLIC_FILES_BASE_URL`: public base URL used for file links
- `SERVERLESS_ACCESS_KEY`: access key required by Serverless Framework v4 in CI

## Required AWS Setup

### 1. IAM OIDC Provider

AWS must have this identity provider:

- `token.actions.githubusercontent.com`

Audience must include:

- `sts.amazonaws.com`

### 2. IAM Deploy Roles

We use IAM roles for GitHub Actions to assume.

Example staging role:

- `isii-backend-staging-role`

Production should have a corresponding production deploy role.

### 3. IAM Role Permissions

The deploy role needs permissions to deploy backend infrastructure.

At minimum it should be able to work with:

- CloudFormation
- Lambda
- API Gateway
- CloudWatch Logs
- S3
- IAM PassRole if required

### 4. Trust Policy

The trust policy must allow GitHub Actions OIDC.

Important: because our workflow uses GitHub Environments, the `sub` condition must use the environment-based format.

### Staging Trust Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::639920117892:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:Nxtwave-Platform/isii-backend:environment:staging"
        }
      }
    }
  ]
}
```

### Production Trust Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::639920117892:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:Nxtwave-Platform/isii-backend:environment:production"
        }
      }
    }
  ]
}
```

## Local and Deployed Environment Variables

### Local backend `.env`

The backend local `.env` is for local development only.

Typical variables there include:

- `AWS_REGION`
- `AWS_S3_BUCKET`
- `JWT_SECRET`
- `MONGODB_URI`
- `PORT`
- `FRONTEND_URL`
- `PUBLIC_FILES_BASE_URL`

### Deployed backend config

Deployed staging and production do not use the local `.env` file directly.

They use:

- GitHub environment variables and secrets during CI
- environment values passed into Serverless deployment

## Frontend Coordination

The frontend must point to the correct backend API URL per environment.

Recommended frontend env files:

- `isii-frontend/.env.development`
- `isii-frontend/.env.staging`
- `isii-frontend/.env.production`

The frontend should use:

- `VITE_API_URL`

Examples:

- development -> local backend URL
- staging -> staging API Gateway URL
- production -> production API Gateway URL

Important:

The frontend does not automatically discover a newly deployed backend URL.
It needs a stable API URL per environment.

Best practice is:

- staging frontend always points to one stable staging backend URL
- production frontend always points to one stable production backend URL

## Issues We Faced While Setting This Up

Below is the exact sequence of the main issues we hit and how we resolved them.

### 1. GitHub Actions could not find the lockfile

Error:

- dependency lockfile not found during Node setup

Cause:

- `package-lock.json` was not available in the GitHub repo state used by the workflow

Fix:

- committed `package-lock.json`
- kept `npm ci` in the workflow

### 2. Workflow and GitHub environment names did not match

Cause:

- workflow expected `vars.AWS_REGION` and `secrets.AWS_ROLE_ARN`
- GitHub environment initially had different naming

Fix:

- standardized the GitHub setup to use:
  - variable `AWS_REGION`
  - secret `AWS_ROLE_ARN`

### 3. AWS OIDC role assumption failed

Error:

- `Not authorized to perform sts:AssumeRoleWithWebIdentity`

Cause:

- wrong IAM role ARN in GitHub secret at one stage
- trust policy needed to match the actual GitHub context

Fix:

- updated GitHub `AWS_ROLE_ARN` to the correct deploy role ARN
- verified OIDC provider exists in AWS
- verified audience is `sts.amazonaws.com`
- corrected trust policy

### 4. Trust policy used the wrong `sub` format

Cause:

- trust policy initially used branch-style `sub`
- workflow actually used GitHub `environment: staging`

Fix:

- changed trust policy `sub` to environment format:
  - `repo:Nxtwave-Platform/isii-backend:environment:staging`
  - `repo:Nxtwave-Platform/isii-backend:environment:production`

This was the key fix for OIDC.

### 5. Serverless Framework v4 required authentication in CI

Error:

- Serverless required login or access key

Cause:

- Serverless Framework v4 requires authentication in CI/CD

Fix:

- created and added `SERVERLESS_ACCESS_KEY` in GitHub environments
- passed it through the workflow env

### 6. Serverless version should be pinned

Cause:

- relying on dynamic resolution can make CI inconsistent

Fix:

- pinned `serverless` in `devDependencies`
- deploy scripts now use the repo-local Serverless installation

## Current Working Status

Current backend staging CI/CD is working successfully.

What now works:

- GitHub Actions trigger
- dependency install
- AWS OIDC role assumption
- Serverless authentication
- Serverless deployment to AWS staging

This validates the CI/CD approach.

## What Still Needs To Be Done

### Production parity

Production should have the same final setup as staging:

- correct `AWS_ROLE_ARN`
- correct trust policy
- `SERVERLESS_ACCESS_KEY`
- all required secrets and variables

### Safety improvements

Recommended next improvements:

- add production protection rules in GitHub
- require review/approval before production deployment
- add post-deploy health check in workflow
- use separate dev, staging, and production databases if not already separated
- use separate staging and production buckets or prefixes if needed

## How To Debug Future CI/CD Failures

When a deployment fails:

1. open `Actions` in GitHub
2. open the failed workflow run
3. open the failed job
4. find the step with the red `x`
5. read the last error lines of that step

Simple mapping:

- `Setup Node.js` -> dependency or lockfile problem
- `Install dependencies` -> npm or package issue
- `Configure AWS credentials` -> IAM/OIDC/trust policy/role issue
- `Deploy staging backend` or `Deploy production backend` -> Serverless, AWS, or environment variable issue

## Commands Used In This Project

From `isii-backend`:

```bash
npm run dev
```

```bash
npm run deploy:staging
```

```bash
npm run deploy:production
```

```bash
npm run remove:staging
```

```bash
npm run remove:production
```

## Team Summary

In short, we implemented backend CI/CD by:

- creating separate staging and production GitHub workflows
- using GitHub Environments for per-environment config
- using AWS OIDC instead of static AWS access keys
- using Serverless to deploy Lambda/API Gateway
- pinning Serverless in the repo
- fixing trust policy and Serverless authentication issues until staging deployment succeeded

This is now a solid base for safe automatic backend deployment.

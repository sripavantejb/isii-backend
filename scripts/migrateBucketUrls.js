/**
 * Migrate stored file URLs from the OLD shared-bucket layout to the NEW
 * per-environment bucket layout.
 *
 *   OLD: https://s3.<region>.amazonaws.com/www.isii.global/<env>/<path>
 *   NEW: https://s3.<region>.amazonaws.com/isii-files-<env>/<path>
 *
 * The single shared bucket (www.isii.global) with dev/ staging/ prod/ folders
 * was split into dedicated buckets (isii-files-dev / -staging / -prod) whose
 * content lives at the bucket root (no env folder). Stored URLs still point at
 * the old bucket + env folder, so we swap the bucket and drop the env segment.
 *
 * Run ONCE per environment database (the env determines bucket + prefix):
 *
 *   # dry run (prints changes, writes nothing)
 *   ENV_FILE=.env node scripts/migrateBucketUrls.js
 *
 *   # apply
 *   ENV_FILE=.env APPLY_CHANGES=true node scripts/migrateBucketUrls.js
 *
 * Override detection explicitly if needed:
 *   OLD_BUCKET=www.isii.global OLD_PREFIX=dev NEW_BUCKET=isii-files-dev \
 *   S3_REGION=ap-south-2 APPLY_CHANGES=true node scripts/migrateBucketUrls.js
 */
require('../config/loadEnv');
const connectDB = require('../config/db');
const Article = require('../models/Article');
const Report = require('../models/Report');
const News = require('../models/News');

const APPLY_CHANGES = process.env.APPLY_CHANGES === 'true';
const REGION = String(
  process.env.S3_REGION || process.env.AWS_S3_REGION || process.env.AWS_REGION || 'ap-south-2'
).trim();

const OLD_BUCKET = String(process.env.OLD_BUCKET || 'www.isii.global').trim();

// Infer the env (dev|staging|prod) from APP_STAGE / NODE_ENV / the bucket name,
// then derive the old folder prefix and the new bucket. All overridable.
const inferEnv = () => {
  const explicit = String(process.env.OLD_PREFIX || '').trim().toLowerCase();
  if (explicit) return explicit;

  const stage = String(
    process.env.APP_STAGE || process.env.STAGE || process.env.NODE_ENV || ''
  )
    .trim()
    .toLowerCase();
  if (stage.startsWith('prod')) return 'prod';
  if (stage.startsWith('stag')) return 'staging';
  if (stage.startsWith('dev') || stage === 'local' || stage === '') {
    // Fall back to the configured target bucket name when stage is unset.
    const bucket = String(process.env.AWS_S3_BUCKET || '').toLowerCase();
    if (bucket.includes('prod')) return 'prod';
    if (bucket.includes('staging')) return 'staging';
    return 'dev';
  }
  return 'dev';
};

const ENV = inferEnv();
const OLD_PREFIX = ENV; // env folder inside the old shared bucket
const NEW_BUCKET = String(process.env.NEW_BUCKET || `isii-files-${ENV}`).trim();

const RAW_S3_HOSTS = new Set([
  `s3.${REGION}.amazonaws.com`, // path-style:    https://s3.<region>.amazonaws.com/<bucket>/<key>
]);
const OLD_VHOST = `${OLD_BUCKET}.s3.${REGION}.amazonaws.com`; // virtual-hosted style

// Known content roots (top-level "folders") in the files buckets. Used to detect
// malformed path-style URLs that are MISSING the bucket segment, e.g.
//   https://s3.<region>.amazonaws.com/images/<file>   (bucket dropped)
// where "images" is a content folder, not a bucket.
const CONTENT_ROOTS = new Set([
  'images',
  'pivotal-thinking',
  'press-and-news',
  'news',
  'pdfs',
  'reports',
  'isii_images',
  'isii-static',
]);

const buildNewUrl = (key) =>
  `https://s3.${REGION}.amazonaws.com/${NEW_BUCKET}/${key.replace(/^\/+/, '')}`;

const stripEnvPrefix = (key) => {
  const cleaned = key.replace(/^\/+/, '');
  const re = new RegExp(`^${OLD_PREFIX}/`);
  return cleaned.replace(re, '');
};

const migrateUrl = (value) => {
  if (!value || typeof value !== 'string') return value;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return value;
  }

  // Already pointing at the new bucket → idempotent no-op.
  const pathNoSlash = parsed.pathname.replace(/^\/+/, '');
  if (
    RAW_S3_HOSTS.has(parsed.hostname) &&
    pathNoSlash.startsWith(`${NEW_BUCKET}/`)
  ) {
    return value;
  }

  // Path-style old URL: https://s3.<region>.amazonaws.com/www.isii.global/<env>/<path>
  if (RAW_S3_HOSTS.has(parsed.hostname) && pathNoSlash.startsWith(`${OLD_BUCKET}/`)) {
    const afterBucket = pathNoSlash.slice(`${OLD_BUCKET}/`.length);
    return buildNewUrl(stripEnvPrefix(afterBucket));
  }

  // Malformed path-style URL missing the bucket segment:
  //   https://s3.<region>.amazonaws.com/<content-root>/<file>  ->  prepend the env bucket.
  if (RAW_S3_HOSTS.has(parsed.hostname)) {
    const firstSegment = pathNoSlash.split('/')[0];
    if (CONTENT_ROOTS.has(firstSegment)) {
      return buildNewUrl(stripEnvPrefix(pathNoSlash));
    }
  }

  // Virtual-hosted old URL: https://www.isii.global.s3.<region>.amazonaws.com/<env>/<path>
  if (parsed.hostname === OLD_VHOST) {
    return buildNewUrl(stripEnvPrefix(pathNoSlash));
  }

  return value;
};

const processModel = async (label, Model, fields) => {
  const docs = await Model.find({});
  let changed = 0;

  for (const doc of docs) {
    let docChanged = false;

    for (const field of fields) {
      const currentValue = doc[field];
      const nextValue = migrateUrl(currentValue);

      if (nextValue !== currentValue) {
        console.log(`[${label}] ${doc._id} ${field}`);
        console.log(`  old: ${currentValue}`);
        console.log(`  new: ${nextValue}`);
        doc[field] = nextValue;
        docChanged = true;
      }
    }

    if (docChanged) {
      changed += 1;
      if (APPLY_CHANGES) await doc.save();
    }
  }

  console.log(`${label}: ${changed} document(s) ${APPLY_CHANGES ? 'updated' : 'would be updated'}`);
  return changed;
};

const main = async () => {
  console.log(`Mode:        ${APPLY_CHANGES ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Region:      ${REGION}`);
  console.log(`Env:         ${ENV}`);
  console.log(`Old bucket:  ${OLD_BUCKET} (folder: ${OLD_PREFIX}/)`);
  console.log(`New bucket:  ${NEW_BUCKET}`);
  console.log('');

  await connectDB();

  let total = 0;
  total += await processModel('Article', Article, ['imageUrl', 'bannerImageUrl', 'pdfUrl']);
  total += await processModel('Report', Report, ['imageUrl', 'bannerImageUrl', 'pdfUrl']);
  total += await processModel('News', News, ['imageUrl', 'articleFileUrl']);

  console.log(`\nTotal changed documents: ${total}`);
  process.exit(0);
};

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});

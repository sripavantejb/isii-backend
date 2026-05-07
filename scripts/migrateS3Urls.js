const connectDB = require('../config/db');
const Article = require('../models/Article');
const Report = require('../models/Report');
const News = require('../models/News');

const OLD_S3_HOSTS = new Set([
  'isii-v2.s3.ap-south-1.amazonaws.com',
  'isii-staging.s3.ap-south-1.amazonaws.com',
  'isii-dev.s3.ap-south-1.amazonaws.com',
]);

const NEW_PUBLIC_BASE = process.env.NEW_PUBLIC_BASE_URL || 'https://www.isii.global/files';
const NEW_S3_BUCKET = process.env.NEW_S3_BUCKET || 'www.isii.global';
const NEW_S3_REGION = process.env.NEW_S3_REGION || process.env.AWS_REGION || 'ap-south-2';
const APPLY_CHANGES = process.env.APPLY_CHANGES === 'true';

const trimTrailingSlashes = (value) => String(value).replace(/\/+$/, '');
const trimLeadingSlashes = (value) => String(value).replace(/^\/+/, '');

const NEW_PUBLIC_BASE_NORMALIZED = trimTrailingSlashes(NEW_PUBLIC_BASE);
const NEW_RAW_S3_BASE = `https://s3.${NEW_S3_REGION}.amazonaws.com/${NEW_S3_BUCKET}`;
const NEW_RAW_S3_HOST = `s3.${NEW_S3_REGION}.amazonaws.com`;
const TARGET_S3_PREFIX = trimLeadingSlashes(process.env.TARGET_S3_PREFIX || 'prod').replace(/\/+$/, '');
const NEW_PUBLIC_BASE_URL = new URL(NEW_PUBLIC_BASE_NORMALIZED);
const NEW_PUBLIC_BASE_PATH = trimTrailingSlashes(NEW_PUBLIC_BASE_URL.pathname);

const normalizePathSegments = (path) => {
  const segments = trimLeadingSlashes(path)
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      const withSpaces = segment.replace(/\+/g, ' ');

      try {
        return encodeURIComponent(decodeURIComponent(withSpaces));
      } catch (error) {
        return encodeURIComponent(withSpaces);
      }
    });

  return segments.join('/');
};

const buildNewUrlFromPath = (path) => `${NEW_RAW_S3_BASE}/${normalizePathSegments(path)}`;

const normalizeLegacyPath = (hostname, pathname) => {
  const path = trimLeadingSlashes(pathname);

  if (hostname === 'isii-v2.s3.ap-south-1.amazonaws.com') {
    return path.startsWith(`${TARGET_S3_PREFIX}/`) ? path : `${TARGET_S3_PREFIX}/${path}`;
  }

  if (hostname === 'isii-staging.s3.ap-south-1.amazonaws.com') {
    return path.startsWith('staging/') ? path : `staging/${path}`;
  }

  if (hostname === 'isii-dev.s3.ap-south-1.amazonaws.com') {
    return path.startsWith('dev/') ? path : `dev/${path}`;
  }

  return path;
};

const migrateUrl = (value) => {
  if (!value || typeof value !== 'string') {
    return value;
  }

  try {
    const parsed = new URL(value);

    if (
      parsed.origin === NEW_PUBLIC_BASE_URL.origin &&
      trimTrailingSlashes(parsed.pathname).startsWith(NEW_PUBLIC_BASE_PATH)
    ) {
      const relativePath = trimLeadingSlashes(
        parsed.pathname.slice(NEW_PUBLIC_BASE_PATH.length)
      );
      return buildNewUrlFromPath(relativePath);
    }

    if (parsed.hostname === NEW_RAW_S3_HOST) {
      const rawPath = trimLeadingSlashes(parsed.pathname);

      if (!rawPath.startsWith(`${NEW_S3_BUCKET}/`)) {
        return value;
      }

      const bucketRelativePath = rawPath.slice(`${NEW_S3_BUCKET}/`.length);
      return buildNewUrlFromPath(bucketRelativePath);
    }

    if (!OLD_S3_HOSTS.has(parsed.hostname)) {
      return value;
    }

    const migratedPath = normalizeLegacyPath(parsed.hostname, parsed.pathname);
    return buildNewUrlFromPath(migratedPath);
  } catch (error) {
    return value;
  }
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
      if (APPLY_CHANGES) {
        await doc.save();
      }
    }
  }

  console.log(`${label}: ${changed} document(s) ${APPLY_CHANGES ? 'updated' : 'would be updated'}`);
  return changed;
};

const main = async () => {
  console.log(`Mode: ${APPLY_CHANGES ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Target raw S3 base: ${NEW_RAW_S3_BASE}`);
  console.log(`Target S3 prefix: ${TARGET_S3_PREFIX}`);
  console.log(`Public base (reference): ${NEW_PUBLIC_BASE_NORMALIZED}`);

  await connectDB();

  let totalChanged = 0;
  totalChanged += await processModel('Article', Article, ['imageUrl', 'bannerImageUrl', 'pdfUrl']);
  totalChanged += await processModel('Report', Report, ['imageUrl', 'bannerImageUrl', 'pdfUrl']);
  totalChanged += await processModel('News', News, ['imageUrl', 'articleFileUrl']);

  console.log(`Total changed documents: ${totalChanged}`);
  process.exit(0);
};

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});

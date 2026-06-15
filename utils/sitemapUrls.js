/**
 * URL helpers for sitemap generation.
 *
 * The sitemap must list URLs on the site's CANONICAL custom domain (e.g.
 * https://staging.isii.global or https://www.isii.global) so they satisfy the
 * "same domain as the sitemap" rule. That domain comes from SITE_BASE_URL — it
 * is intentionally separate from PUBLIC_FILES_BASE_URL, which on some
 * environments points at the raw CloudFront domain.
 *
 * The file-key extraction below mirrors the frontend's getMaskedFileUrl so a
 * stored raw-S3 or already-masked URL resolves to the same /files/<key> path.
 */

require('../config/loadEnv');

const DEFAULT_SITE_BASE_URL = 'https://www.isii.global';
const DEFAULT_FILES_BASE_PATH = '/files';
const LEGACY_ENV_PREFIXES = ['dev/', 'staging/', 'prod/'];

const trimLeadingSlashes = (value) => String(value).replace(/^\/+/, '');
const trimTrailingSlashes = (value) => String(value).replace(/\/+$/, '');

const getSiteBaseUrl = () =>
  trimTrailingSlashes(process.env.SITE_BASE_URL || DEFAULT_SITE_BASE_URL);

// The "/files" path segment, derived from PUBLIC_FILES_BASE_URL's pathname.
const getFilesBasePath = () => {
  const base = process.env.PUBLIC_FILES_BASE_URL;
  if (!base) return DEFAULT_FILES_BASE_PATH;
  try {
    const path = trimTrailingSlashes(new URL(base).pathname);
    return path || DEFAULT_FILES_BASE_PATH;
  } catch {
    return DEFAULT_FILES_BASE_PATH;
  }
};

const stripLegacyEnvPrefix = (key) => {
  const cleaned = trimLeadingSlashes(key);
  for (const prefix of LEGACY_ENV_PREFIXES) {
    if (cleaned.startsWith(prefix)) {
      return cleaned.slice(prefix.length);
    }
  }
  return cleaned;
};

// Already-masked "/files/..." URL on any host -> object key (or null).
const getKeyFromMaskedUrl = (value, filesBasePath) => {
  try {
    const parsed = new URL(value);
    const basePath = trimLeadingSlashes(filesBasePath);
    const path = trimLeadingSlashes(parsed.pathname);

    if (path === basePath) return '';
    if (path.startsWith(`${basePath}/`)) return path.slice(basePath.length + 1);
    return null;
  } catch {
    return null;
  }
};

// Raw S3 URL (path-style or virtual-hosted) -> object key (or null).
const getKeyFromRawS3Url = (value) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const host = parsed.hostname;
  const path = trimLeadingSlashes(parsed.pathname);

  if (/^s3([.-][a-z0-9-]+)?\.amazonaws\.com$/.test(host)) {
    const slash = path.indexOf('/');
    return slash === -1 ? null : path.slice(slash + 1);
  }

  if (/\.s3([.-][a-z0-9-]+)?\.amazonaws\.com$/.test(host)) {
    return path;
  }

  return null;
};

const encodeKeyForPath = (key) =>
  trimLeadingSlashes(key)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

/**
 * Convert a stored file URL (raw S3 or already-masked) into an on-domain
 * sitemap URL like https://<site>/files/<key>. Returns null when the value is
 * not one of our files (e.g. an external link) so the caller can skip it.
 */
const toSitemapFileUrl = (storedUrl = '') => {
  if (!storedUrl) return null;

  const filesBasePath = getFilesBasePath();
  let key = getKeyFromMaskedUrl(storedUrl, filesBasePath);
  if (key === null) {
    key = getKeyFromRawS3Url(storedUrl);
  }
  if (key === null) return null;

  const cleanKey = stripLegacyEnvPrefix(key);
  if (!cleanKey) return null;

  return `${getSiteBaseUrl()}${filesBasePath}/${encodeKeyForPath(cleanKey)}`;
};

/** Build a sitemap URL for a static frontend page path (e.g. "/about"). */
const toSitemapPageUrl = (pagePath = '/') => {
  const normalized = pagePath === '/' ? '' : `/${trimLeadingSlashes(pagePath)}`;
  return `${getSiteBaseUrl()}${normalized}`;
};

module.exports = {
  toSitemapFileUrl,
  toSitemapPageUrl,
  getSiteBaseUrl,
};

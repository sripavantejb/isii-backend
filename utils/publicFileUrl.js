const DEFAULT_PUBLIC_FILES_BASE_URL = 'https://www.isii.global/files';

const trimTrailingSlashes = (value) => String(value).replace(/\/+$/, '');
const trimLeadingSlashes = (value) => String(value).replace(/^\/+/, '');
const encodeKeyForPathUrl = (key = '') =>
  trimLeadingSlashes(key)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const getPublicFilesBaseUrl = () =>
  trimTrailingSlashes(process.env.PUBLIC_FILES_BASE_URL || DEFAULT_PUBLIC_FILES_BASE_URL);

const getRawS3BaseUrl = () => {
  const region = String(process.env.AWS_REGION || '').trim();
  const bucket = String(process.env.AWS_S3_BUCKET || '').trim();

  if (!region || !bucket) {
    return '';
  }

  return `https://s3.${region}.amazonaws.com/${bucket}`;
};

const buildPublicFileUrl = (key = '') => {
  const normalizedKey = trimLeadingSlashes(key);
  return `${getPublicFilesBaseUrl()}/${normalizedKey}`;
};

const buildRawS3FileUrl = (key = '') => {
  const rawBaseUrl = getRawS3BaseUrl();
  const encodedKey = encodeKeyForPathUrl(key);

  if (!rawBaseUrl) {
    return encodedKey ? `/${encodedKey}` : '';
  }

  return encodedKey ? `${rawBaseUrl}/${encodedKey}` : rawBaseUrl;
};

module.exports = {
  buildRawS3FileUrl,
  buildPublicFileUrl,
  getPublicFilesBaseUrl,
  getRawS3BaseUrl,
};

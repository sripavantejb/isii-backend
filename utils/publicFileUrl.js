const DEFAULT_PUBLIC_FILES_BASE_URL = 'https://www.isii.global/files';

const trimTrailingSlashes = (value) => String(value).replace(/\/+$/, '');
const trimLeadingSlashes = (value) => String(value).replace(/^\/+/, '');

const getPublicFilesBaseUrl = () =>
  trimTrailingSlashes(process.env.PUBLIC_FILES_BASE_URL || DEFAULT_PUBLIC_FILES_BASE_URL);

const buildPublicFileUrl = (key = '') => {
  const normalizedKey = trimLeadingSlashes(key);
  return `${getPublicFilesBaseUrl()}/${normalizedKey}`;
};

module.exports = {
  buildPublicFileUrl,
  getPublicFilesBaseUrl,
};

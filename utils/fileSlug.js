const path = require('path');

const FALLBACK_FILE_SLUG = 'file-upload';

const UPLOAD_SCOPE_FOLDERS = Object.freeze({
  'pivotal-thinking': 'pivotal-thinking/',
  'press-and-news': 'press-and-news/',
});

const sanitizeUploadedBaseName = (originalName = FALLBACK_FILE_SLUG) => {
  const { name } = path.parse(String(originalName));

  return (
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '')
      .toLowerCase() || FALLBACK_FILE_SLUG
  );
};

const getSafeExtension = (originalName = '') =>
  path.extname(String(originalName)).toLowerCase();

const normalizeUploadScope = (value = '') => {
  const normalizedValue = String(value).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(UPLOAD_SCOPE_FOLDERS, normalizedValue)
    ? normalizedValue
    : '';
};

const getUploadScopeFolder = (value = '') =>
  UPLOAD_SCOPE_FOLDERS[normalizeUploadScope(value)] || '';

const buildScopedUploadKey = (folder, originalName, versionNumber = null) => {
  const baseName = sanitizeUploadedBaseName(originalName);
  const extension = getSafeExtension(originalName);
  const versionSuffix =
    Number.isInteger(versionNumber) && versionNumber > 0 ? `_${versionNumber}` : '';

  return `${folder}${baseName}${versionSuffix}${extension}`;
};

const getFilenameFromUrl = (value = '') => {
  try {
    const { pathname } = new URL(value);
    return decodeURIComponent(path.posix.basename(pathname));
  } catch (error) {
    const [pathname] = String(value).split('?');
    return decodeURIComponent(path.basename(pathname));
  }
};

const extractSlugFromUrl = (value = '') =>
  sanitizeUploadedBaseName(getFilenameFromUrl(value));

const extractSlugFromKey = (value = '') =>
  sanitizeUploadedBaseName(path.posix.basename(String(value)));

module.exports = {
  buildScopedUploadKey,
  extractSlugFromKey,
  extractSlugFromUrl,
  getSafeExtension,
  getUploadScopeFolder,
  normalizeUploadScope,
  sanitizeUploadedBaseName,
};

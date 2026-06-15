/**
 * Builds the sitemap XML string from the static page list and the dynamic
 * content items (articles / reports / news file URLs).
 */

const { toSitemapFileUrl, toSitemapPageUrl } = require('./sitemapUrls');

// Fixed frontend pages (no per-article HTML pages exist yet). Keep this in sync
// with the public routes in the frontend's App.tsx when pages are added/removed.
const STATIC_PATHS = Object.freeze([
  '/',
  '/about',
  '/about/mission',
  '/about/people',
  '/about/context',
  '/about/people/ketan-patel',
  '/about/people/glenn-gaffney',
  '/about/people/jon-miller',
  '/about/people/garry-jacobs',
  '/about/people/shaurya-doval',
  '/capabilities/pivotal-thinking',
  '/capabilities/pivotal-thinking/content-library',
  '/press-and-news',
  '/capabilities/perspectives',
  '/capabilities/perspectives/content-library',
  '/capabilities/strategic-counsel',
  '/capabilities/strategic-counsel/growth-and-prosperity',
  '/capabilities/strategic-counsel/securing-sovereignty',
  '/capabilities/strategic-counsel/mobilising-transition',
  '/capabilities/programmes',
  '/capabilities/projects-and-intervention',
  '/privacy-policy',
]);

const xmlEscape = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const formatLastmod = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
};

const renderUrl = (loc, lastmod) => {
  const lastmodLine = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '';
  return `  <url>\n    <loc>${xmlEscape(loc)}</loc>${lastmodLine}\n  </url>`;
};

/**
 * @param {Array<{url: string, lastmod?: string|Date}>} contentItems
 *   Each item's `url` is a stored file URL; unresolvable ones are skipped.
 * @returns {{ xml: string, included: number, skipped: number }}
 */
const buildSitemapXml = (contentItems = []) => {
  const entries = [];

  for (const path of STATIC_PATHS) {
    entries.push(renderUrl(toSitemapPageUrl(path)));
  }

  let included = 0;
  let skipped = 0;

  for (const item of contentItems) {
    const loc = toSitemapFileUrl(item.url);
    if (!loc) {
      skipped += 1;
      continue;
    }
    entries.push(renderUrl(loc, formatLastmod(item.lastmod)));
    included += 1;
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${entries.join('\n')}\n` +
    `</urlset>\n`;

  return { xml, included, skipped };
};

module.exports = { buildSitemapXml, STATIC_PATHS };

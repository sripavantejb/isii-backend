/**
 * HTTP caching middleware for PUBLIC, read-only endpoints.
 *
 * Adds a Cache-Control header so that:
 *   - the browser serves repeat views from its own cache (no server hit at all
 *     within max-age — this is what kills the "304 took 6s" problem), and
 *   - a CDN in front (CloudFront) can cache and serve the response from an edge
 *     near the user (s-maxage), so most visitors never wake the Lambda.
 *
 * Only attach this to GET routes that return public data. Never attach it to
 * authenticated or mutating routes (create/update/delete) — those stay
 * uncached so the next read always reflects the latest change after TTL.
 *
 * Tuning the TTL is a freshness-vs-speed trade-off: a higher number means
 * faster pages but newly published content can appear up to that many seconds
 * late. 60s is a sensible default for a content site.
 */

// Seconds a public list/detail response may be reused before revalidating.
const PUBLIC_CONTENT_TTL = Number(process.env.PUBLIC_CONTENT_TTL_SECONDS) || 60;

// How long a stale copy may still be served while a fresh one is fetched
// in the background (smoother experience, no visible wait on revalidation).
const STALE_WHILE_REVALIDATE = 300;

const publicCache = (maxAge = PUBLIC_CONTENT_TTL) => (req, res, next) => {
  // Safety net: only ever mark safe reads as cacheable.
  if (req.method !== 'GET') {
    res.set('Cache-Control', 'no-store');
    return next();
  }

  res.set(
    'Cache-Control',
    `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`
  );

  // Cached responses must vary per requesting origin, because CORS reflects the
  // Origin header — this prevents a CDN from serving one origin's CORS headers
  // to a different origin.
  res.vary('Origin');

  next();
};

module.exports = { publicCache, PUBLIC_CONTENT_TTL };

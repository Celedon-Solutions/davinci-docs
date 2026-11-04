import path from 'node:path';
import { followRedirects, normalizeRoute } from './navigation.mjs';
import { pageIdForRoute } from './mdx.mjs';

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export const DEFAULT_BASE_URL = 'https://docs.davinci-app.com';

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Build a link resolver that rewrites documentation links to in-document
 * anchors when the target page is part of the export, and to absolute URLs on
 * the published docs site otherwise.
 *
 * @param {object} options
 * @param {Set<string>} options.pageRoutes Routes included in the export.
 * @param {Map<string, Set<string>>} options.headings Heading slugs per route.
 * @param {Map<string, string>} options.redirects docs.json redirects.
 * @param {string} [options.baseUrl]
 * @param {(route: string, fromRoute: string) => void} [options.onExternalized]
 */
export function createLinkResolver({
  pageRoutes,
  headings,
  redirects,
  baseUrl = DEFAULT_BASE_URL,
  onExternalized = () => {},
}) {
  return function resolveLink(href, fromRoute) {
    const raw = String(href ?? '').trim();
    if (!raw) return raw;
    if (URL_SCHEME.test(raw) || raw.startsWith('//')) return raw;

    const hashIndex = raw.indexOf('#');
    const hash = hashIndex >= 0 ? safeDecode(raw.slice(hashIndex + 1)).toLowerCase() : '';
    const pathPart = (hashIndex >= 0 ? raw.slice(0, hashIndex) : raw).replace(/\?.*$/, '');

    let route;
    if (pathPart === '') {
      route = fromRoute;
    } else if (pathPart.startsWith('/')) {
      route = normalizeRoute(safeDecode(pathPart));
    } else {
      route = normalizeRoute(path.posix.join(path.posix.dirname(fromRoute), safeDecode(pathPart)));
    }
    route = followRedirects(route, redirects);

    if (pageRoutes.has(route)) {
      const pageId = pageIdForRoute(route);
      const hasHeading = hash && headings.get(route)?.has(hash);
      return `#${hasHeading ? `${pageId}--${hash}` : pageId}`;
    }

    onExternalized(route, fromRoute);
    const suffix = hash ? `#${hash}` : '';
    return `${baseUrl.replace(/\/+$/, '')}/${route}${suffix}`;
  };
}

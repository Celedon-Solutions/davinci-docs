/**
 * The documentation version is the newest release: the first page listed in
 * the "Release Notes" navigation group of docs.json. The navbar version link
 * and the PDF export both read it from there, so publishing a release notes
 * page is the only step that changes it.
 */

export const RELEASE_NOTES_GROUP = 'Release Notes';
const RELEASE_ROUTE = /^pages\/release-notes\/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const RELEASE_NOTES_HREF_PREFIX = '/pages/release-notes/';

function findGroup(node, name) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findGroup(child, name);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  if (node.group === name) return node;
  return findGroup(node.groups ?? node.pages ?? node.tabs ?? node.anchors ?? [], name);
}

function firstPage(pages = []) {
  for (const entry of pages) {
    if (typeof entry === 'string') return entry;
    const nested = firstPage(entry?.pages);
    if (nested) return nested;
  }
  return null;
}

/**
 * @param {object} docsConfig Parsed docs.json.
 * @returns {{version: string, route: string} | null}
 */
export function latestRelease(docsConfig) {
  const group = findGroup(docsConfig?.navigation, RELEASE_NOTES_GROUP);
  const route = firstPage(group?.pages);
  const match = route?.match(RELEASE_ROUTE);
  return match ? { version: match[1], route } : null;
}

export function versionLink({ version, route }) {
  return { label: `v${version}`, href: `/${route}` };
}

export function isVersionLink(link) {
  return typeof link?.href === 'string' && link.href.startsWith(RELEASE_NOTES_HREF_PREFIX);
}

/**
 * Point the navbar version link at the latest release, adding it as the first
 * navbar link when it is missing.
 *
 * @returns {{config: object, changed: boolean, release: {version: string, route: string}}}
 */
export function syncNavbarVersion(docsConfig) {
  const release = latestRelease(docsConfig);
  if (!release) {
    throw new Error(`No release notes page found in the "${RELEASE_NOTES_GROUP}" navigation group`);
  }
  const wanted = versionLink(release);
  const links = docsConfig.navbar?.links ?? [];
  const index = links.findIndex(isVersionLink);
  const current = index >= 0 ? links[index] : null;
  if (current && current.label === wanted.label && current.href === wanted.href) {
    return { config: docsConfig, changed: false, release };
  }
  const nextLinks = index >= 0
    ? links.map((link, i) => (i === index ? { ...link, ...wanted } : link))
    : [wanted, ...links];
  return {
    config: { ...docsConfig, navbar: { ...docsConfig.navbar, links: nextLinks } },
    changed: true,
    release,
  };
}

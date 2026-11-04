import fs from 'node:fs';
import path from 'node:path';

/**
 * Navigation discovery for the PDF export.
 *
 * Walks the Mintlify `navigation` config in `docs.json` and returns an ordered
 * tree of the hand-authored pages that should be exported. Hidden groups,
 * duplicate page entries, and generated OpenAPI entries are skipped and
 * reported so the caller can surface them.
 */

// Keys whose values hold nested navigation (arrays of pages / groups / tabs...).
const CONTAINER_KEYS = [
  'tabs',
  'anchors',
  'dropdowns',
  'versions',
  'languages',
  'products',
  'menu',
  'groups',
  'pages',
];

// Keys that give a container a human readable label.
const LABEL_KEYS = ['group', 'tab', 'anchor', 'dropdown', 'version', 'language', 'product', 'item'];

// Generated API reference routes live under this prefix and are not exported.
const GENERATED_PREFIXES = ['api-reference/'];

export function normalizeRoute(route) {
  return String(route ?? '')
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.mdx?$/, '');
}

export function buildRedirectMap(redirects = []) {
  const map = new Map();
  for (const redirect of redirects) {
    if (!redirect?.source || !redirect?.destination) continue;
    map.set(normalizeRoute(redirect.source), normalizeRoute(redirect.destination));
  }
  return map;
}

export function followRedirects(route, redirects, maxHops = 5) {
  let current = route;
  for (let hop = 0; hop < maxHops; hop += 1) {
    const next = redirects.get(current);
    if (!next || next === current) return current;
    current = next;
  }
  return current;
}

/** Locate the source file for a route, or return null. */
export function resolveSourceFile(docsRoot, route) {
  const candidates = [
    `${route}.mdx`,
    `${route}.md`,
    path.join(route, 'index.mdx'),
    path.join(route, 'index.md'),
  ];
  for (const candidate of candidates) {
    const abs = path.join(docsRoot, candidate);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return null;
}

function labelOf(node) {
  for (const key of LABEL_KEYS) {
    if (typeof node[key] === 'string' && node[key].trim()) return node[key].trim();
  }
  return null;
}

function isGeneratedRoute(route) {
  return GENERATED_PREFIXES.some((prefix) => `${route}/`.startsWith(prefix));
}

/** Collect every page route below an arbitrary navigation fragment. */
function flattenRoutes(items, out = []) {
  if (typeof items === 'string') {
    out.push(normalizeRoute(items));
    return out;
  }
  if (Array.isArray(items)) {
    for (const item of items) flattenRoutes(item, out);
    return out;
  }
  if (items && typeof items === 'object') {
    for (const key of CONTAINER_KEYS) {
      if (items[key]) flattenRoutes(items[key], out);
    }
  }
  return out;
}

/**
 * Build the ordered export tree.
 *
 * @param {object} docsConfig Parsed docs.json.
 * @param {object} options
 * @param {(route: string) => string | null} options.resolveSource Maps a route to a source file.
 * @returns {{
 *   tree: Array<GroupNode | PageNode>,
 *   pages: PageNode[],
 *   skipped: { hidden: string[], generated: string[], duplicates: string[], missing: string[], external: string[] },
 *   hiddenRoutes: Set<string>,
 * }}
 */
export function collectNavigation(docsConfig, { resolveSource }) {
  const seen = new Set();
  const pages = [];
  const skipped = { hidden: [], generated: [], duplicates: [], missing: [], external: [] };
  const hiddenRoutes = new Set();

  function walk(items) {
    const nodes = [];
    for (const item of Array.isArray(items) ? items : [items]) {
      if (item === null || item === undefined) continue;

      if (typeof item === 'string') {
        const page = visitPage(item);
        if (page) nodes.push(page);
        continue;
      }

      if (typeof item !== 'object') continue;

      const label = labelOf(item);

      if (item.hidden === true) {
        skipped.hidden.push(label ?? '(unnamed group)');
        for (const route of flattenRoutes(item)) hiddenRoutes.add(route);
        continue;
      }

      const children = [];
      let hasContainer = false;
      for (const key of CONTAINER_KEYS) {
        if (item[key] === undefined) continue;
        hasContainer = true;
        children.push(...walk(item[key]));
      }

      if (typeof item.openapi === 'string') {
        // Generated API reference group: endpoint pages come from the spec.
        skipped.generated.push(`${label ?? 'openapi'} (${item.openapi})`);
        if (!hasContainer) continue;
      }

      if (!hasContainer) continue;

      if (label) {
        if (children.length > 0) nodes.push({ type: 'group', title: label, children });
      } else {
        nodes.push(...children);
      }
    }
    return nodes;
  }

  function visitPage(entry) {
    if (/^https?:\/\//i.test(entry)) {
      skipped.external.push(entry);
      return null;
    }
    const route = normalizeRoute(entry);
    if (!route) return null;
    if (isGeneratedRoute(route)) {
      skipped.generated.push(route);
      return null;
    }
    if (seen.has(route)) {
      skipped.duplicates.push(route);
      return null;
    }
    seen.add(route);
    const file = resolveSource(route);
    if (!file) {
      skipped.missing.push(route);
      return null;
    }
    const page = { type: 'page', route, file };
    pages.push(page);
    return page;
  }

  const navigation = docsConfig?.navigation ?? {};
  const rootNodes = walk(navigation);

  // Top level pages that are not inside any group are wrapped so every export
  // part has a title.
  const tree = [];
  let looseChildren = [];
  const flushLoose = () => {
    if (looseChildren.length > 0) {
      tree.push({ type: 'group', title: 'Documentation', children: looseChildren });
      looseChildren = [];
    }
  };
  for (const node of rootNodes) {
    if (node.type === 'page') {
      looseChildren.push(node);
    } else {
      flushLoose();
      tree.push(node);
    }
  }
  flushLoose();

  return { tree, pages, skipped, hiddenRoutes };
}

/** Keep only pages whose route matches one of the given routes or prefixes. */
export function filterNavigation(tree, filters) {
  if (!filters || filters.length === 0) return tree;
  const normalized = filters.map(normalizeRoute);
  const matches = (route) => normalized.some((f) => route === f || route.startsWith(`${f}/`));

  function prune(nodes) {
    const out = [];
    for (const node of nodes) {
      if (node.type === 'page') {
        if (matches(node.route)) out.push(node);
      } else {
        const children = prune(node.children);
        if (children.length > 0) out.push({ ...node, children });
      }
    }
    return out;
  }
  return prune(tree);
}

/**
 * Remove pages whose route matches one of the given routes or prefixes.
 * Returns the pruned tree and the routes that were removed.
 */
export function excludeNavigation(tree, excludes) {
  const removed = [];
  if (!excludes || excludes.length === 0) return { tree, removed };
  const normalized = excludes.map(normalizeRoute).filter(Boolean);
  const matches = (route) => normalized.some((e) => route === e || route.startsWith(`${e}/`));

  function prune(nodes) {
    const out = [];
    for (const node of nodes) {
      if (node.type === 'page') {
        if (matches(node.route)) removed.push(node.route);
        else out.push(node);
      } else {
        const children = prune(node.children);
        if (children.length > 0) out.push({ ...node, children });
      }
    }
    return out;
  }
  return { tree: prune(tree), removed };
}

/** Flatten a tree into ordered page nodes. */
export function flattenPages(tree, out = []) {
  for (const node of tree) {
    if (node.type === 'page') out.push(node);
    else flattenPages(node.children, out);
  }
  return out;
}

/**
 * Find MDX/MD files under the given directories that were not exported and are
 * not part of a hidden group, so authors can see unregistered pages.
 */
export function findUnregisteredPages(docsRoot, exportedRoutes, hiddenRoutes, directories = ['pages', 'examples']) {
  const orphans = [];
  const exported = new Set(exportedRoutes);

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (/\.mdx?$/.test(entry.name)) {
        const route = normalizeRoute(path.relative(docsRoot, abs).split(path.sep).join('/'));
        if (!exported.has(route) && !hiddenRoutes.has(route)) orphans.push(route);
      }
    }
  }

  for (const dir of directories) walk(path.join(docsRoot, dir));
  return orphans.sort();
}

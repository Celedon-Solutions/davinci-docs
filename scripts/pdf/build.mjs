import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildRedirectMap,
  collectNavigation,
  excludeNavigation,
  filterNavigation,
  findUnregisteredPages,
  flattenPages,
  resolveSourceFile,
} from './navigation.mjs';
import { normalizeTree, pageIdForRoute, parsePage, prepareHeadings, renderHtml } from './mdx.mjs';
import { createLinkResolver, DEFAULT_BASE_URL } from './links.mjs';
import { buildDocument } from './template.mjs';
import { renderPdf } from './render.mjs';

export const PDF_FILE_NAME = 'davinci-docs.pdf';
export const OPENAPI_DIR_NAME = 'openapi';

// Routes (or route prefixes) left out of the PDF by default.
export const DEFAULT_EXCLUDES = ['pages/release-notes'];

/**
 * Refuse to delete anything that could be (or contain) the docs source.
 */
export function assertSafeBuildDir(outDir, docsRoot) {
  const out = path.resolve(outDir);
  const root = path.resolve(docsRoot);
  const relative = path.relative(out, root);
  const containsRoot = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  if (containsRoot || out === path.parse(out).root) {
    throw new Error(`Refusing to clean "${out}": it contains the docs source directory`);
  }
  if (fs.existsSync(path.join(out, 'docs.json'))) {
    throw new Error(`Refusing to clean "${out}": it looks like a docs source directory`);
  }
  return out;
}

/** Remove and recreate the build directory. */
export function prepareBuildDir(outDir, docsRoot) {
  const out = assertSafeBuildDir(outDir, docsRoot);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  return out;
}

/**
 * Copy the OpenAPI spec into `<out>/openapi/`. The docs-local copy (what
 * Mintlify publishes) wins; the monorepo root copy is used as a fallback.
 */
export function copyOpenApi(docsRoot, outDir, docsConfig = {}) {
  const configured = docsConfig?.api?.openapi?.source;
  const relative = typeof configured === 'string' ? configured : 'openapi/davinci-public.v2.yaml';
  const candidates = [path.join(docsRoot, relative), path.join(docsRoot, '..', relative)];
  const source = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!source) {
    throw new Error(`OpenAPI spec not found. Looked in:\n${candidates.map((c) => `  ${c}`).join('\n')}`);
  }
  const targetDir = path.join(outDir, OPENAPI_DIR_NAME);
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, path.basename(source));
  fs.copyFileSync(source, target);
  if (fs.statSync(target).size === 0) throw new Error(`OpenAPI spec copied from ${source} is empty`);
  return { source, target };
}

function resolveLogo(docsRoot, docsConfig) {
  const logo = docsConfig?.logo;
  const candidate = typeof logo === 'string' ? logo : (logo?.light ?? logo?.dark);
  if (typeof candidate !== 'string') return undefined;
  const abs = path.join(docsRoot, candidate);
  return fs.existsSync(abs) ? pathToFileURL(abs).href : undefined;
}

function createImageResolver(docsRoot) {
  return function resolveImage(src, pageFile) {
    if (/^(https?:|data:)/i.test(src)) return src;
    let clean = src.split(/[?#]/)[0];
    try {
      clean = decodeURI(clean);
    } catch {
      // keep the raw value
    }
    const abs = clean.startsWith('/') ? path.join(docsRoot, clean) : path.resolve(path.dirname(pageFile), clean);
    const inside = path.relative(docsRoot, abs);
    if (inside.startsWith('..') || path.isAbsolute(inside)) return null;
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
    return pathToFileURL(abs).href;
  };
}

/**
 * Run the full export.
 *
 * @param {object} options
 * @param {string} options.docsRoot
 * @param {string} options.outDir
 * @param {string[]} [options.pages] Restrict to these routes/prefixes.
 * @param {boolean} [options.htmlOnly] Skip Chromium and keep the HTML.
 * @param {boolean} [options.keepHtml]
 * @param {string} [options.format]
 * @param {string} [options.baseUrl]
 * @param {{log: Function, warn: Function}} [logger]
 */
export async function exportDocs(options, logger = console) {
  const {
    docsRoot,
    outDir,
    pages: pageFilter = [],
    exclude = DEFAULT_EXCLUDES,
    htmlOnly = false,
    keepHtml = false,
    format = 'Letter',
  } = options;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  const configPath = path.join(docsRoot, 'docs.json');
  const docsConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const nav = collectNavigation(docsConfig, { resolveSource: (route) => resolveSourceFile(docsRoot, route) });
  const { tree, removed: excludedRoutes } = excludeNavigation(filterNavigation(nav.tree, pageFilter), exclude);
  const pageNodes = flattenPages(tree);
  if (pageNodes.length === 0) throw new Error('No documentation pages matched the export selection');

  const warnings = [];
  const warnFor = (route) => (message) => warnings.push({ route, message });

  // Stage 1: parse every page and collect heading slugs for link validation.
  const parsed = new Map();
  const headings = new Map();
  for (const node of pageNodes) {
    const source = fs.readFileSync(node.file, 'utf8');
    const page = parsePage(source, { onWarning: warnFor(node.route) });
    headings.set(node.route, prepareHeadings(page.tree, pageIdForRoute(node.route)));
    parsed.set(node.route, { ...page, node });
  }

  // Stage 2: normalize components/links and render each page to HTML.
  const pageRoutes = new Set(pageNodes.map((node) => node.route));
  const externalized = new Map();
  const resolveLinkFor = createLinkResolver({
    pageRoutes,
    headings,
    redirects: buildRedirectMap(docsConfig.redirects),
    baseUrl,
    onExternalized: (route, fromRoute) => {
      if (!externalized.has(route)) externalized.set(route, new Set());
      externalized.get(route).add(fromRoute);
    },
  });
  const resolveImage = createImageResolver(docsRoot);

  const pageHtml = new Map();
  for (const [route, page] of parsed) {
    normalizeTree(page.tree, {
      warn: warnFor(route),
      resolveLink: (href) => resolveLinkFor(href, route),
      resolveImage: (src) => resolveImage(src, page.node.file),
    });
    const title = String(page.frontmatter.title ?? route.split('/').pop());
    const description = typeof page.frontmatter.description === 'string' ? page.frontmatter.description : '';
    pageHtml.set(route, { title, description, html: renderHtml(page.tree) });
  }

  const generatedOn = new Date().toISOString().slice(0, 10);
  const html = buildDocument({
    tree,
    pageHtml,
    title: `${docsConfig.name ?? 'Davinci'} Documentation`,
    subtitle: 'Product guides, modeling reference, and developer API guides',
    logoUrl: resolveLogo(docsRoot, docsConfig),
    generatedOn,
  });

  // Stage 3: write outputs into the (recreated) build directory.
  const out = prepareBuildDir(outDir, docsRoot);
  const openapi = copyOpenApi(docsRoot, out, docsConfig);
  const htmlPath = path.join(out, 'davinci-docs.html');
  const pdfPath = path.join(out, PDF_FILE_NAME);
  fs.writeFileSync(htmlPath, html);

  let pdfBytes = 0;
  if (!htmlOnly) {
    await renderPdf({ htmlPath, pdfPath, format });
    pdfBytes = fs.statSync(pdfPath).size;
    if (pdfBytes === 0) throw new Error('PDF export produced an empty file');
    if (!keepHtml) fs.rmSync(htmlPath, { force: true });
  }

  const unregistered = findUnregisteredPages(
    docsRoot,
    pageNodes.map((node) => node.route),
    new Set([...nav.hiddenRoutes, ...excludedRoutes]),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    pageCount: pageNodes.length,
    pdf: htmlOnly ? null : pdfPath,
    pdfBytes,
    html: htmlOnly || keepHtml ? htmlPath : null,
    openapi: openapi.target,
    pages: pageNodes.map((node) => node.route),
    skipped: {
      hiddenGroups: nav.skipped.hidden,
      excludedPages: excludedRoutes,
      generatedEntries: nav.skipped.generated,
      duplicateEntries: nav.skipped.duplicates,
      missingSources: nav.skipped.missing,
      externalEntries: nav.skipped.external,
    },
    unregisteredPages: unregistered,
    linksToPublishedSite: Object.fromEntries(
      [...externalized].map(([route, from]) => [route, [...from].sort()]),
    ),
    warnings,
  };
  fs.writeFileSync(path.join(out, 'export-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  logSummary(report, logger);
  return report;
}

function logSummary(report, logger) {
  logger.log(`Exported ${report.pageCount} pages`);
  if (report.pdf) logger.log(`  PDF:     ${report.pdf} (${(report.pdfBytes / 1024 / 1024).toFixed(1)} MB)`);
  if (report.html) logger.log(`  HTML:    ${report.html}`);
  logger.log(`  OpenAPI: ${report.openapi}`);
  logger.log(`  Report:  ${path.join(path.dirname(report.openapi), '..', 'export-report.json')}`);

  const { skipped } = report;
  if (skipped.hiddenGroups.length) logger.log(`  Skipped hidden groups: ${skipped.hiddenGroups.join(', ')}`);
  if (skipped.excludedPages.length) logger.log(`  Excluded pages (--exclude): ${skipped.excludedPages.length}`);
  if (skipped.generatedEntries.length) logger.log(`  Skipped generated API entries: ${skipped.generatedEntries.length}`);
  if (skipped.duplicateEntries.length) logger.log(`  Skipped duplicate page entries: ${skipped.duplicateEntries.length}`);
  if (skipped.missingSources.length) {
    logger.warn(`  Missing source files for navigation entries:\n    ${skipped.missingSources.join('\n    ')}`);
  }
  if (report.unregisteredPages.length) {
    logger.log(`  Pages not registered in docs.json (not exported): ${report.unregisteredPages.length}`);
    for (const route of report.unregisteredPages) logger.log(`    ${route}`);
  }
  const external = Object.keys(report.linksToPublishedSite).length;
  if (external) logger.log(`  Links to pages outside the PDF (point to the published site): ${external} targets`);
  if (report.warnings.length) {
    logger.warn(`  Warnings (${report.warnings.length}):`);
    for (const { route, message } of report.warnings) logger.warn(`    ${route}: ${message}`);
  }
}

#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DEFAULT_EXCLUDES, exportDocs } from './pdf/build.mjs';

/**
 * Export the hand-authored documentation to a single PDF, plus a copy of the
 * OpenAPI spec, under docs/build (git-ignored).
 *
 * Usage: node scripts/export-pdf.mjs [options]
 *   --out <dir>        Output directory (default: <docs>/build, recreated each run)
 *   --pages <routes>   Comma-separated routes or prefixes to export (default: all)
 *   --exclude <routes> Comma-separated routes or prefixes to leave out
 *                      (default: pages/release-notes; pass --exclude "" to include everything)
 *   --format <size>    PDF page size: Letter (default) or A4
 *   --base-url <url>   Site used for links to pages that are not in the PDF
 *   --html-only        Skip Chromium; write the intermediate HTML only
 *   --keep-html        Keep the intermediate HTML next to the PDF
 *   --strict           Exit non-zero if any warning or missing page is reported
 */

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    pages: { type: 'string' },
    exclude: { type: 'string' },
    format: { type: 'string', default: 'Letter' },
    'base-url': { type: 'string' },
    'html-only': { type: 'boolean', default: false },
    'keep-html': { type: 'boolean', default: false },
    strict: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const splitList = (value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []);

if (values.help) {
  console.log(`Usage: node scripts/export-pdf.mjs [--out dir] [--pages a,b] [--exclude a,b] [--format Letter|A4] [--base-url url] [--html-only] [--keep-html] [--strict]`);
  process.exit(0);
}

try {
  const report = await exportDocs({
    docsRoot,
    outDir: path.resolve(values.out ?? path.join(docsRoot, 'build')),
    pages: splitList(values.pages),
    exclude: values.exclude === undefined ? DEFAULT_EXCLUDES : splitList(values.exclude),
    format: values.format,
    baseUrl: values['base-url'],
    htmlOnly: values['html-only'],
    keepHtml: values['keep-html'],
  });
  if (values.strict && (report.warnings.length > 0 || report.skipped.missingSources.length > 0)) {
    console.error('Strict mode: warnings or missing pages were reported');
    process.exit(1);
  }
} catch (error) {
  console.error(`PDF export failed: ${error.message}`);
  process.exit(1);
}

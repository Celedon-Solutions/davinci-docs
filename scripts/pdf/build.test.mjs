import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertSafeBuildDir, copyOpenApi, exportDocs, prepareBuildDir } from './build.mjs';

const quietLogger = { log() {}, warn() {} };

function makeDocs({ openapiInDocs = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-pdf-'));
  const docsRoot = path.join(base, 'docs');
  fs.mkdirSync(path.join(docsRoot, 'pages', 'guide'), { recursive: true });
  fs.mkdirSync(path.join(docsRoot, 'pages', 'orphans'), { recursive: true });
  fs.mkdirSync(path.join(docsRoot, 'images'), { recursive: true });
  fs.writeFileSync(path.join(docsRoot, 'images', 'a.png'), 'png');
  fs.writeFileSync(
    path.join(docsRoot, 'docs.json'),
    JSON.stringify({
      name: 'Test',
      api: { openapi: { source: 'openapi/spec.yaml' } },
      navigation: {
        groups: [
          { group: 'Guide', pages: ['pages/guide/one', 'pages/guide/two'] },
          { group: 'Reference', openapi: 'openapi/spec.yaml' },
        ],
      },
    }),
  );
  fs.writeFileSync(
    path.join(docsRoot, 'pages', 'guide', 'one.mdx'),
    '---\ntitle: One\ndescription: First page\n---\n\n## Intro\n\n<Frame><img src="/images/a.png" alt="A" /></Frame>\n\nSee [two](/pages/guide/two#more).\n',
  );
  fs.writeFileSync(
    path.join(docsRoot, 'pages', 'guide', 'two.mdx'),
    '---\ntitle: Two\n---\n\n<Note>Second page note.</Note>\n\n## More\n',
  );
  fs.writeFileSync(path.join(docsRoot, 'pages', 'orphans', 'lost.mdx'), '---\ntitle: Lost\n---\n');
  const spec = 'openapi: 3.1.0\n';
  if (openapiInDocs) {
    fs.mkdirSync(path.join(docsRoot, 'openapi'));
    fs.writeFileSync(path.join(docsRoot, 'openapi', 'spec.yaml'), spec);
  } else {
    fs.mkdirSync(path.join(base, 'openapi'));
    fs.writeFileSync(path.join(base, 'openapi', 'spec.yaml'), spec);
  }
  return { base, docsRoot };
}

test('exportDocs recreates the build dir, copies OpenAPI, and renders page content', async () => {
  const { docsRoot } = makeDocs();
  const outDir = path.join(docsRoot, 'build');
  fs.mkdirSync(path.join(outDir, 'stale'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'stale', 'old.txt'), 'old');

  const report = await exportDocs({ docsRoot, outDir, htmlOnly: true }, quietLogger);

  assert.ok(!fs.existsSync(path.join(outDir, 'stale')), 'stale output is removed');
  assert.equal(fs.readFileSync(path.join(outDir, 'openapi', 'spec.yaml'), 'utf8'), 'openapi: 3.1.0\n');
  const html = fs.readFileSync(path.join(outDir, 'davinci-docs.html'), 'utf8');
  assert.ok(html.includes('First page'));
  assert.ok(html.includes('Second page note.'));
  assert.ok(html.includes('href="#page-pages-guide-two--more"'));
  assert.ok(html.includes('images/a.png'));
  assert.ok(html.indexOf('id="page-pages-guide-one"') < html.indexOf('id="page-pages-guide-two"'));
  assert.deepEqual(report.pages, ['pages/guide/one', 'pages/guide/two']);
  assert.deepEqual(report.unregisteredPages, ['pages/orphans/lost']);
  assert.equal(report.skipped.generatedEntries.length, 1);
  assert.ok(fs.existsSync(path.join(outDir, 'export-report.json')));
});

test('copyOpenApi falls back to the monorepo root copy', () => {
  const { docsRoot } = makeDocs({ openapiInDocs: false });
  const outDir = path.join(docsRoot, 'build');
  fs.mkdirSync(outDir);
  const { target } = copyOpenApi(docsRoot, outDir, { api: { openapi: { source: 'openapi/spec.yaml' } } });
  assert.equal(target, path.join(outDir, 'openapi', 'spec.yaml'));
  assert.ok(fs.statSync(target).size > 0);
});

test('copyOpenApi fails clearly when the spec is missing', () => {
  const { docsRoot } = makeDocs();
  fs.rmSync(path.join(docsRoot, 'openapi'), { recursive: true });
  assert.throws(() => copyOpenApi(docsRoot, path.join(docsRoot, 'build'), {}), /OpenAPI spec not found/);
});

test('build directory cleanup refuses to touch the docs source or its parents', () => {
  const { base, docsRoot } = makeDocs();
  assert.throws(() => assertSafeBuildDir(docsRoot, docsRoot), /Refusing to clean/);
  assert.throws(() => assertSafeBuildDir(base, docsRoot), /Refusing to clean/);
  assert.throws(() => assertSafeBuildDir(path.parse(base).root, docsRoot), /Refusing to clean/);
  const out = prepareBuildDir(path.join(docsRoot, 'build'), docsRoot);
  assert.ok(fs.existsSync(out));
  assert.ok(fs.existsSync(path.join(docsRoot, 'docs.json')));
});

test('exportDocs leaves out release notes by default and honors custom excludes', async () => {
  const { docsRoot } = makeDocs();
  fs.mkdirSync(path.join(docsRoot, 'pages', 'release-notes'));
  fs.writeFileSync(path.join(docsRoot, 'pages', 'release-notes', 'v1.mdx'), '---\ntitle: Version 1\n---\n\nShipped.\n');
  const config = JSON.parse(fs.readFileSync(path.join(docsRoot, 'docs.json'), 'utf8'));
  config.navigation.groups.push({ group: 'Release Notes', pages: ['pages/release-notes/v1'] });
  fs.writeFileSync(path.join(docsRoot, 'docs.json'), JSON.stringify(config));
  const outDir = path.join(docsRoot, 'build');

  const byDefault = await exportDocs({ docsRoot, outDir, htmlOnly: true }, quietLogger);
  assert.ok(!byDefault.pages.includes('pages/release-notes/v1'));
  assert.deepEqual(byDefault.skipped.excludedPages, ['pages/release-notes/v1']);
  assert.ok(!byDefault.unregisteredPages.includes('pages/release-notes/v1'));
  assert.ok(!fs.readFileSync(path.join(outDir, 'davinci-docs.html'), 'utf8').includes('Version 1'));

  const included = await exportDocs({ docsRoot, outDir, htmlOnly: true, exclude: [] }, quietLogger);
  assert.ok(included.pages.includes('pages/release-notes/v1'));
  assert.ok(fs.readFileSync(path.join(outDir, 'davinci-docs.html'), 'utf8').includes('Version 1'));
});

test('exportDocs honors the page filter', async () => {
  const { docsRoot } = makeDocs();
  const outDir = path.join(docsRoot, 'build');
  const report = await exportDocs({ docsRoot, outDir, htmlOnly: true, pages: ['pages/guide/two'] }, quietLogger);
  assert.deepEqual(report.pages, ['pages/guide/two']);
  const html = fs.readFileSync(path.join(outDir, 'davinci-docs.html'), 'utf8');
  assert.ok(!html.includes('First page'));
});

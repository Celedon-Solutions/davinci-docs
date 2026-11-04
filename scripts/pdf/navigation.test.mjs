import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRedirectMap,
  collectNavigation,
  excludeNavigation,
  filterNavigation,
  flattenPages,
  followRedirects,
  normalizeRoute,
} from './navigation.mjs';

const existing = new Set([
  'pages/a',
  'pages/b',
  'pages/c',
  'pages/d',
  'pages/api/intro',
  'pages/hidden/one',
  'pages/loose',
]);
const resolveSource = (route) => (existing.has(route) ? `/fake/${route}.mdx` : null);

const config = {
  navigation: {
    groups: [
      {
        group: 'First',
        pages: ['pages/a', { group: 'Nested', pages: ['pages/b', 'pages/missing'] }],
      },
      {
        group: 'Second',
        pages: ['pages/b', { group: 'Duplicates Only', pages: ['pages/a'] }, 'pages/c'],
      },
      { group: 'Developer API', pages: [{ group: 'Guides', pages: ['pages/api/intro'] }, { group: 'Reference', openapi: 'openapi/spec.yaml' }] },
      { group: 'Archive', hidden: true, pages: ['pages/hidden/one'] },
      { group: 'Generated Only', pages: ['api-reference/projects/list'] },
    ],
  },
};

test('normalizeRoute strips slashes, extensions, queries, and anchors', () => {
  assert.equal(normalizeRoute('/pages/a.mdx'), 'pages/a');
  assert.equal(normalizeRoute('pages/a/#frag'), 'pages/a');
  assert.equal(normalizeRoute('  /pages/a?x=1 '), 'pages/a');
});

test('collectNavigation preserves order and deduplicates pages', () => {
  const { tree, pages, skipped } = collectNavigation(config, { resolveSource });
  assert.deepEqual(
    pages.map((p) => p.route),
    ['pages/a', 'pages/b', 'pages/c', 'pages/api/intro'],
  );
  assert.deepEqual(skipped.duplicates, ['pages/b', 'pages/a']);
  assert.deepEqual(
    tree.map((part) => part.title),
    ['First', 'Second', 'Developer API'],
  );
  const first = tree[0];
  assert.equal(first.children[0].route, 'pages/a');
  assert.equal(first.children[1].title, 'Nested');
});

test('collectNavigation skips hidden, generated, and missing entries and reports them', () => {
  const { tree, skipped, hiddenRoutes } = collectNavigation(config, { resolveSource });
  assert.deepEqual(skipped.hidden, ['Archive']);
  assert.ok(hiddenRoutes.has('pages/hidden/one'));
  assert.deepEqual(skipped.missing, ['pages/missing']);
  assert.ok(skipped.generated.some((entry) => entry.includes('openapi/spec.yaml')));
  assert.ok(skipped.generated.includes('api-reference/projects/list'));
  // Groups left empty after skipping are pruned.
  assert.ok(!tree.some((part) => part.title === 'Generated Only'));
  const api = tree.find((part) => part.title === 'Developer API');
  assert.deepEqual(
    api.children.map((child) => child.title),
    ['Guides'],
  );
});

test('top-level loose pages are wrapped in a Documentation part', () => {
  const { tree } = collectNavigation({ navigation: { pages: ['pages/loose'] } }, { resolveSource });
  assert.equal(tree.length, 1);
  assert.equal(tree[0].title, 'Documentation');
  assert.equal(tree[0].children[0].route, 'pages/loose');
});

test('filterNavigation keeps matching routes and prunes empty groups', () => {
  const { tree } = collectNavigation(config, { resolveSource });
  const filtered = filterNavigation(tree, ['pages/api']);
  assert.deepEqual(
    flattenPages(filtered).map((p) => p.route),
    ['pages/api/intro'],
  );
  assert.equal(filtered.length, 1);
  assert.deepEqual(flattenPages(filterNavigation(tree, [])).length, 4);
});

test('excludeNavigation removes matching routes by prefix and prunes empty groups', () => {
  const { tree } = collectNavigation(config, { resolveSource });
  const { tree: pruned, removed } = excludeNavigation(tree, ['pages/api', 'pages/c']);
  assert.deepEqual(removed.sort(), ['pages/api/intro', 'pages/c']);
  assert.deepEqual(
    flattenPages(pruned).map((p) => p.route),
    ['pages/a', 'pages/b'],
  );
  assert.ok(!pruned.some((part) => part.title === 'Developer API'));
  assert.equal(excludeNavigation(tree, []).tree, tree);
});

test('redirects resolve through multiple hops', () => {
  const redirects = buildRedirectMap([
    { source: '/old', destination: '/mid' },
    { source: '/mid', destination: '/pages/a' },
  ]);
  assert.equal(followRedirects('old', redirects), 'pages/a');
  assert.equal(followRedirects('pages/b', redirects), 'pages/b');
});

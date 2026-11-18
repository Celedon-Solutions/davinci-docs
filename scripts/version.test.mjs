import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { latestRelease, syncNavbarVersion } from './version.mjs';

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function config({ releasePages, links = [] }) {
  return {
    navbar: { links, primary: { type: 'button', href: 'https://example.com', label: 'Use' } },
    navigation: {
      groups: [
        { group: 'Guide', pages: ['pages/guide/one'] },
        { group: 'Release Notes', pages: releasePages },
      ],
    },
  };
}

test('latestRelease reads the first release notes page', () => {
  const docs = config({
    releasePages: ['pages/release-notes/v5.3.5', { group: 'Prior Versions', pages: ['pages/release-notes/v5.3.4'] }],
  });
  assert.deepEqual(latestRelease(docs), { version: '5.3.5', route: 'pages/release-notes/v5.3.5' });
});

test('latestRelease accepts pre-release versions and finds nested first pages', () => {
  const docs = config({ releasePages: [{ group: 'Current', pages: ['pages/release-notes/v5.4.0-rc.1'] }] });
  assert.equal(latestRelease(docs).version, '5.4.0-rc.1');
});

test('latestRelease returns null without a versioned release notes page', () => {
  assert.equal(latestRelease(config({ releasePages: ['pages/release-notes/v1'] })), null);
  assert.equal(latestRelease({ navigation: { groups: [] } }), null);
});

test('syncNavbarVersion adds the version link first when it is missing', () => {
  const other = { label: 'Company', href: 'https://example.com' };
  const { config: next, changed } = syncNavbarVersion(
    config({ releasePages: ['pages/release-notes/v5.3.5'], links: [other] }),
  );
  assert.equal(changed, true);
  assert.deepEqual(next.navbar.links, [{ label: 'v5.3.5', href: '/pages/release-notes/v5.3.5' }, other]);
});

test('syncNavbarVersion updates a stale version link in place and keeps other fields', () => {
  const stale = { label: 'v5.3.4', href: '/pages/release-notes/v5.3.4', icon: 'tag' };
  const { config: next, changed } = syncNavbarVersion(
    config({ releasePages: ['pages/release-notes/v5.3.5'], links: [{ label: 'A', href: 'https://a' }, stale] }),
  );
  assert.equal(changed, true);
  assert.deepEqual(next.navbar.links[1], { label: 'v5.3.5', href: '/pages/release-notes/v5.3.5', icon: 'tag' });
});

test('syncNavbarVersion reports no change when the link is current', () => {
  const docs = config({
    releasePages: ['pages/release-notes/v5.3.5'],
    links: [{ label: 'v5.3.5', href: '/pages/release-notes/v5.3.5' }],
  });
  const result = syncNavbarVersion(docs);
  assert.equal(result.changed, false);
  assert.equal(result.config, docs);
});

test('docs.json navbar version link matches the latest release notes page', () => {
  const docs = JSON.parse(fs.readFileSync(path.join(docsRoot, 'docs.json'), 'utf8'));
  const { changed, release } = syncNavbarVersion(docs);
  assert.equal(changed, false, `Navbar version link should be v${release.version}; run npm run version:sync`);
});

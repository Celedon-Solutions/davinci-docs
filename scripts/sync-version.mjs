#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { syncNavbarVersion } from './version.mjs';

/**
 * Set the navbar version link in docs.json to the latest release notes page.
 *
 * Usage: node scripts/sync-version.mjs [--check]
 *   --check   Report whether the link is current without writing; exit 1 when it is not
 */

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(docsRoot, 'docs.json');
const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } });

try {
  const docsConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const { config, changed, release } = syncNavbarVersion(docsConfig);
  if (!changed) {
    console.log(`Navbar version link is current: v${release.version}`);
  } else if (values.check) {
    console.error(`Navbar version link is out of date; latest release is v${release.version}. Run npm run version:sync.`);
    process.exit(1);
  } else {
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 4)}\n`);
    console.log(`Navbar version link set to v${release.version}`);
  }
} catch (error) {
  console.error(`Version sync failed: ${error.message}`);
  process.exit(1);
}

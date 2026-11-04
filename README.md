# Davinci Documentation

This directory is the Mintlify documentation site for Davinci. It is tracked as the `docs` submodule from `Celedon-Solutions/davinci-docs`.

## Structure

- `docs.json` - Mintlify site configuration, navigation, redirects, theme, and OpenAPI API reference wiring.
- `pages/` - Handwritten product documentation.
- `pages/release-notes/` - Versioned release notes.
- `examples/` - Example workflows and model walkthroughs.
- `images/` and `logo/` - Static assets used by documentation pages.
- `openapi/davinci-public.v2.yaml` - The OpenAPI spec copy consumed by Mintlify.
- `.mintignore` - Files excluded from the Mintlify build, including generated database schema output.

## Local Development

Run the local Mintlify preview from the repository root with Docker:

```bash
docker run --rm -p 3000:3000 -v "$PWD/docs:/docs" -w /docs node:24-alpine sh -c "npm install -g mintlify@latest >/tmp/mintlify-install.log && mintlify dev --host 0.0.0.0 --port 3000"
```

Then open `http://localhost:3000`.

This keeps `node`, `npm`, and Mintlify out of the host environment. The command installs Mintlify inside the disposable container and mounts the local `docs/` directory so edits update the preview.

## Editing Docs

- Add or edit pages under `pages/`.
- Register new public pages in `docs.json`; unregistered pages may not appear in navigation.
- Put release notes under `pages/release-notes/` and add the newest page near the top of the Release Notes navigation group.
- Keep links rooted at `/pages/...` for internal documentation links.
- Do not commit generated local preview artifacts or generated database schema output.

## OpenAPI Dependency

Mintlify builds the API reference from `docs/openapi/davinci-public.v2.yaml`. The canonical source lives at `../openapi/davinci-public.v2.yaml`.

When public API docs or the OpenAPI contract change, regenerate/sync the docs copy from the repo root:

```bash
npm run openapi:generate:docs
```

The full API generation workflow also updates SDK generated clients:

```bash
npm run openapi:generate
```

## PDF Export

One command writes a content-first PDF of the hand-authored docs and a copy of the OpenAPI spec into `docs/build/` (git-ignored and excluded from the Mintlify build). Run it from the repository root; Chromium, Playwright, and `node_modules` all stay inside Docker:

```bash
docker run --rm --ipc=host -v "$PWD/docs:/docs" -v davinci-docs-pdf-node-modules:/docs/node_modules -w /docs mcr.microsoft.com/playwright:v1.64.1-noble sh -c "npm ci --no-audit --no-fund && npm run pdf:export"
```

The `davinci-docs-pdf-node-modules` named volume keeps dependencies off the host (Docker leaves an empty, git-ignored `docs/node_modules` mount point). The image tag must match the pinned `playwright` version in `package.json`; update both together.

Output (`docs/build/` is deleted and recreated on every run):

- `davinci-docs.pdf` - cover, contents, and one section per page, with PDF bookmarks and page numbers.
- `openapi/davinci-public.v2.yaml` - the OpenAPI spec (the `docs/openapi/` copy, falling back to `../openapi/`).
- `export-report.json` - exported pages, skipped entries, unregistered pages, links that point to the published site, and warnings.

Scope:

- Pages are taken from `docs.json` navigation in order. Pages listed in more than one group appear once, at their first position.
- Hidden groups (for example the Release Notes Archive), generated OpenAPI endpoint pages, and all release notes (`pages/release-notes`) are excluded. The handwritten API guides in navigation (`pages/api/...`) are included.
- Pages that exist under `pages/` or `examples/` but are not registered in `docs.json` are not exported; they are listed in the console output and report.
- The export reads MDX source and renders it with a plain print stylesheet. It does not reproduce the Mintlify site's look.
- Links to exported pages become in-PDF links. Links to anything else (for example `/api-reference/...`) point to `https://docs.davinci-app.com`.

Options (append after `npm run pdf:export --`): `--pages pages/admin,pages/api` to export a subset, `--exclude pages/admin` to replace the default exclusion (`pages/release-notes`; use `--exclude ""` to include everything), `--format A4`, `--out <dir>`, `--keep-html`, `--html-only` (no Chromium), and `--strict` (exit non-zero on warnings or missing pages).

Run the exporter's tests the same way, replacing the last command with `npm run pdf:test`.

Known limitations:

- Web-only content is dropped or simplified: `<style>`/`<script>` blocks are removed, video/iframe embeds become links, and tabs, accordions, and cards are laid out in full, one after another.
- Unknown MDX components render their children as-is and are reported as warnings. A page that fails MDX parsing falls back to plain Markdown and is reported.
- The PDF is large (images are included at full resolution).
- The contents page links to pages but does not show page numbers; use the PDF bookmarks.

## Database Schema Reference

Database schema documentation can be generated with SchemaSpy against the development database. The command is documented in `../RoutingServer/coreDb/readme.md`:

```bash
docker run --rm --network davinci-development_private_net \
  -v "$PWD/docs/db-schema:/output" \
  -e SCHEMASPY_PASSWORD=davinci \
  schemaspy/schemaspy:latest \
  -t pgsql11 -host core-database -port 5432 \
  -db core_database -u davinci -p password
```

Run it from the repository root while the development Docker stack is running. The generated `docs/db-schema/` directory is ignored by Mintlify.

## Publishing

Docs are deployed by the Mintlify/GitHub integration from the docs repository. Commit docs content, navigation changes, OpenAPI spec copies, and related generated outputs together when they belong to the same change.

## Troubleshooting

- If the preview loads a 404, confirm the container is running from `/docs` and that `docs.json` is present.
- If a page does not appear in the sidebar, confirm it is listed in `docs.json`.
- If the API reference is stale, sync `docs/openapi/davinci-public.v2.yaml` from the canonical `openapi/` spec.
- If port `3000` is already in use, stop the existing local preview or change the host-side port mapping.

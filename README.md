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

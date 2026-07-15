# Template sync for create-pi-extension

The `create-pi-extension` CLI package ships a generated copy of the **template source** (this repository root). Maintainers refresh that bundle before publishing the CLI.

## Command

From the repository root:

```bash
bun run sync:template
```

This writes to `packages/create-pi-extension/template/`. The directory is gitignored because it is generated output.

## What gets copied

Everything under the repository root is copied recursively, except the **sync exclusion list**:

- `packages/`
- `node_modules/`
- `.git/`
- root `bun.lock` / `bun.lockb`

## Version sync

The root `package.json` **repository version** is copied into `packages/create-pi-extension/package.json` on every sync.

## Template package.json cleanup

The synced `template/package.json` has monorepo-only fields removed (`workspaces`, `sync:template` script) so the bundled template stays a standalone Pi package.

## CI check

`npm run ci` runs `sync:template:check`, which regenerates the template and runs `tests/sync-template.test.mjs`.

## Related issues

- Scaffold CLI behavior: follow-up issue `05-implement-create-pi-extension-cli` (DOT-710).

# Release

This repository publishes **`create-pi-extension`** to npm using Trusted Publishing with GitHub Actions OIDC.

The root `pi-extension-template` package is the **template source** and is not published to npm. Only `packages/create-pi-extension` is published.

Do not add `NPM_TOKEN` or long-lived npm tokens to GitHub Secrets.

## One-time npm setup

On npmjs.com, configure Trusted Publishing for **`create-pi-extension`**:

- Publisher: GitHub Actions
- Repository: `eiei114/pi-extension-template`
- Workflow filename: `publish.yml`
- Permissions: publish (and stage publish if used)

Remove or update any Trusted Publisher entry that still targets the legacy root package name `pi-extension-template`.

## Publish

```bash
npm version patch
git push
```

On `main`, `.github/workflows/auto-release.yml` checks the root `package.json` **repository version**. If `v<version>` does not exist yet, it creates the tag, creates the GitHub Release, then explicitly dispatches `.github/workflows/publish.yml` for that tag.

The `v*.*.*` tag also triggers `.github/workflows/publish.yml`, which syncs the bundled template, runs CI, and publishes `create-pi-extension@<version>` to npm when tags are pushed manually.

Publishing also runs when a GitHub Release is published, and can be run manually from GitHub Actions with `workflow_dispatch`.

`publish.yml` runs `npm run sync:template` before publish so the tarball includes the current **Bundled template** under `packages/create-pi-extension/template/`.

The workflow skips `create-pi-extension@<version>` if that exact package version already exists on npm.

### Rerun and manual dispatch

`publish.yml` checks the public npm registry API before `setup-node` configures OIDC auth. That keeps already-published reruns green:

- `workflow_dispatch` on an existing tag/ref
- duplicate `publish.yml` runs for the same `v<version>`
- auto-release handoff retries after a successful publish

When the version already exists, the job still runs validation but logs `publish intentionally skipped` and exits without calling `npm publish`.

Do not use `npm view` after `setup-node` with `registry-url` for this guard. Trusted Publishing OIDC can make authenticated metadata reads look like `404`, which leads to duplicate `E403` publish failures.

See also `docs/publish-rerun-rollout.md` for downstream rollout notes.

## Workflow guardrail

Do not ship a new Pi OSS package or version bump with only `package.json` changes.
The repository must include the release workflow pair:

- `.github/workflows/auto-release.yml` creates `v<version>` tags and GitHub Releases from `main` version bumps.
- `.github/workflows/publish.yml` syncs the template and publishes `create-pi-extension` through Trusted Publishing.

Important: tags or releases created by `GITHUB_TOKEN` do not reliably fan out into another workflow through normal `push.tags` or `release.published` triggers. The template keeps publishing reliable by having `auto-release.yml` explicitly dispatch `publish.yml` after creating the tag/release. If you change the release flow, keep one explicit handoff path: `workflow_dispatch` from auto-release, `repository_dispatch`, or `workflow_run` on the auto-release workflow.

## GitHub Actions requirements

- `permissions: id-token: write`
- `permissions: actions: write` on auto-release so it can dispatch `publish.yml`
- `auto-release.yml` must call `gh workflow run publish.yml --ref "$TAG" -f ref="$TAG"`, or `publish.yml` must have an equivalent explicit handoff trigger such as `workflow_run`
- GitHub-hosted runner
- Node.js 24, so the release job uses a current npm CLI for Trusted Publishing
- Bun (for `sync:template` before publish)
- No `NPM_TOKEN`
- `npm publish` from `packages/create-pi-extension` in the configured workflow file

## First release checklist

- [ ] Root `package.json` version is final (synced into `create-pi-extension` on publish)
- [ ] `packages/create-pi-extension/package.json` name is `create-pi-extension`
- [ ] `repository.url` points to the real GitHub repository
- [ ] npm Trusted Publisher targets `create-pi-extension` + `publish.yml`
- [ ] `npm run ci` passes
- [ ] `npm pack --dry-run` in `packages/create-pi-extension` contains `template/`
- [ ] CHANGELOG.md has the release date

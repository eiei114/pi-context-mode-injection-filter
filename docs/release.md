# Release

This repository publishes `pi-context-mode-injection-filter` through npm Trusted
Publishing with GitHub Actions OIDC. Do not add long-lived npm credentials.

## First release

An npm package must exist before its package-level Trusted Publisher can be
configured. The first release therefore uses an interactive maintainer login:

```bash
npm login --auth-type=web
npm publish --access public
npm logout
```

After `0.1.0` exists, configure its Trusted Publisher on npmjs.com:

- Publisher: GitHub Actions
- Organization or user: `eiei114`
- Repository: `pi-context-mode-injection-filter`
- Workflow filename: `publish.yml`
- Environment: leave empty unless the workflow later uses one

Do not store the temporary login credential in GitHub Secrets.

## Later releases

```bash
npm version patch
git push
```

On `main`, `.github/workflows/auto-release.yml` detects the version change,
creates `v<version>`, creates a GitHub Release, and explicitly dispatches
`publish.yml` for that tag. The explicit dispatch avoids the GitHub limitation
where events created by `GITHUB_TOKEN` do not always start another workflow.

`publish.yml` validates the package, checks whether the exact version already
exists, then publishes with OIDC. Reruns skip an already-published version.

## Checklist

- [ ] `npm run ci` passes.
- [ ] `npm pack --dry-run` contains only intended package files.
- [ ] `package.json` and `CHANGELOG.md` carry the release version.
- [ ] No long-lived npm credential names appear in `.github/workflows/`.
- [ ] Trusted Publisher targets `eiei114/pi-context-mode-injection-filter` and `publish.yml`.
- [ ] npm shows provenance after publish.

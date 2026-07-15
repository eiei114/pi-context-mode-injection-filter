# Contributing

## Development setup

```bash
npm install
npm run ci
```

## Pull requests

- Keep changes focused.
- Add tests for behavior changes.
- Update `CHANGELOG.md` when package behavior changes.
- Run `npm run ci` before opening a pull request.

## Release safety

Publishing uses npm Trusted Publishing. Never add long-lived npm credentials to
GitHub workflow files or repository secrets.

# pi-context-mode-injection-filter

[![CI](https://github.com/eiei114/pi-context-mode-injection-filter/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-context-mode-injection-filter/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-context-mode-injection-filter/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-context-mode-injection-filter/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-context-mode-injection-filter.svg)](https://www.npmjs.com/package/pi-context-mode-injection-filter)
[![npm downloads](https://img.shields.io/npm/dm/pi-context-mode-injection-filter.svg)](https://www.npmjs.com/package/pi-context-mode-injection-filter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)

> Keep context-mode's synthetic routing guidance from becoming the newest user request sent to a model.

## What this is

`pi-context-mode-injection-filter` is a small Pi extension for projects that use
[`context-mode`](https://www.npmjs.com/package/context-mode). It intercepts the
serialized provider payload immediately before each model request.

When context-mode appends its known synthetic routing message after the real
prompt, this extension removes the routing anchor. If that synthetic message also
contains active-memory content, the extension keeps the content and moves it before
the conversation. The user's latest request remains last.

## Features

- Handles provider payloads that use either `messages` or `input` arrays.
- Removes the exact context-mode routing anchor recursively.
- Keeps non-empty active-memory content from the synthetic message.
- Moves retained synthetic context before original conversation messages.
- Adds no runtime dependencies and performs no file or network I/O.

## Install

Global:

```bash
pi install npm:pi-context-mode-injection-filter
```

Project-local:

```bash
pi install npm:pi-context-mode-injection-filter -l
```

Try without installing:

```bash
pi -e npm:pi-context-mode-injection-filter
```

## Quick start

Install this package alongside context-mode, then restart Pi or run `/reload`.
No command or configuration is required. The extension runs on every provider
request through Pi's `before_provider_request` event.

## Compatibility

This is an intentionally narrow compatibility shim. It recognizes the exact
context-mode routing anchor exported in `lib/filter-provider-payload.ts`. If
context-mode changes that text, this package may need a matching update. Any
message containing that full anchor is treated as synthetic, so do not use this
package when preserving a verbatim copy of the anchor in model input is required.

## Package contents

| Path | Purpose |
|---|---|
| `extensions/index.ts` | Registers the provider-request hook. |
| `lib/filter-provider-payload.ts` | Detects, strips, retains, and reorders payload messages. |
| `docs/release.md` | Trusted Publishing setup and release flow. |

## Development

```bash
npm install
npm run ci
pi -e .
```

`npm run ci` runs TypeScript checks, tests, `npm pack --dry-run`, and the
workflow token guard.

## Release

Releases use npm Trusted Publishing through GitHub Actions. Long-lived npm
tokens are not used. See [`docs/release.md`](docs/release.md).

## Security

Pi packages execute with local user permissions. This extension only transforms
the in-memory provider payload; it does not execute commands, read files, or send
additional network requests. Review source before installation.

See [`SECURITY.md`](SECURITY.md) for vulnerability reporting.

## Links

- npm: https://www.npmjs.com/package/pi-context-mode-injection-filter
- GitHub: https://github.com/eiei114/pi-context-mode-injection-filter
- Issues: https://github.com/eiei114/pi-context-mode-injection-filter/issues

## License

MIT

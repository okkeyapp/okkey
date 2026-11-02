# Changelog

All notable changes are generated from the same source as GitHub Release notes
(`scripts/generate-release-notes.mjs` + `docs/release-notes.template.md`).
Do not edit AUTO blocks by hand; edit outside markers or re-run after human review.

To draft notes for the next tag:

```bash
node scripts/generate-release-notes.mjs --from v1.0.0-beta.1 --version 1.0.0-beta.2
```

This writes `docs/releases/v1.0.0-beta.2.md` and updates the AUTO block for that version.
Do **not** publish a GitHub Release or push a git tag from this script.

<a id="v1.0.0-beta.2"></a>

## v1.0.0-beta.2

First public release. The browser extension is not part of this release.

- Docker Compose install from `deploy/docker/install.sh`. On tag v1.0.0-beta.2 the installer defaults `OKKEY_REF` to `v1.0.0-beta.2`.
- Published container images: `ghcr.io/okkeyapp/api`, `ghcr.io/okkeyapp/web`, and `ghcr.io/okkeyapp/worker`. The publish workflow signs those three images with cosign.
- The web app encrypts vault items in the browser and stores them through the API.
- A recovery key wraps the account vault key on the client. The server stores the wrapped key and a public possession key. A new browser proves the recovery key by signing a one-time challenge as a pending device.

# Changelog

All notable changes are generated from the same source as GitHub Release notes
(`scripts/generate-release-notes.mjs` + `docs/release-notes.template.md`).
Do not edit AUTO blocks by hand; edit outside markers or re-run after human review.

To draft notes for the next tag:

```bash
node scripts/generate-release-notes.mjs --from v1.0.0-beta.2 --version 1.0.0-beta.3
```

This writes `docs/releases/v1.0.0-beta.3.md` and updates the AUTO block for that version.
Do **not** publish a GitHub Release or push a git tag from this script.

<a id="v1.0.0-beta.3"></a>

## v1.0.0-beta.3

Public beta after v1.0.0-beta.2. The browser extension is not part of this release. Installer and image pins use `v1.0.0-beta.3` / `1.0.0-beta.3`.

- Device share of the account vault key is stored on the server only as a hybrid X25519 + ML-KEM-768 envelope for a key that stays on the device. A leak of the server database alone is not enough to brute-force the master password offline.
- Self-host system updates: Compose runs an `update-agent` service; an admin can apply a signed `.okpkg` from the GitHub Releases `feed.json` (or an uploaded offline package).
- Shared vaults and additional workspace members are available in Core (within plan quotas).
- Workspace owner can edit server SMTP and the public app URL in **Server mail** settings.
- Pending devices can be approved with a passkey (PRF wrap), including unlock follow-ups after approval.
- A newly chosen master password must be at least 12 characters.
- When outbound mail is not configured, self-host auth can use a login key / codes written to the worker logs.
- Hybrid ML-DSA-65 signatures (crypto profile v2) and related strict-mode shared-vault signature checks.
- Docker Compose install defaults and published images pin `OKKEY_REF=v1.0.0-beta.3` and `OKKEY_IMAGE_TAG=1.0.0-beta.3`.

<a id="v1.0.0-beta.2"></a>

## v1.0.0-beta.2

First public release. The browser extension is not part of this release.

- Docker Compose install from `deploy/docker/install.sh`. On tag v1.0.0-beta.2 the installer defaults `OKKEY_REF` to `v1.0.0-beta.2`.
- Published container images: `ghcr.io/okkeyapp/api`, `ghcr.io/okkeyapp/web`, and `ghcr.io/okkeyapp/worker`. The publish workflow signs those three images with cosign.
- The web app encrypts vault items in the browser and stores them through the API.
- A recovery key wraps the account vault key on the client. The server stores the wrapped key and a public possession key. A new browser proves the recovery key by signing a one-time challenge as a pending device.

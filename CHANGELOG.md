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

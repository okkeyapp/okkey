<!--
Okkey release notes template (RU + EN).
Used by scripts/generate-release-notes.mjs — human edits outside AUTO markers are preserved.
Do not paste private enterprise security-issue details into the public notes.
-->

# Okkey {{VERSION}}

> Pre-release: {{PRE_RELEASE}}

## English

### What's new

{{EN_FEAT}}

### Fixes

{{EN_FIX}}

### Other changes

{{EN_OTHER}}

### Migrations

| Migration | DB rollback | Minimum previous version |
|-----------|-------------|--------------------------|
| {{MIGRATION_ROWS}} | | |

### Compatibility

| Field | Value |
|-------|-------|
| API version | {{API_VERSION}} |
| Data format version | {{DATA_FORMAT_VERSION}} |
| Clients in this slice | {{CLIENTS}} |

### Images (GHCR Core)

| Service | Tag | Multi-arch | Notes |
|---------|-----|------------|-------|
| api | `ghcr.io/okkeyapp/api:{{IMAGE_TAG}}` | amd64 + arm64 | cosign keyless OIDC |
| worker | `ghcr.io/okkeyapp/worker:{{IMAGE_TAG}}` | amd64 + arm64 | cosign keyless OIDC |
| web | `ghcr.io/okkeyapp/web:{{IMAGE_TAG}}` | amd64 + arm64 | cosign keyless OIDC |

Prod pin: **never** `:latest`. Installer pin after this release: `OKKEY_IMAGE_TAG={{IMAGE_TAG}}`.

### Extension

{{EN_EXTENSION}}

### Security fixes (public)

{{EN_SECURITY}}

### Known issues / waivers

{{EN_WAIVERS}}

### Enterprise

Enterprise release notes ship in `okkey-enterprise` with the same SemVer and the line:

`requires okkey {{VERSION}}`

---

## Русский

### Что нового

{{RU_FEAT}}

### Исправления

{{RU_FIX}}

### Прочие изменения

{{RU_OTHER}}

### Миграции

| Миграция | Откат БД | Минимальная предыдущая версия |
|----------|----------|-------------------------------|
| {{MIGRATION_ROWS}} | | |

### Совместимость

| Поле | Значение |
|------|----------|
| Версия API | {{API_VERSION}} |
| Версия формата данных | {{DATA_FORMAT_VERSION}} |
| Клиенты среза | {{CLIENTS}} |

### Образы (GHCR Core)

| Сервис | Тег | Multi-arch | Примечание |
|--------|-----|------------|------------|
| api | `ghcr.io/okkeyapp/api:{{IMAGE_TAG}}` | amd64 + arm64 | cosign keyless OIDC |
| worker | `ghcr.io/okkeyapp/worker:{{IMAGE_TAG}}` | amd64 + arm64 | cosign keyless OIDC |
| web | `ghcr.io/okkeyapp/web:{{IMAGE_TAG}}` | amd64 + arm64 | cosign keyless OIDC |

Prod pin: **никогда** `:latest`. После релиза pin установщика: `OKKEY_IMAGE_TAG={{IMAGE_TAG}}`.

### Расширение

{{RU_EXTENSION}}

### Исправления безопасности (публично)

{{RU_SECURITY}}

### Известные проблемы / waivers

{{RU_WAIVERS}}

### Enterprise

Заметки enterprise — в `okkey-enterprise` с тем же SemVer и строкой:

`requires okkey {{VERSION}}`

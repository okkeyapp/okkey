# Security Policy

## English

### Reporting a vulnerability

Please report security issues **privately** via GitHub Security Advisories for this repository:

https://github.com/okkeyapp/okkey/security/advisories/new

If private vulnerability reporting is unavailable, open a draft security advisory from the repository **Security** tab instead of a public issue.

**Do not** put master passwords, vault keys, recovery keys, session tokens, private keys, or vault dumps in the report. Describe the impact, affected component/version, and reproduction steps without live secrets.

### Supported versions

Security fixes target the latest published release line of Okkey Core. Support windows for previous minor releases are documented in release notes when decided; this file does not promise a fixed calendar window.

### Response and disclosure (goals, not guarantees)

These are **targets**, not contractual guarantees:

| Goal | Target |
|------|--------|
| Initial response to a private report | Within 14 days |
| Fix for critical issues | As soon as practical after triage |
| Fix for high issues | As soon as practical after triage |
| Public disclosure | After a fix is available to operators (pinned image / release), not before |

We do **not** publish a public SLA table of exact fix hours. Internal triage priorities for audit findings are tracked separately for the team.

### Security releases

Unscheduled security releases are approved by the security-release owner (currently the project lead). Public advisories reference fixed versions once operators can upgrade.

---

## Русский

### Как сообщить об уязвимости

Сообщайте об уязвимостях **приватно** через GitHub Security Advisories этого репозитория:

https://github.com/okkeyapp/okkey/security/advisories/new

Если private vulnerability reporting недоступен, создайте черновик advisory во вкладке **Security**, а не публичный issue.

**Не** присылайте мастер-пароли, ключи хранилища, recovery key, токены сессий, закрытые ключи и дампы сейфов. Опишите влияние, компонент/версию и шаги воспроизведения без живых секретов.

### Поддерживаемые версии

Исправления безопасности нацелены на последнюю опубликованную линейку Okkey Core. Окно поддержки предыдущих минорных версий указывается в release notes, когда оно будет утверждено; этот файл фиксированное календарное окно не обещает.

### Ответ и раскрытие (цель, не гарантия)

Ниже — **цели**, а не договорные гарантии:

| Цель | Ориентир |
|------|----------|
| Первый ответ на приватный репорт | В течение 14 дней |
| Исправление critical | Как можно скорее после triage |
| Исправление high | Как можно скорее после triage |
| Публичное объявление | После того, как исправление доступно операторам (pinned image / release), не раньше |

Публичную таблицу SLA с точными часами исправления мы **не** публикуем. Внутренние сроки triage по аудиту ведутся отдельно для команды.

### Security-релизы

Внеплановый security-релиз утверждает ответственный за security-релиз (сейчас — руководитель проекта). Публичные advisory ссылаются на исправленные версии, когда операторы могут обновиться.

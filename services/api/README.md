# API Service

Минимальный backend-каркас для Okkey Core.

**Контракты HTTP API:** [`docs/api_contracts.md`](../../docs/api_contracts.md), OpenAPI: [`docs/openapi/core-api.yaml`](../../docs/openapi/core-api.yaml).

## Что есть в каркасе

- единая точка входа: `src/index.ts`
- загрузка env из `services/api/.env` и `services/api/.env.local`
- базовый роутинг
- storage layer:
  - Postgres клиент + транзакции
  - Redis клиент
  - репозитории `users/workspaces/vaults/items/events`
- middleware:
  - обработка ошибок
  - CORS
  - логирование запросов
- health endpoints:
  - `GET /health`
  - `GET /ready`
- auth endpoints:
  - `POST /auth/email/start`
  - `POST /auth/email/resend`
  - `POST /auth/email/confirm`
- vault endpoints:
  - `GET /workspaces/:workspaceId/vaults` (requires `X-User-Id`)
  - `GET /vaults/:vaultId` (requires `X-User-Id`)
- sync endpoints:
  - `GET /vaults/:vaultId/events?afterVersion=0` (requires `X-User-Id`)
  - `POST /vaults/:vaultId/events` (requires `X-User-Id`)

## Локальный запуск

1. Подготовить env:

```bash
cp services/api/.env.example services/api/.env
```

Root `.env` не используется для runtime API-конфига.  
API читает только `services/api/.env` и `services/api/.env.local`.

2. Запустить API из корня репозитория:

```bash
yarn dev:api
```

По умолчанию API стартует на `http://localhost:4000`.

Важно: для запуска storage layer нужны зависимости `pg` и `redis`.

## Email providers

Поддерживаются 3 режима:
- `EMAIL_PROVIDER=logger` — только логирование отправки (dev по умолчанию)
- `EMAIL_PROVIDER=smtp` — отправка через SMTP
- `EMAIL_PROVIDER=http-api` — отправка через внешний HTTP API провайдера

Для SMTP задаются:
- `EMAIL_SMTP_HOST`
- `EMAIL_SMTP_PORT`
- `EMAIL_SMTP_SECURE`
- `EMAIL_SMTP_USER`
- `EMAIL_SMTP_PASSWORD`

Для HTTP API задаются:
- `EMAIL_API_ENDPOINT`
- `EMAIL_API_KEY`
- `EMAIL_API_TIMEOUT_MS`

## Тесты каркаса

Из корня репозитория:

```bash
yarn test:api
```

Для integration-тестов storage должны быть подняты Postgres/Redis:

```bash
yarn infra:up
```

## Email login flow (v1)

- код входа: 6 цифр
- TTL кода: 5 минут (настраивается через env)
- повторная отправка: не чаще 1 раза в 60 секунд
- лимит неверных попыток confirm: 5

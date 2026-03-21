# API Service

Минимальный backend-каркас для Okkey Core.

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

## Локальный запуск

1. Подготовить env:

```bash
cp services/api/.env.example services/api/.env
```

2. Запустить API из корня репозитория:

```bash
yarn dev:api
```

По умолчанию API стартует на `http://localhost:4000`.

Важно: для запуска storage layer нужны зависимости `pg` и `redis`.

## Тесты каркаса

Из корня репозитория:

```bash
yarn test:api
```

Для integration-тестов storage должны быть подняты Postgres/Redis:

```bash
yarn infra:up
```

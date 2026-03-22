# @okkey/api

HTTP client for Okkey Core API.

## Usage

```ts
import { ApiClient, ApiRequestError } from "@okkey/api";

const api = new ApiClient({
  baseUrl: "https://api.example.com",
  defaultHeaders: { "X-User-Id": userId },
});

try {
  const vaults = await api.get<unknown[]>("/workspaces/…/vaults");
} catch (e) {
  if (e instanceof ApiRequestError) {
    console.error(e.body.error, e.body.requestId);
  }
  throw e;
}
```

Contracts and DTOs: `docs/api_contracts.md` and `docs/openapi/core-api.yaml` in the `okkey` repo.

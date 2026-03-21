# @okkey/api

HTTP client for Okkey Core API.

## Usage

```ts
import { ApiClient } from "@okkey/api";

const api = new ApiClient({ baseUrl: "https://api.example.com" });
const me = await api.get("/me");
```

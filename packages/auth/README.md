# @okkey/auth

Authentication SDK for Okkey Core.

## Usage

```ts
import { ApiClient } from "@okkey/api";
import { AuthClient } from "@okkey/auth";

const auth = new AuthClient(new ApiClient({ baseUrl: "https://api.example.com" }));
await auth.startEmailLogin("user@example.com");
```

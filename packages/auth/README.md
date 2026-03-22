# @okkey/auth

Authentication SDK for Okkey Core.

## Usage

```ts
import { ApiClient } from "@okkey/api";
import { AuthClient } from "@okkey/auth";

const api = new ApiClient({ baseUrl: "https://api.example.com" });
const auth = new AuthClient(api);

const { challengeId, expiresAt } = await auth.startEmailLogin("user@example.com");
// await auth.resendEmailCode(challengeId);
const { authStateId, nextStep } = await auth.confirmEmailCode(challengeId, "123456");
// Build `RegisterCompleteRequestDto` with `@okkey/crypto` + wire fields, then:
// await auth.completeRegistration({ auth_state_id: authStateId, ... });
```

Wire contracts: `docs/api_contracts.md` and `docs/openapi/core-api.yaml` in the `okkey` repo.

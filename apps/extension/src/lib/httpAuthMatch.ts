import type { ItemPlaintextV2 } from "@okkey/types";

import type { HttpAuthMatch } from "./httpAuthDecision.ts";
import { loginItemMatchesHttpAuthOrigin } from "./httpAuthOrigin.ts";

/**
 * Username + password for a basic-auth challenge.
 * Login / email text wins; otherwise the first non-empty text field.
 * The password is the first password field and is not trimmed.
 */
function httpAuthCredentials(item: ItemPlaintextV2): { username: string; password: string } | null {
  let username = "";
  let fallback = "";
  let password = "";
  for (const field of item.fields) {
    if (field.value.kind === "text") {
      const text = field.value.text.trim();
      if (!text) {
        continue;
      }
      if (!username && (field.id === "login" || field.type === "email")) {
        username = text;
        continue;
      }
      if (!fallback && field.type === "text" && field.id !== "password") {
        fallback = text;
      }
      continue;
    }
    if (!password && field.value.kind === "password" && field.value.password.length > 0) {
      password = field.value.password;
    }
  }
  if (!password) {
    return null;
  }
  return { username: username || fallback, password };
}

/** Login items whose website URL origin equals the challenge, with a password. */
export function collectHttpAuthCandidates(
  items: readonly ItemPlaintextV2[],
  challengeUrl: string,
): HttpAuthMatch[] {
  const out: HttpAuthMatch[] = [];
  for (const item of items) {
    if (!loginItemMatchesHttpAuthOrigin(item, challengeUrl)) {
      continue;
    }
    const secrets = httpAuthCredentials(item);
    if (!secrets) {
      continue;
    }
    out.push({
      itemId: item.itemId,
      title: item.title.trim() || item.itemId,
      username: secrets.username,
      password: secrets.password,
    });
  }
  return out;
}

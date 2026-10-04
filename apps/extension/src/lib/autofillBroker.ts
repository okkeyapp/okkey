import { ITEM_CATEGORY_LOGIN } from "@okkey/types";
import {
  extractLoginAutofillSecrets,
  listCachedWorkspaceVaultItems,
  loginItemMatchesTab,
  totpCodeFromSecret,
} from "@okkey/vault";

import {
  AUTOFILL_MSG,
  type AutofillFillResponse,
  type AutofillQueryResponse,
  type AutofillRuntimeMessage,
} from "./autofillMessages";
import { readExtensionUnlockSessionIfFresh, touchExtensionUnlockSession } from "./extensionVaultSession";
import { readSession } from "./storage";
import { readStoredCurrentWorkspaceId } from "./vaultStorage";

async function resolveUnlockUserId(): Promise<{ userId: string; unlocked: boolean } | null> {
  const session = await readSession();
  if (!session) {
    return null;
  }
  const fresh = await readExtensionUnlockSessionIfFresh(session.user_id);
  return { userId: session.user_id, unlocked: Boolean(fresh) };
}

async function matchingLoginItems(userId: string, pageUrl: string) {
  const workspaceId = await readStoredCurrentWorkspaceId(userId);
  if (!workspaceId) {
    return [];
  }
  const items = await listCachedWorkspaceVaultItems({ userId, workspaceId });
  return items.filter(
    (item) =>
      item.categoryId === ITEM_CATEGORY_LOGIN &&
      !item.deleted &&
      !item.archived &&
      loginItemMatchesTab(item, pageUrl),
  );
}

export async function handleAutofillQuery(pageUrl: string): Promise<AutofillQueryResponse> {
  const auth = await resolveUnlockUserId();
  if (!auth) {
    return { status: "signed-out" };
  }
  if (!auth.unlocked) {
    return { status: "locked" };
  }
  const items = await matchingLoginItems(auth.userId, pageUrl);
  await touchExtensionUnlockSession(auth.userId);
  return {
    status: "ok",
    suggestions: items.map((item) => {
      const secrets = extractLoginAutofillSecrets(item);
      return {
        itemId: item.itemId,
        title: item.title || item.itemId,
        username: secrets?.username ?? "",
      };
    }),
  };
}

export async function handleAutofillFill(itemId: string, pageUrl: string): Promise<AutofillFillResponse> {
  const auth = await resolveUnlockUserId();
  if (!auth) {
    return { status: "signed-out" };
  }
  if (!auth.unlocked) {
    return { status: "locked" };
  }
  const items = await matchingLoginItems(auth.userId, pageUrl);
  const item = items.find((candidate) => candidate.itemId === itemId);
  if (!item) {
    return { status: "not-found" };
  }
  const secrets = extractLoginAutofillSecrets(item);
  if (!secrets) {
    return { status: "not-found" };
  }
  let totp: string | undefined;
  if (secrets.totpSecretBase32) {
    totp =
      (await totpCodeFromSecret({
        secretBase32: secrets.totpSecretBase32,
        periodSeconds: secrets.totpPeriodSeconds,
        digits: secrets.totpDigits,
      })) ?? undefined;
  }
  await touchExtensionUnlockSession(auth.userId);
  return {
    status: "ok",
    fill: {
      username: secrets.username,
      password: secrets.password,
      ...(totp ? { totp } : {}),
    },
  };
}

export async function openExtensionUnlockPrompt(): Promise<void> {
  try {
    await browser.action.openPopup();
    return;
  } catch {
    // Chrome may require a user gesture that does not reach the SW.
  }
  const popupUrl = browser.runtime.getURL("/popup.html");
  await browser.windows.create({
    url: popupUrl,
    type: "popup",
    focused: true,
    width: 420,
    height: 640,
  });
}

export async function broadcastAutofillUnlocked(): Promise<void> {
  const tabs = await browser.tabs.query({ url: ["http://*/*", "https://*/*"] });
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id == null) {
        return;
      }
      try {
        await browser.tabs.sendMessage(tab.id, { type: AUTOFILL_MSG.unlocked } satisfies AutofillRuntimeMessage);
      } catch {
        // frame without content script
      }
    }),
  );
}

export function isAutofillRuntimeMessage(message: unknown): message is AutofillRuntimeMessage {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return false;
  }
  const type = (message as { type: unknown }).type;
  return (
    type === AUTOFILL_MSG.query ||
    type === AUTOFILL_MSG.fill ||
    type === AUTOFILL_MSG.unlock ||
    type === AUTOFILL_MSG.unlocked
  );
}

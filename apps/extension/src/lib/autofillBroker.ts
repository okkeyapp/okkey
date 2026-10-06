import { encryptAttachmentPayload } from "@okkey/crypto";
import { ITEM_CATEGORY_LOGIN, createPresetItemPlaintextV2, generateEntityId } from "@okkey/types";
import {
  collectItemUrls,
  createWorkspaceVaultItemsReadController,
  extractLoginAutofillSecrets,
  listCachedWorkspaceVaultItems,
  loginItemMatchesTab,
  resolveVaultItemEncryptionKey,
  totpCodeFromSecret,
} from "@okkey/vault";

import { createCoreClient } from "./api";
import {
  AUTOFILL_MSG,
  type AutofillFillResponse,
  type AutofillOpenAndFillResponse,
  type AutofillQueryResponse,
  type AutofillRuntimeMessage,
  type AutofillSaveResponse,
} from "./autofillMessages";
import { readExtensionUnlockSessionIfFresh, touchExtensionUnlockSession } from "./extensionVaultSession";
import { initExtensionCrypto } from "./initExtensionCrypto";
import { readProfile, readSession } from "./storage";
import { readExtensionVaultBundle, readStoredCurrentWorkspaceId } from "./vaultStorage";

async function resolveUnlockUserId(): Promise<{ userId: string; unlocked: boolean } | null> {
  const session = await readSession();
  if (!session) {
    return null;
  }
  const fresh = await readExtensionUnlockSessionIfFresh(session.user_id);
  return { userId: session.user_id, unlocked: Boolean(fresh?.passwordShareC) };
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
      const firstUrl = collectItemUrls(item)[0];
      const iconUrl = firstUrl ? googleFaviconUrl(firstUrl) : undefined;
      return {
        itemId: item.itemId,
        title: item.title || item.itemId,
        username: secrets?.username ?? "",
        ...(iconUrl ? { iconUrl } : {}),
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

function googleFaviconUrl(websiteUrl: string): string | undefined {
  try {
    const href = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
    const host = new URL(href).hostname;
    if (!host) {
      return undefined;
    }
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return undefined;
  }
}

function domainTitleFromUrl(websiteUrl: string): string {
  try {
    const host = new URL(websiteUrl).hostname.replace(/^www\./i, "");
    return host || websiteUrl;
  } catch {
    return websiteUrl;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

async function previewFaviconPng(apiBaseUrl: string, accessToken: string, urls: string[]): Promise<Uint8Array | null> {
  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/favicon/preview`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ urls }),
    });
    if (!response.ok) {
      return null;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function uploadFaviconAttachment(input: {
  apiBaseUrl: string;
  accessToken: string;
  vaultId: string;
  itemId: string;
  vaultKey: Uint8Array;
  pngBytes: Uint8Array;
}): Promise<string | null> {
  try {
    const encrypted = await encryptAttachmentPayload(input.vaultKey, input.pngBytes, {
      vaultId: input.vaultId,
      itemId: input.itemId,
    });
    const response = await fetch(
      `${input.apiBaseUrl.replace(/\/$/, "")}/vaults/${encodeURIComponent(input.vaultId)}/items/${encodeURIComponent(input.itemId)}/attachments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/octet-stream",
          "X-File-Mime-Type": "image/png",
          "X-File-Name": encodeURIComponent("favicon.png"),
          "X-File-Size": String(input.pngBytes.byteLength),
          "X-Encrypted-Key": bytesToBase64(encrypted.encryptedKey),
        },
        body: encrypted.encryptedBody,
      },
    );
    if (!response.ok) {
      return null;
    }
    const uploaded = (await response.json()) as { attachmentId?: string };
    return typeof uploaded.attachmentId === "string" ? uploaded.attachmentId : null;
  } catch {
    return null;
  }
}

export async function handleAutofillSave(input: {
  pageUrl: string;
  websiteUrl: string;
  title: string;
  username: string;
  password: string;
}): Promise<AutofillSaveResponse> {
  const session = await readSession();
  const profile = await readProfile();
  if (!session || !profile) {
    return { status: "signed-out" };
  }
  const fresh = await readExtensionUnlockSessionIfFresh(session.user_id);
  if (!fresh?.passwordShareC) {
    return { status: "locked" };
  }
  const existing = await matchingLoginItems(session.user_id, input.pageUrl);
  if (existing.length > 0) {
    return { status: "exists" };
  }
  const workspaceId = await readStoredCurrentWorkspaceId(session.user_id);
  const bundle = await readExtensionVaultBundle(session.user_id);
  if (!workspaceId || !bundle?.encrypted_private_key?.payload) {
    return { status: "error", message: "VAULT_NOT_READY" };
  }
  try {
    await initExtensionCrypto();
    const core = createCoreClient(profile.apiBaseUrl, session.access_token);
    const vaults = await core.listWorkspaceVaults(workspaceId);
    const personal = vaults.find((vault) => vault.isPersonal) ?? vaults[0];
    if (!personal) {
      return { status: "error", message: "NO_VAULT" };
    }
    const controller = createWorkspaceVaultItemsReadController({
      core,
      userId: session.user_id,
      workspaceId,
      vaults,
      accountVaultKey: fresh.vaultKey,
      encryptedPrivateKeyPayload: bundle.encrypted_private_key.payload,
    });
    try {
      await controller.refresh();
      const itemId = generateEntityId();
      const title = (input.title || domainTitleFromUrl(input.websiteUrl)).trim() || "Login";
      let item = createPresetItemPlaintextV2({
        categoryId: ITEM_CATEGORY_LOGIN,
        itemId,
        vaultId: personal.id,
        title,
      });
      item = {
        ...item,
        fields: item.fields.map((field) => {
          if (field.id === "login" && field.value.kind === "text") {
            return { ...field, value: { kind: "text", text: input.username } };
          }
          if (field.id === "password" && field.value.kind === "password") {
            return { ...field, value: { kind: "password", password: input.password } };
          }
          if (field.id === "website-1" && field.value.kind === "url") {
            return {
              ...field,
              value: { kind: "url", url: input.websiteUrl, urlAutofillScope: "entire-site" },
            };
          }
          return field;
        }),
      };

      const png = await previewFaviconPng(profile.apiBaseUrl, session.access_token, [input.websiteUrl]);

      await controller.createItem(item);

      // Best-effort favicon after create.
      if (png && png.byteLength > 0) {
        try {
          const vaultKey = await resolveVaultItemEncryptionKey({
            vault: personal,
            accountVaultKey: fresh.vaultKey,
            core,
            encryptedPrivateKeyPayload: bundle.encrypted_private_key.payload,
          });
          const faviconId = await uploadFaviconAttachment({
            apiBaseUrl: profile.apiBaseUrl,
            accessToken: session.access_token,
            vaultId: personal.id,
            itemId,
            vaultKey,
            pngBytes: png,
          });
          if (faviconId) {
            const created = controller.getItemById(itemId);
            if (created) {
              await controller.updateItem({
                ...created,
                faviconId,
                faviconSource: "website",
                updatedAtMs: Date.now(),
              });
            }
          }
        } catch {
          // Item is saved; favicon is optional.
        }
      }

      await touchExtensionUnlockSession(session.user_id);
      return { status: "ok", itemId };
    } finally {
      controller.dispose();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "error", message };
  }
}

const pendingOpenFillByTab = new Map<number, { itemId: string; pageUrl: string }>();

function normalizeOpenUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function handleAutofillOpenAndFill(itemId: string, url: string): Promise<AutofillOpenAndFillResponse> {
  const auth = await resolveUnlockUserId();
  if (!auth) {
    return { status: "signed-out" };
  }
  if (!auth.unlocked) {
    return { status: "locked" };
  }
  const openUrl = normalizeOpenUrl(url);
  if (!openUrl) {
    return { status: "error", message: "EMPTY_URL" };
  }
  try {
    const tab = await browser.tabs.create({ url: openUrl });
    if (tab.id == null) {
      return { status: "error", message: "NO_TAB" };
    }
    const pageUrl = (() => {
      try {
        const parsed = new URL(openUrl);
        return parsed.origin + parsed.pathname;
      } catch {
        return openUrl;
      }
    })();
    pendingOpenFillByTab.set(tab.id, { itemId, pageUrl });
    const tabId = tab.id;
    const onUpdated = (updatedTabId: number, info: { status?: string }) => {
      if (updatedTabId !== tabId || info.status !== "complete") {
        return;
      }
      browser.tabs.onUpdated.removeListener(onUpdated);
      const pending = pendingOpenFillByTab.get(tabId);
      if (!pending) {
        return;
      }
      void browser.tabs
        .sendMessage(tabId, {
          type: AUTOFILL_MSG.applyFill,
          itemId: pending.itemId,
          pageUrl: pending.pageUrl,
        } satisfies AutofillRuntimeMessage)
        .catch(() => {
          // Content script may still be injecting; retry once shortly.
          setTimeout(() => {
            void browser.tabs
              .sendMessage(tabId, {
                type: AUTOFILL_MSG.applyFill,
                itemId: pending.itemId,
                pageUrl: pending.pageUrl,
              } satisfies AutofillRuntimeMessage)
              .catch(() => undefined);
          }, 400);
        })
        .finally(() => {
          pendingOpenFillByTab.delete(tabId);
        });
    };
    browser.tabs.onUpdated.addListener(onUpdated);
    await touchExtensionUnlockSession(auth.userId);
    return { status: "ok" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "error", message };
  }
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
    type === AUTOFILL_MSG.unlocked ||
    type === AUTOFILL_MSG.save ||
    type === AUTOFILL_MSG.openAndFill ||
    type === AUTOFILL_MSG.applyFill
  );
}

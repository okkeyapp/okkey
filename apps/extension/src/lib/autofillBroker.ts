import { encryptAttachmentPayload } from "@okkey/crypto";
import { ITEM_CATEGORY_LOGIN, createPresetItemPlaintextV2, generateEntityId } from "@okkey/types";
import {
  categoriesForFieldKinds,
  createWorkspaceVaultItemsReadController,
  downloadKeyFieldFileAttachmentBytes,
  extractAutofillValues,
  extractLoginAutofillSecrets,
  isAutofillItemCategory,
  keyFieldFileValueFromFaviconId,
  listCachedWorkspaceVaultItems,
  loginItemMatchesTab,
  resolveVaultItemEncryptionKey,
  suggestionSubtitleFromValues,
  totpCodeFromSecret,
  type AutofillItemCategory,
} from "@okkey/vault";

import { createCoreClient } from "./api";
import {
  AUTOFILL_MSG,
  type AutofillFillResponse,
  type AutofillOpenAndFillResponse,
  type AutofillPendingSaveGetResponse,
  type AutofillPendingSavePayload,
  type AutofillQueryResponse,
  type AutofillRuntimeMessage,
  type AutofillSaveContextResponse,
  type AutofillSaveResponse,
  type AutofillSiteIconResponse,
} from "./autofillMessages";
import { readExtensionUnlockSessionIfFresh, touchExtensionUnlockSession } from "./extensionVaultSession";
import { initExtensionCrypto } from "./initExtensionCrypto";
import { readProfile, readSession } from "./storage";
import { readExtensionVaultBundle, readStoredCurrentWorkspaceId } from "./vaultStorage";

const PENDING_SAVE_TTL_MS = 90_000;
const PENDING_SAVE_SESSION_KEY = "okkey.autofill.pendingSaveByTab";

type PendingSaveByTab = Record<string, AutofillPendingSavePayload>;

const pendingSaveByTab = new Map<number, AutofillPendingSavePayload>();
let pendingSaveSessionHydrated = false;

async function hydratePendingSaveSession(): Promise<void> {
  if (pendingSaveSessionHydrated) {
    return;
  }
  pendingSaveSessionHydrated = true;
  try {
    const bag = await browser.storage.session.get(PENDING_SAVE_SESSION_KEY);
    const raw = bag[PENDING_SAVE_SESSION_KEY] as PendingSaveByTab | undefined;
    if (!raw || typeof raw !== "object") {
      return;
    }
    const now = Date.now();
    for (const [tabKey, pending] of Object.entries(raw)) {
      const tabId = Number(tabKey);
      if (!Number.isFinite(tabId) || !pending?.username || !pending?.password) {
        continue;
      }
      if (now - pending.createdAt > PENDING_SAVE_TTL_MS) {
        continue;
      }
      pendingSaveByTab.set(tabId, pending);
    }
  } catch {
    /* session storage unavailable */
  }
}

async function persistPendingSaveSession(): Promise<void> {
  const record: PendingSaveByTab = {};
  for (const [tabId, pending] of pendingSaveByTab) {
    record[String(tabId)] = pending;
  }
  try {
    await browser.storage.session.set({ [PENDING_SAVE_SESSION_KEY]: record });
  } catch {
    /* ignore */
  }
}

function isPendingSaveFresh(pending: AutofillPendingSavePayload): boolean {
  return Date.now() - pending.createdAt <= PENDING_SAVE_TTL_MS;
}

export async function setPendingSaveOffer(
  tabId: number,
  input: { username: string; password: string; captureUrl: string },
): Promise<void> {
  await hydratePendingSaveSession();
  pendingSaveByTab.set(tabId, {
    username: input.username,
    password: input.password,
    captureUrl: input.captureUrl,
    createdAt: Date.now(),
    interacted: false,
  });
  await persistPendingSaveSession();
}

export async function getPendingSaveOffer(tabId: number): Promise<AutofillPendingSaveGetResponse> {
  await hydratePendingSaveSession();
  const pending = pendingSaveByTab.get(tabId);
  if (!pending || !isPendingSaveFresh(pending)) {
    if (pending) {
      pendingSaveByTab.delete(tabId);
      await persistPendingSaveSession();
    }
    return { status: "none" };
  }
  return { status: "ok", pending };
}

export async function clearPendingSaveOffer(tabId: number): Promise<void> {
  await hydratePendingSaveSession();
  if (!pendingSaveByTab.delete(tabId)) {
    return;
  }
  await persistPendingSaveSession();
}

export async function markPendingSaveInteracted(tabId: number, currentUrl: string): Promise<void> {
  await hydratePendingSaveSession();
  const pending = pendingSaveByTab.get(tabId);
  if (!pending || !isPendingSaveFresh(pending)) {
    if (pending) {
      pendingSaveByTab.delete(tabId);
      await persistPendingSaveSession();
    }
    return;
  }
  if (pending.interacted) {
    return;
  }
  /** Only cancel on destination pages (after redirects away from the login URL). */
  if (normalizePendingUrl(currentUrl) === normalizePendingUrl(pending.captureUrl)) {
    return;
  }
  pending.interacted = true;
  pendingSaveByTab.set(tabId, pending);
  await persistPendingSaveSession();
}

function normalizePendingUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "") || parsed.origin;
  } catch {
    return url;
  }
}

export function wirePendingSaveTabCleanup(): void {
  browser.tabs.onRemoved.addListener((tabId) => {
    if (!pendingSaveByTab.has(tabId)) {
      return;
    }
    pendingSaveByTab.delete(tabId);
    void persistPendingSaveSession();
  });
}

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

async function matchingAutofillItems(
  userId: string,
  pageUrl: string,
  fieldKinds: readonly string[] | undefined,
) {
  const workspaceId = await readStoredCurrentWorkspaceId(userId);
  if (!workspaceId) {
    return [];
  }
  const kinds = fieldKinds && fieldKinds.length > 0 ? fieldKinds : ["username", "password"];
  const categories = categoriesForFieldKinds(kinds);
  const items = await listCachedWorkspaceVaultItems({ userId, workspaceId });
  return items.filter((item) => {
    if (item.deleted || item.archived || !isAutofillItemCategory(item.categoryId)) {
      return false;
    }
    const category = item.categoryId as AutofillItemCategory;
    if (!categories.includes(category)) {
      return false;
    }
    if (category === "login") {
      return loginItemMatchesTab(item, pageUrl);
    }
    const values = extractAutofillValues(item);
    return Object.keys(values).length > 0;
  });
}

export async function handleAutofillQuery(
  pageUrl: string,
  fieldKinds?: string[],
): Promise<AutofillQueryResponse> {
  const auth = await resolveUnlockUserId();
  if (!auth) {
    return { status: "signed-out" };
  }
  if (!auth.unlocked) {
    return { status: "locked" };
  }
  const items = await matchingAutofillItems(auth.userId, pageUrl, fieldKinds);
  await touchExtensionUnlockSession(auth.userId);
  const suggestions = await Promise.all(
    items.map(async (item) => {
      const values = extractAutofillValues(item);
      const loginSecrets =
        item.categoryId === ITEM_CATEGORY_LOGIN ? extractLoginAutofillSecrets(item) : null;
      if (loginSecrets?.username) {
        values.username = values.username || loginSecrets.username;
      }
      const iconUrl = await storedFaviconDataUrl(item.vaultId, item.itemId, item.faviconId);
      return {
        itemId: item.itemId,
        title: item.title || item.itemId,
        username: suggestionSubtitleFromValues(item.categoryId, values),
        categoryId: item.categoryId,
        ...(iconUrl ? { iconUrl } : {}),
      };
    }),
  );
  return {
    status: "ok",
    suggestions,
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
  const workspaceId = await readStoredCurrentWorkspaceId(auth.userId);
  if (!workspaceId) {
    return { status: "not-found" };
  }
  const cached = await listCachedWorkspaceVaultItems({ userId: auth.userId, workspaceId });
  const item = cached.find(
    (candidate) =>
      candidate.itemId === itemId &&
      !candidate.deleted &&
      !candidate.archived &&
      isAutofillItemCategory(candidate.categoryId),
  );
  if (!item) {
    return { status: "not-found" };
  }
  if (item.categoryId === ITEM_CATEGORY_LOGIN && !loginItemMatchesTab(item, pageUrl)) {
    return { status: "not-found" };
  }

  const values = extractAutofillValues(item);
  const secrets =
    item.categoryId === ITEM_CATEGORY_LOGIN ? extractLoginAutofillSecrets(item) : null;

  let username = values.username || values.email || "";
  let password = values.password || values["db-password"] || "";
  if (secrets) {
    username = secrets.username || username;
    password = secrets.password || password;
    if (secrets.username) {
      values.username = secrets.username;
    }
    if (secrets.password) {
      values.password = secrets.password;
    }
    if (secrets.username && !values.email) {
      values.email = secrets.username;
    }
  }

  let totp: string | undefined;
  if (secrets?.totpSecretBase32) {
    totp =
      (await totpCodeFromSecret({
        secretBase32: secrets.totpSecretBase32,
        periodSeconds: secrets.totpPeriodSeconds,
        digits: secrets.totpDigits,
      })) ?? undefined;
  }

  if (!username && !password && !totp && Object.keys(values).length === 0) {
    return { status: "not-found" };
  }

  await touchExtensionUnlockSession(auth.userId);
  return {
    status: "ok",
    fill: {
      username,
      password,
      ...(totp ? { totp } : {}),
      categoryId: item.categoryId,
      values: { ...values },
    },
  };
}

const faviconDataUrlCache = new Map<string, string>();

function pngToDataUrl(bytes: Uint8Array): string {
  return `data:image/png;base64,${bytesToBase64(bytes)}`;
}

async function storedFaviconDataUrl(
  vaultId: string,
  itemId: string,
  faviconId: string | undefined,
): Promise<string | undefined> {
  if (!faviconId) {
    return undefined;
  }
  const cacheKey = `${vaultId}:${itemId}:${faviconId}`;
  const cached = faviconDataUrlCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const session = await readSession();
  const profile = await readProfile();
  const auth = session ? await readExtensionUnlockSessionIfFresh(session.user_id) : null;
  if (!session || !profile || !auth?.vaultKey) {
    return undefined;
  }
  try {
    await initExtensionCrypto();
    const downloaded = await downloadKeyFieldFileAttachmentBytes({
      apiBaseUrl: profile.apiBaseUrl.replace(/\/$/, ""),
      accessToken: session.access_token,
      vaultId,
      itemId,
      vaultKey: auth.vaultKey,
      file: keyFieldFileValueFromFaviconId(faviconId),
    });
    const dataUrl = pngToDataUrl(downloaded.plaintext);
    faviconDataUrlCache.set(cacheKey, dataUrl);
    return dataUrl;
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

export async function handleAutofillSiteIcon(websiteUrl: string): Promise<AutofillSiteIconResponse> {
  const session = await readSession();
  const profile = await readProfile();
  if (!session || !profile) {
    return { status: "signed-out" };
  }
  const fresh = await readExtensionUnlockSessionIfFresh(session.user_id);
  if (!fresh?.passwordShareC) {
    return { status: "locked" };
  }
  const png = await previewFaviconPng(profile.apiBaseUrl, session.access_token, [websiteUrl]);
  if (!png || png.byteLength === 0) {
    return { status: "missing" };
  }
  return { status: "ok", iconUrl: pngToDataUrl(png) };
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

export async function handleAutofillSaveContext(): Promise<AutofillSaveContextResponse> {
  const session = await readSession();
  const profile = await readProfile();
  if (!session || !profile) {
    return { status: "signed-out" };
  }
  const fresh = await readExtensionUnlockSessionIfFresh(session.user_id);
  if (!fresh?.passwordShareC) {
    return { status: "locked" };
  }
  const workspaceId = await readStoredCurrentWorkspaceId(session.user_id);
  if (!workspaceId) {
    return { status: "locked" };
  }
  try {
    const core = createCoreClient(profile.apiBaseUrl, session.access_token);
    const [workspaces, vaults] = await Promise.all([
      core.listWorkspaces(),
      core.listWorkspaceVaults(workspaceId),
    ]);
    const workspace = workspaces.find((item) => item.id === workspaceId);
    const options = vaults.map((vault) => ({
      vaultId: vault.id,
      name: vault.name,
      icon: vault.icon || (vault.isPersonal ? "👤" : "💼"),
      isPersonal: Boolean(vault.isPersonal),
    }));
    const defaultVault = vaults.find((vault) => vault.isPersonal) ?? vaults[0];
    if (!defaultVault) {
      return { status: "locked" };
    }
    await touchExtensionUnlockSession(session.user_id);
    return {
      status: "ok",
      workspaceId,
      workspaceName: workspace?.name?.trim() || "Workspace",
      vaults: options,
      defaultVaultId: defaultVault.id,
    };
  } catch {
    return { status: "locked" };
  }
}

export async function handleAutofillSave(input: {
  pageUrl: string;
  websiteUrl: string;
  title: string;
  username: string;
  password: string;
  vaultId?: string;
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
    const personal =
      (input.vaultId ? vaults.find((vault) => vault.id === input.vaultId) : undefined) ??
      vaults.find((vault) => vault.isPersonal) ??
      vaults[0];
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
    type === AUTOFILL_MSG.saveContext ||
    type === AUTOFILL_MSG.siteIcon ||
    type === AUTOFILL_MSG.openAndFill ||
    type === AUTOFILL_MSG.applyFill ||
    type === AUTOFILL_MSG.pendingSaveSet ||
    type === AUTOFILL_MSG.pendingSaveGet ||
    type === AUTOFILL_MSG.pendingSaveClear ||
    type === AUTOFILL_MSG.pendingSaveMarkInteracted
  );
}

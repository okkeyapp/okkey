import { encryptAttachmentPayload } from "@okkey/crypto";
import {
  ITEM_CATEGORY_LOGIN,
  createPresetItemPlaintextV2,
  generateEntityId,
  type ItemPlaintextV2,
} from "@okkey/types";
import {
  categoriesForFieldKinds,
  createWorkspaceVaultItemsReadController,
  downloadKeyFieldFileAttachmentBytes,
  extractAutofillEmailCandidates,
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

import { createCoreClient, isUnauthorizedApiError } from "./api";
import { EMAIL_OTP_URL } from "./autofillFieldClassify";
import {
  clearAllPendingSaveOffers,
  clearPendingSaveOffer,
  getPendingSaveOffer,
  markPendingSaveDismissed,
  markPendingSaveInteracted,
  setPendingSaveOffer,
  wirePendingSaveTabCleanup,
} from "./autofillPendingSave";
import { saveUrlsEqual } from "./autofillSaveUrls";
import {
  AUTOFILL_MSG,
  type AutofillFillResponse,
  type AutofillOpenAndFillResponse,
  type AutofillQueryResponse,
  type AutofillRuntimeMessage,
  type AutofillSaveContextResponse,
  type AutofillSaveFormCommitMessage,
  type AutofillSaveFormDraftItem,
  type AutofillSaveFormDraftMessage,
  type AutofillSaveFormDraftResponse,
  type AutofillSaveOfferResponse,
  type AutofillSaveResponse,
  type AutofillSiteIconResponse,
  type AutofillUpdateFieldKey,
} from "./autofillMessages";
import { readExtensionUnlockSessionIfFresh, touchExtensionUnlockSession } from "./extensionVaultSession";
import { initExtensionCrypto } from "./initExtensionCrypto";
import { readProfile, readSession, wipeAllExtensionData } from "./storage";
import { readExtensionVaultBundle, readStoredCurrentWorkspaceId } from "./vaultStorage";

async function wipeIfUnauthorized(err: unknown): Promise<boolean> {
  if (!isUnauthorizedApiError(err)) {
    return false;
  }
  await wipeAllExtensionData();
  await clearAllPendingSaveOffers();
  return true;
}

export {
  clearPendingSaveOffer,
  getPendingSaveOffer,
  markPendingSaveDismissed,
  markPendingSaveInteracted,
  setPendingSaveOffer,
  wirePendingSaveTabCleanup,
};

function primaryLoginWebsiteUrl(item: {
  fields: { type: string; value: { kind: string; url?: string } }[];
}): string {
  for (const field of item.fields) {
    if (field.type === "url" && field.value.kind === "url" && field.value.url?.trim()) {
      return field.value.url.trim();
    }
  }
  return "";
}

/** All non-empty URL fields in form order (same probe order as web `/favicon/preview`). */
function collectItemWebsiteUrls(item: {
  fields: { type: string; value: { kind: string; url?: string } }[];
}): string[] {
  const out: string[] = [];
  for (const field of item.fields) {
    if (field.type === "url" && field.value.kind === "url" && field.value.url?.trim()) {
      out.push(field.value.url.trim());
    }
  }
  return out;
}

/**
 * Best-effort website favicon sync after create/update.
 * Skips manual icons; clears website favicon when no remote icon is found.
 */
async function syncWebsiteFaviconForItem(input: {
  apiBaseUrl: string;
  accessToken: string;
  vaultKey: Uint8Array;
  vault: { id: string };
  controller: {
    getItemById: (itemId: string) => ItemPlaintextV2 | undefined;
    updateItem: (item: ItemPlaintextV2) => Promise<unknown>;
  };
  item: ItemPlaintextV2;
}): Promise<void> {
  if (input.item.faviconSource === "manual") {
    return;
  }
  const urls = collectItemWebsiteUrls(input.item);
  if (urls.length === 0) {
    if (input.item.faviconId || input.item.faviconSource) {
      const current = input.controller.getItemById(input.item.itemId) ?? input.item;
      const cleared: ItemPlaintextV2 = { ...current, updatedAtMs: Date.now() };
      delete cleared.faviconId;
      delete cleared.faviconSource;
      await input.controller.updateItem(cleared);
    }
    return;
  }

  const png = await previewFaviconPng(input.apiBaseUrl, input.accessToken, urls);
  if (!png || png.byteLength === 0) {
    if (input.item.faviconId || input.item.faviconSource === "website") {
      const current = input.controller.getItemById(input.item.itemId) ?? input.item;
      const cleared: ItemPlaintextV2 = { ...current, updatedAtMs: Date.now() };
      delete cleared.faviconId;
      delete cleared.faviconSource;
      await input.controller.updateItem(cleared);
    }
    return;
  }

  const faviconId = await uploadFaviconAttachment({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    vaultId: input.vault.id,
    itemId: input.item.itemId,
    vaultKey: input.vaultKey,
    pngBytes: png,
  });
  if (!faviconId) {
    return;
  }
  const current = input.controller.getItemById(input.item.itemId) ?? input.item;
  await input.controller.updateItem({
    ...current,
    faviconId,
    faviconSource: "website",
    updatedAtMs: Date.now(),
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

function filterCategoriesByFormType(
  categories: AutofillItemCategory[],
  formType: string | undefined,
  fieldKinds: readonly string[],
): AutofillItemCategory[] {
  const focused = fieldKinds[0] ?? null;
  // Email OTP / one-time code field: never surface password-oriented personal_data mix.
  // Login items are further filtered to TOTP-capable only in matchingAutofillItems.
  if (focused === "otp") {
    return categories.filter((id) => id === "login");
  }
  if (formType === "search") {
    return [];
  }
  if (formType === "login") {
    return categories.filter((id) => id === "login");
  }
  if (formType === "register") {
    // Password → generator only (content script). Username → nickname from personal_data.
    if (focused === "password") {
      return [];
    }
    return categories.filter((id) => id === "personal_data");
  }
  if (formType === "checkout") {
    if (
      focused === "cc-number" ||
      focused === "cc-exp" ||
      focused === "cc-csc" ||
      focused === "cc-name"
    ) {
      return categories.filter((id) => id === "credit_card");
    }
    if (
      focused === "iban" ||
      focused === "swift" ||
      focused === "bank-account-number" ||
      focused === "bank-name" ||
      focused === "bank-account-holder"
    ) {
      return categories.filter((id) => id === "bank_account");
    }
    if (focused === "email" || focused === "username") {
      return categories.filter((id) => id === "personal_data");
    }
  }
  if (formType === "identity") {
    return categories.filter((id) => id === "personal_data" || id === "passport");
  }
  return categories;
}

async function matchingAutofillItems(
  userId: string,
  pageUrl: string,
  fieldKinds: readonly string[] | undefined,
  formType?: string,
) {
  const workspaceId = await readStoredCurrentWorkspaceId(userId);
  if (!workspaceId) {
    return [];
  }
  const focusedKind = fieldKinds?.[0] ?? null;
  // Empty kinds on an email-OTP URL must not fall back to username+password.
  const kinds =
    fieldKinds && fieldKinds.length > 0
      ? fieldKinds
      : EMAIL_OTP_URL.test(pageUrl)
        ? ["otp"]
        : ["username", "password"];
  const categories = filterCategoriesByFormType(categoriesForFieldKinds(kinds), formType, kinds);
  if (categories.length === 0) {
    return [];
  }
  const otpFocus = focusedKind === "otp" || (kinds.length === 1 && kinds[0] === "otp");
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
      if (!loginItemMatchesTab(item, pageUrl)) {
        return false;
      }
      // OTP field: only logins with a TOTP secret — never offer vault password fill.
      if (otpFocus) {
        const secrets = extractLoginAutofillSecrets(item);
        return Boolean(secrets?.totpSecretBase32?.trim());
      }
      return true;
    }
    const values = extractAutofillValues(item);
    return Object.keys(values).length > 0;
  });
}

export async function handleAutofillQuery(
  pageUrl: string,
  fieldKinds?: string[],
  formType?: string,
): Promise<AutofillQueryResponse> {
  const auth = await resolveUnlockUserId();
  if (!auth) {
    return { status: "signed-out" };
  }
  if (!auth.unlocked) {
    return { status: "locked" };
  }
  const items = await matchingAutofillItems(auth.userId, pageUrl, fieldKinds, formType);
  await touchExtensionUnlockSession(auth.userId);
  const focusedKind = fieldKinds?.[0] ?? null;
  const wantsEmailField = (fieldKinds ?? []).some((kind) => kind === "email" || kind === "username");
  const suggestions = (
    await Promise.all(
      items.map(async (item) => {
        const values = extractAutofillValues(item);
        const loginSecrets =
          item.categoryId === ITEM_CATEGORY_LOGIN ? extractLoginAutofillSecrets(item) : null;
        if (loginSecrets?.username) {
          values.username = values.username || loginSecrets.username;
        }
        const title = item.title || item.itemId;
        const isLogin = item.categoryId === ITEM_CATEGORY_LOGIN;
        // Login keeps website favicon; other categories use list-style category tiles in CS.
        const iconUrl = isLogin
          ? await storedFaviconDataUrl(item.vaultId, item.itemId, item.faviconId)
          : undefined;

        // Register username: nickname from personal_data if present, else email (not generator-only).
        if (
          formType === "register" &&
          focusedKind === "username" &&
          item.categoryId === "personal_data"
        ) {
          const nickname = (values.username ?? "").trim();
          const email = (values.email ?? "").trim();
          const fillValue = nickname || email;
          if (!fillValue) {
            return [];
          }
          return [
            {
              itemId: item.itemId,
              title,
              username: fillValue,
              categoryId: item.categoryId,
              suggestionKey: `${item.itemId}:${nickname ? "nickname" : "email"}`,
              fillOverrides: { username: fillValue },
            },
          ];
        }

        if (wantsEmailField && item.categoryId === "personal_data") {
          const emails = extractAutofillEmailCandidates(item);
          if (emails.length > 1) {
            return emails.map((email) => ({
              itemId: item.itemId,
              title,
              username: email,
              categoryId: item.categoryId,
              suggestionKey: `${item.itemId}:email:${email.toLowerCase()}`,
              fillOverrides: { email },
            }));
          }
        }

        return [
          {
            itemId: item.itemId,
            title,
            username: suggestionSubtitleFromValues(item.categoryId, values, focusedKind),
            categoryId: item.categoryId,
            ...(iconUrl ? { iconUrl } : {}),
          },
        ];
      }),
    )
  ).flat();
  return {
    status: "ok",
    suggestions,
  };
}

export async function handleAutofillFill(
  itemId: string,
  pageUrl: string,
  fillOverrides?: Record<string, string>,
): Promise<AutofillFillResponse> {
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

  const values: Record<string, string> = {};
  for (const [key, raw] of Object.entries(extractAutofillValues(item))) {
    if (typeof raw === "string" && raw.trim()) {
      values[key] = raw.trim();
    }
  }
  if (fillOverrides) {
    for (const [key, raw] of Object.entries(fillOverrides)) {
      const trimmed = typeof raw === "string" ? raw.trim() : "";
      if (trimmed) {
        values[key] = trimmed;
      }
    }
  }
  const secrets =
    item.categoryId === ITEM_CATEGORY_LOGIN ? extractLoginAutofillSecrets(item) : null;

  // personal_data: nickname maps to username; prefer it over email for username fills.
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
      values,
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

export async function handleAutofillSiteIcon(
  websiteUrl: string,
  urls?: string[],
): Promise<AutofillSiteIconResponse> {
  const session = await readSession();
  const profile = await readProfile();
  if (!session || !profile) {
    return { status: "signed-out" };
  }
  const fresh = await readExtensionUnlockSessionIfFresh(session.user_id);
  if (!fresh?.passwordShareC) {
    return { status: "locked" };
  }
  // Same expand order as vault item favicon / web form preview: full URL → origin → eTLD+1.
  const lookupUrls = [...new Set([...(urls ?? []), websiteUrl].map((u) => u.trim()).filter(Boolean))];
  const png = await previewFaviconPng(profile.apiBaseUrl, session.access_token, lookupUrls);
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
          "X-Attachment-Purpose": "item-favicon",
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

function usernamesEqual(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), undefined, { sensitivity: "accent" }) === 0;
}

function computeUpdateChangedFields(input: {
  item: {
    fields: ItemPlaintextV2["fields"];
  };
  username: string;
  password: string;
  websiteUrl: string;
  pageUrl: string;
}): AutofillUpdateFieldKey[] {
  const secrets = extractLoginAutofillSecrets(input.item);
  const changed: AutofillUpdateFieldKey[] = [];
  if (!secrets || !usernamesEqual(secrets.username, input.username)) {
    changed.push("login");
  }
  if (!secrets || secrets.password !== input.password) {
    changed.push("password");
  }
  const itemUrl = primaryLoginWebsiteUrl(input.item);
  const sameUrl =
    !itemUrl ||
    saveUrlsEqual(itemUrl, input.websiteUrl) ||
    saveUrlsEqual(itemUrl, input.pageUrl);
  if (!sameUrl) {
    changed.push("url");
  }
  return changed.length > 0 ? changed : ["login", "password"];
}

function applyLoginCredentialsToItem(
  item: ItemPlaintextV2,
  input: { title: string; username: string; password: string; websiteUrl: string },
): ItemPlaintextV2 {
  let websiteUpdated = false;
  return {
    ...item,
    title: (input.title || item.title).trim() || item.title,
    updatedAtMs: Date.now(),
    fields: item.fields.map((field) => {
      if ((field.id === "login" || field.type === "email") && field.value.kind === "text") {
        return { ...field, value: { kind: "text" as const, text: input.username } };
      }
      if (field.value.kind === "password") {
        return { ...field, value: { kind: "password" as const, password: input.password } };
      }
      if (field.type === "url" && field.value.kind === "url" && !websiteUpdated) {
        websiteUpdated = true;
        const scope = field.value.urlAutofillScope || "entire-site";
        return {
          ...field,
          value: {
            kind: "url" as const,
            url: input.websiteUrl,
            urlAutofillScope: scope,
          },
        };
      }
      return field;
    }),
  };
}

function toSaveFormDraftItem(item: ItemPlaintextV2): AutofillSaveFormDraftItem {
  return {
    itemId: item.itemId,
    vaultId: item.vaultId,
    title: item.title,
    categoryId: item.categoryId,
    createdAtMs: item.createdAtMs,
    updatedAtMs: item.updatedAtMs,
    schemaVersion: item.schemaVersion,
    sections: item.sections,
    fields: item.fields,
    ...(item.tags ? { tags: item.tags } : {}),
    ...(item.faviconId ? { faviconId: item.faviconId } : {}),
    ...(item.faviconSource ? { faviconSource: item.faviconSource } : {}),
  };
}

function fromSaveFormDraftItem(draft: AutofillSaveFormDraftItem): ItemPlaintextV2 {
  return {
    schemaVersion: draft.schemaVersion as ItemPlaintextV2["schemaVersion"],
    itemId: draft.itemId,
    vaultId: draft.vaultId,
    title: draft.title,
    categoryId: draft.categoryId,
    createdAtMs: draft.createdAtMs,
    updatedAtMs: draft.updatedAtMs,
    sections: draft.sections as ItemPlaintextV2["sections"],
    fields: draft.fields as ItemPlaintextV2["fields"],
    ...(draft.tags ? { tags: draft.tags } : {}),
    ...(draft.faviconId ? { faviconId: draft.faviconId } : {}),
    ...(draft.faviconSource
      ? { faviconSource: draft.faviconSource as ItemPlaintextV2["faviconSource"] }
      : {}),
  };
}

export async function handleAutofillSaveOffer(input: {
  pageUrl: string;
  websiteUrl: string;
  username: string;
  password: string;
}): Promise<AutofillSaveOfferResponse> {
  const auth = await resolveUnlockUserId();
  if (!auth) {
    return { status: "signed-out" };
  }
  if (!auth.unlocked) {
    return { status: "locked" };
  }
  // Match against capture-time URL (and website URL) — not the post-redirect page.
  const matchUrl = input.pageUrl || input.websiteUrl;
  const existing = [...(await matchingLoginItems(auth.userId, matchUrl))];
  if (input.websiteUrl && !saveUrlsEqual(input.websiteUrl, matchUrl)) {
    const byWebsite = await matchingLoginItems(auth.userId, input.websiteUrl);
    for (const item of byWebsite) {
      if (!existing.some((e) => e.itemId === item.itemId)) {
        existing.push(item);
      }
    }
  }
  if (existing.length === 0) {
    return { status: "save" };
  }

  let usernameMatch: (typeof existing)[number] | null = null;
  let fallback: (typeof existing)[number] | null = null;

  for (const item of existing) {
    const secrets = extractLoginAutofillSecrets(item);
    if (!secrets) {
      if (!fallback) {
        fallback = item;
      }
      continue;
    }
    const sameUser = usernamesEqual(secrets.username, input.username);
    const samePass = secrets.password === input.password;
    const itemUrl = primaryLoginWebsiteUrl(item);
    const sameUrl =
      !itemUrl ||
      saveUrlsEqual(itemUrl, input.websiteUrl) ||
      saveUrlsEqual(itemUrl, input.pageUrl);
    // Identical creds + URL → nothing to do.
    if (sameUser && samePass && sameUrl) {
      await touchExtensionUnlockSession(auth.userId);
      return { status: "none" };
    }
    // Same username (password and/or URL differ) → prefer update over create.
    if (sameUser && !usernameMatch) {
      usernameMatch = item;
    } else if (!fallback) {
      fallback = item;
    }
  }

  const target = usernameMatch ?? fallback ?? existing[0];
  if (!target) {
    return { status: "save" };
  }
  await touchExtensionUnlockSession(auth.userId);
  const iconUrl = await storedFaviconDataUrl(target.vaultId, target.itemId, target.faviconId);
  const changedFields = computeUpdateChangedFields({
    item: target,
    username: input.username,
    password: input.password,
    websiteUrl: input.websiteUrl,
    pageUrl: input.pageUrl,
  });
  return {
    status: "update",
    itemId: target.itemId,
    title: target.title || target.itemId,
    changedFields,
    ...(iconUrl ? { iconUrl } : {}),
  };
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
  } catch (err: unknown) {
    if (await wipeIfUnauthorized(err)) {
      return { status: "signed-out" };
    }
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
  itemId?: string;
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
  const workspaceId = await readStoredCurrentWorkspaceId(session.user_id);
  const bundle = await readExtensionVaultBundle(session.user_id);
  if (!workspaceId || !bundle?.encrypted_private_key?.payload) {
    return { status: "error", message: "VAULT_NOT_READY" };
  }

  if (!input.itemId) {
    const existing = await matchingLoginItems(session.user_id, input.pageUrl);
    if (existing.length > 0) {
      return { status: "exists" };
    }
  }

  try {
    await initExtensionCrypto();
    const core = createCoreClient(profile.apiBaseUrl, session.access_token);
    const vaults = await core.listWorkspaceVaults(workspaceId);
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

      if (input.itemId) {
        const existingItem = controller.getItemById(input.itemId);
        if (
          !existingItem ||
          existingItem.deleted ||
          existingItem.archived ||
          existingItem.categoryId !== ITEM_CATEGORY_LOGIN
        ) {
          return { status: "error", message: "ITEM_NOT_FOUND" };
        }
        const title = (input.title || existingItem.title || domainTitleFromUrl(input.websiteUrl)).trim() || "Login";
        let websiteUpdated = false;
        const updated = {
          ...existingItem,
          title,
          updatedAtMs: Date.now(),
          fields: existingItem.fields.map((field) => {
            if (
              (field.id === "login" || field.type === "email") &&
              field.value.kind === "text"
            ) {
              return { ...field, value: { kind: "text" as const, text: input.username } };
            }
            if (field.value.kind === "password") {
              return { ...field, value: { kind: "password" as const, password: input.password } };
            }
            if (field.type === "url" && field.value.kind === "url" && !websiteUpdated) {
              websiteUpdated = true;
              const scope = field.value.urlAutofillScope || "entire-site";
              return {
                ...field,
                value: {
                  kind: "url" as const,
                  url: input.websiteUrl,
                  urlAutofillScope: scope,
                },
              };
            }
            return field;
          }),
        };
        await controller.updateItem(updated);
        // Refresh website favicon when the URL (or other login fields) change.
        try {
          const vault =
            vaults.find((entry) => entry.id === updated.vaultId) ??
            vaults.find((entry) => entry.isPersonal) ??
            vaults[0];
          if (vault) {
            const vaultKey = await resolveVaultItemEncryptionKey({
              vault,
              accountVaultKey: fresh.vaultKey,
              core,
              encryptedPrivateKeyPayload: bundle.encrypted_private_key.payload,
            });
            await syncWebsiteFaviconForItem({
              apiBaseUrl: profile.apiBaseUrl,
              accessToken: session.access_token,
              vaultKey,
              vault,
              controller,
              item: updated,
            });
          }
        } catch {
          /* favicon optional */
        }
        await touchExtensionUnlockSession(session.user_id);
        return { status: "ok", itemId: existingItem.itemId };
      }

      const personal =
        (input.vaultId ? vaults.find((vault) => vault.id === input.vaultId) : undefined) ??
        vaults.find((vault) => vault.isPersonal) ??
        vaults[0];
      if (!personal) {
        return { status: "error", message: "NO_VAULT" };
      }
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

      await controller.createItem(item);

      // Best-effort favicon after create.
      try {
        const vaultKey = await resolveVaultItemEncryptionKey({
          vault: personal,
          accountVaultKey: fresh.vaultKey,
          core,
          encryptedPrivateKeyPayload: bundle.encrypted_private_key.payload,
        });
        await syncWebsiteFaviconForItem({
          apiBaseUrl: profile.apiBaseUrl,
          accessToken: session.access_token,
          vaultKey,
          vault: personal,
          controller,
          item,
        });
      } catch {
        // Item is saved; favicon is optional.
      }

      await touchExtensionUnlockSession(session.user_id);
      return { status: "ok", itemId };
    } finally {
      controller.dispose();
    }
  } catch (err: unknown) {
    if (await wipeIfUnauthorized(err)) {
      return { status: "signed-out" };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { status: "error", message };
  }
}

export async function handleAutofillSaveFormDraft(
  input: Omit<AutofillSaveFormDraftMessage, "type">,
): Promise<AutofillSaveFormDraftResponse> {
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
  const bundle = await readExtensionVaultBundle(session.user_id);
  if (!workspaceId || !bundle?.encrypted_private_key?.payload) {
    return { status: "error", message: "VAULT_NOT_READY" };
  }

  try {
    await initExtensionCrypto();
    const core = createCoreClient(profile.apiBaseUrl, session.access_token);
    const [workspaces, vaults] = await Promise.all([
      core.listWorkspaces(),
      core.listWorkspaceVaults(workspaceId),
    ]);
    const workspace = workspaces.find((item) => item.id === workspaceId);
    const vaultOptions = vaults.map((vault) => ({
      vaultId: vault.id,
      name: vault.name,
      icon: vault.icon || (vault.isPersonal ? "👤" : "💼"),
      isPersonal: Boolean(vault.isPersonal),
    }));
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
      const creds = {
        title: input.title,
        username: input.username,
        password: input.password,
        websiteUrl: input.websiteUrl,
      };

      if (input.kind === "update" && input.itemId) {
        const existing = controller.getItemById(input.itemId);
        if (
          !existing ||
          existing.deleted ||
          existing.archived ||
          existing.categoryId !== ITEM_CATEGORY_LOGIN
        ) {
          return { status: "error", message: "ITEM_NOT_FOUND" };
        }
        const draft = applyLoginCredentialsToItem(existing, creds);
        await touchExtensionUnlockSession(session.user_id);
        return {
          status: "ok",
          kind: "update",
          item: toSaveFormDraftItem(draft),
          workspaceName: workspace?.name?.trim() || "Workspace",
          vaults: vaultOptions,
        };
      }

      const personal =
        (input.vaultId ? vaults.find((vault) => vault.id === input.vaultId) : undefined) ??
        vaults.find((vault) => vault.isPersonal) ??
        vaults[0];
      if (!personal) {
        return { status: "error", message: "NO_VAULT" };
      }
      const itemId = generateEntityId();
      let item = createPresetItemPlaintextV2({
        categoryId: ITEM_CATEGORY_LOGIN,
        itemId,
        vaultId: personal.id,
        title: (input.title || domainTitleFromUrl(input.websiteUrl)).trim() || "Login",
      });
      item = applyLoginCredentialsToItem(item, {
        ...creds,
        title: item.title,
      });
      await touchExtensionUnlockSession(session.user_id);
      return {
        status: "ok",
        kind: "create",
        item: toSaveFormDraftItem(item),
        workspaceName: workspace?.name?.trim() || "Workspace",
        vaults: vaultOptions,
      };
    } finally {
      controller.dispose();
    }
  } catch (err: unknown) {
    if (await wipeIfUnauthorized(err)) {
      return { status: "signed-out" };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { status: "error", message };
  }
}

export async function handleAutofillSaveFormCommit(
  input: Omit<AutofillSaveFormCommitMessage, "type">,
): Promise<AutofillSaveResponse> {
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
  const bundle = await readExtensionVaultBundle(session.user_id);
  if (!workspaceId || !bundle?.encrypted_private_key?.payload) {
    return { status: "error", message: "VAULT_NOT_READY" };
  }

  try {
    await initExtensionCrypto();
    const core = createCoreClient(profile.apiBaseUrl, session.access_token);
    const vaults = await core.listWorkspaceVaults(workspaceId);
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
      const item = fromSaveFormDraftItem(input.item);
      if (input.kind === "update") {
        const existing = controller.getItemById(item.itemId);
        if (
          !existing ||
          existing.deleted ||
          existing.archived ||
          existing.categoryId !== ITEM_CATEGORY_LOGIN
        ) {
          return { status: "error", message: "ITEM_NOT_FOUND" };
        }
        const merged: ItemPlaintextV2 = {
          ...item,
          createdAtMs: existing.createdAtMs,
          updatedAtMs: Date.now(),
          faviconId: item.faviconId ?? existing.faviconId,
          faviconSource: item.faviconSource ?? existing.faviconSource,
        };
        await controller.updateItem(merged);
        try {
          const vault =
            vaults.find((entry) => entry.id === merged.vaultId) ??
            vaults.find((entry) => entry.isPersonal) ??
            vaults[0];
          if (vault) {
            const vaultKey = await resolveVaultItemEncryptionKey({
              vault,
              accountVaultKey: fresh.vaultKey,
              core,
              encryptedPrivateKeyPayload: bundle.encrypted_private_key.payload,
            });
            await syncWebsiteFaviconForItem({
              apiBaseUrl: profile.apiBaseUrl,
              accessToken: session.access_token,
              vaultKey,
              vault,
              controller,
              item: merged,
            });
          }
        } catch {
          /* favicon optional */
        }
        await touchExtensionUnlockSession(session.user_id);
        return { status: "ok", itemId: item.itemId };
      }

      const vault = vaults.find((entry) => entry.id === item.vaultId) ?? vaults.find((entry) => entry.isPersonal) ?? vaults[0];
      if (!vault) {
        return { status: "error", message: "NO_VAULT" };
      }
      const toCreate: ItemPlaintextV2 = {
        ...item,
        vaultId: vault.id,
        updatedAtMs: Date.now(),
      };
      await controller.createItem(toCreate);

      try {
        const vaultKey = await resolveVaultItemEncryptionKey({
          vault,
          accountVaultKey: fresh.vaultKey,
          core,
          encryptedPrivateKeyPayload: bundle.encrypted_private_key.payload,
        });
        await syncWebsiteFaviconForItem({
          apiBaseUrl: profile.apiBaseUrl,
          accessToken: session.access_token,
          vaultKey,
          vault,
          controller,
          item: toCreate,
        });
      } catch {
        /* favicon optional */
      }

      await touchExtensionUnlockSession(session.user_id);
      return { status: "ok", itemId: toCreate.itemId };
    } finally {
      controller.dispose();
    }
  } catch (err: unknown) {
    if (await wipeIfUnauthorized(err)) {
      return { status: "signed-out" };
    }
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
    type === AUTOFILL_MSG.saveOffer ||
    type === AUTOFILL_MSG.saveContext ||
    type === AUTOFILL_MSG.saveFormDraft ||
    type === AUTOFILL_MSG.saveFormCommit ||
    type === AUTOFILL_MSG.siteIcon ||
    type === AUTOFILL_MSG.openAndFill ||
    type === AUTOFILL_MSG.applyFill ||
    type === AUTOFILL_MSG.pendingSaveSet ||
    type === AUTOFILL_MSG.pendingSaveGet ||
    type === AUTOFILL_MSG.pendingSaveClear ||
    type === AUTOFILL_MSG.pendingSaveDismiss ||
    type === AUTOFILL_MSG.pendingSaveMarkInteracted
  );
}

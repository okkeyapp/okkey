import { defineContentScript } from "wxt/utils/define-content-script";

import {
  AUTOFILL_MSG,
  type AutofillFillResponse,
  type AutofillPendingSaveGetResponse,
  type AutofillQueryResponse,
  type AutofillSaveContextResponse,
  type AutofillSaveOfferResponse,
  type AutofillSaveResponse,
  type AutofillSaveVaultOption,
  type AutofillSiteIconResponse,
  type AutofillSuggestion,
} from "../lib/autofillMessages";
import {
  interFontFaceCss,
  OVERLAY_FONT_STACK,
  overlayIconUrl,
} from "../lib/overlayAssets";
import { resolveOverlayThemeCss } from "../lib/overlayTheme";
import {
  captureLoginCredentials,
  classifyAutofillInput,
  suggestionFieldKindsForFocus,
  collectInputHints,
  collectPageFieldKinds,
  fillAutofillValues,
  fillLoginFormAndMaybeSubmit,
  findLoginFields,
  isVisibleFillableElement,
  resolveAutofillAnchorInput,
  submitLoginFormIfReady,
  watchAndFillAutofillValues,
} from "../lib/loginFormFields";

type OverlayMode =
  | "hidden"
  | "list"
  | "unlock-tooltip"
  | "empty-tooltip"
  | "save"
  | "save-rename"
  | "unlock-save";

type SavePromptKind = "create" | "update";

function overlayStrings() {
  const ru = (navigator.language || "").toLowerCase().startsWith("ru");
  return ru
    ? {
        unlockCta: "Разблокировать Okkey",
        unlockTooltip: "Разблокируйте Okkey",
        saveTitle: "Сохранить учётную запись?",
        updateTitle: "Обновить пароль/логин в записи?",
        saveUnlockBody: "Чтобы сохранить учётную запись, сначала нужно разблокировать Okkey.",
        updateUnlockBody: "Чтобы обновить учётную запись, сначала нужно разблокировать Okkey.",
        saveConfirm: "Сохранить",
        updateConfirm: "Обновить",
        emptyTooltip: "Нет элементов для автозаполнения",
        workspaceFallback: "Workspace",
        vaultFallback: "Сейф",
      }
    : {
        unlockCta: "Unlock Okkey",
        unlockTooltip: "Unlock Okkey",
        saveTitle: "Save this login?",
        updateTitle: "Update login or password?",
        saveUnlockBody: "To save this login, unlock Okkey first.",
        updateUnlockBody: "To update this login, unlock Okkey first.",
        saveConfirm: "Save",
        updateConfirm: "Update",
        emptyTooltip: "No items to autofill",
        workspaceFallback: "Workspace",
        vaultFallback: "Vault",
      };
}

function pageUrl(): string {
  return location.origin + location.pathname;
}

function websiteUrl(): string {
  return location.origin + location.pathname;
}

function domainTitle(): string {
  return location.hostname.replace(/^www\./i, "") || location.hostname;
}

async function queryMatches(fieldKinds?: string[]): Promise<AutofillQueryResponse> {
  return browser.runtime.sendMessage({
    type: AUTOFILL_MSG.query,
    pageUrl: pageUrl(),
    ...(fieldKinds && fieldKinds.length > 0 ? { fieldKinds } : {}),
  });
}

async function fillItem(itemId: string): Promise<AutofillFillResponse> {
  return browser.runtime.sendMessage({ type: AUTOFILL_MSG.fill, itemId, pageUrl: pageUrl() });
}

async function fetchSaveContext(): Promise<AutofillSaveContextResponse> {
  return browser.runtime.sendMessage({ type: AUTOFILL_MSG.saveContext });
}

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  allFrames: true,
  runAt: "document_idle",
  main() {
    const strings = overlayStrings();
    let host: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;
    let hideTimer = 0;
    let activeInput: HTMLInputElement | null = null;
    /** Skip save prompt shortly after Okkey filled credentials. */
    let filledByOkkeyUntil = 0;
    /** After login submit, do not auto-open unlock tooltip (noisy on OTP step). */
    let suppressUnlockTooltipUntil = 0;
    let pendingSave: { username: string; password: string } | null = null;
    let pendingUpdateItemId: string | null = null;
    let savePromptKind: SavePromptKind = "create";
    let pendingTotpItemId: string | null = null;
    let otpObserver: MutationObserver | null = null;
    let stopCreditCardFillWatch: (() => void) | null = null;
    let overlayMode: OverlayMode = "hidden";
    let listOpen = false;
    let cachedSuggestions: AutofillSuggestion[] = [];
    let saveTitleDraft = "";
    let saveEditing = false;
    let saveVaults: AutofillSaveVaultOption[] = [];
    let saveWorkspaceName = "";
    let saveVaultId = "";
    let vaultMenuOpen = false;
    let saveIconUrl: string | undefined;

    function markFilledByOkkey(): void {
      filledByOkkeyUntil = Date.now() + 15_000;
    }

    function wasFilledByOkkey(): boolean {
      return Date.now() < filledByOkkeyUntil;
    }

    let overlayWired = false;

    function ensureOverlay(): ShadowRoot {
      if (host && shadow) {
        return shadow;
      }
      host = document.createElement("div");
      host.setAttribute("data-okkey-autofill", "true");
      host.style.cssText =
        "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:none;";
      shadow = host.attachShadow({ mode: "closed" });
      document.documentElement.appendChild(host);
      return shadow;
    }

    function hideOverlay(): void {
      overlayMode = "hidden";
      listOpen = false;
      vaultMenuOpen = false;
      if (host) {
        host.style.display = "none";
        host.style.pointerEvents = "none";
      }
      if (shadow) {
        shadow.innerHTML = "";
      }
      if (!pendingSave) {
        restoreNativeAutocomplete();
      }
    }

    const suppressedFields = new Map<
      HTMLInputElement,
      { autocomplete: string | null; readonly: boolean }
    >();

    function suppressNativeAutocomplete(input: HTMLInputElement, kind: string): void {
      if (!suppressedFields.has(input)) {
        suppressedFields.set(input, {
          autocomplete: input.getAttribute("autocomplete"),
          readonly: input.readOnly,
        });
      }
      if (kind === "password" || kind === "db-password" || kind === "crypto-pin" || kind === "crypto-passphrase") {
        input.setAttribute("autocomplete", "new-password");
      } else {
        input.setAttribute("autocomplete", "off");
      }
      input.setAttribute("data-lpignore", "true");
      input.setAttribute("data-1p-ignore", "true");
      input.setAttribute("data-bwignore", "true");
      if (input.form) {
        if (!input.form.dataset.okkeyAcOrig) {
          input.form.dataset.okkeyAcOrig = input.form.getAttribute("autocomplete") ?? "";
        }
        input.form.setAttribute("autocomplete", "off");
      }
      if (!input.readOnly) {
        input.readOnly = true;
        requestAnimationFrame(() => {
          input.readOnly = false;
          input.focus();
        });
      }
    }

    function restoreNativeAutocomplete(): void {
      for (const [input, orig] of suppressedFields) {
        if (orig.autocomplete == null) {
          input.removeAttribute("autocomplete");
        } else {
          input.setAttribute("autocomplete", orig.autocomplete);
        }
        input.readOnly = orig.readonly;
        input.removeAttribute("data-lpignore");
        input.removeAttribute("data-1p-ignore");
        input.removeAttribute("data-bwignore");
        if (input.form?.dataset.okkeyAcOrig != null) {
          const formOrig = input.form.dataset.okkeyAcOrig;
          if (formOrig) {
            input.form.setAttribute("autocomplete", formOrig);
          } else {
            input.form.removeAttribute("autocomplete");
          }
          delete input.form.dataset.okkeyAcOrig;
        }
      }
      suppressedFields.clear();
    }

    function suggestionsSuppressed(): boolean {
      return wasFilledByOkkey();
    }

    function panelBaseStyles(themeCssVars: string): string {
      return `
          ${interFontFaceCss()}
          :host {
            ${themeCssVars}
            font-family: ${OVERLAY_FONT_STACK} !important;
            color: hsl(var(--ok-fg));
            line-height: 20px;
            -webkit-font-smoothing: antialiased;
          }
          *, *::before, *::after {
            box-sizing: border-box;
            font-family: ${OVERLAY_FONT_STACK} !important;
          }
          .panel {
            display: block;
            pointer-events: auto;
            box-sizing: border-box;
            position: relative;
            width: 360px;
            max-width: calc(100vw - 16px);
            font-family: ${OVERLAY_FONT_STACK} !important;
            font-size: 14px;
            font-weight: 400;
            line-height: 20px;
            color: hsl(var(--ok-fg));
            background: hsl(var(--ok-bg));
            border: 0;
            border-radius: 12px;
            box-shadow:
              0 0 0 1px rgba(var(--ok-shadow), 0.14),
              0 2px 3px rgba(var(--ok-shadow), 0.16);
            overflow: hidden;
            -webkit-font-smoothing: antialiased;
          }
          .panel-save {
            width: 400px;
            max-width: min(400px, calc(100vw - 16px));
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            /* Vault menu must paint outside the card; do not clip it. */
            overflow: visible;
          }
          .list {
            display: flex;
            flex-direction: column;
            gap: 0;
            padding: 8px;
          }
          button.row, .row {
            display: flex;
            align-items: center;
            gap: 16px;
            width: 100%;
            text-align: left;
            border: 0;
            border-radius: 8px;
            background: transparent;
            padding: 8px 10px;
            margin: 0;
            cursor: pointer;
            color: hsl(var(--ok-fg));
            appearance: none;
            -webkit-appearance: none;
            font: inherit;
          }
          button.row:hover, button.row:focus-visible {
            background: hsl(var(--ok-hover));
            outline: none;
          }
          .row-icon {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: #64748b;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: -0.025em;
            line-height: 1;
            text-transform: uppercase;
            flex-shrink: 0;
            overflow: hidden;
          }
          .row-icon img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .row-text {
            min-width: 0;
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .row-title {
            display: block;
            font-size: 14px;
            font-weight: 500;
            line-height: 20px;
            color: hsl(var(--ok-fg));
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .row-meta {
            display: block;
            font-size: 13px;
            font-weight: 400;
            line-height: 18px;
            color: hsl(var(--ok-muted));
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          button.cta {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            min-height: 36px;
            height: 36px;
            border: 0;
            border-radius: 8px;
            padding: 8px 16px;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            font-weight: 500;
            line-height: 20px;
            appearance: none;
            -webkit-appearance: none;
            background: hsl(var(--ok-primary));
            color: hsl(var(--ok-primary-fg));
            box-shadow: 0 1px 1px rgba(0,0,0,0.1);
          }
          button.cta:hover { filter: brightness(0.95); }
          button.cta:focus-visible {
            outline: none;
            filter: brightness(0.95);
            box-shadow: 0 0 0 2px hsl(var(--ok-primary) / 0.4), 0 1px 1px rgba(0,0,0,0.1);
          }
          button.cta img { width: 16px; height: 16px; display: block; }
          button.icon-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border: 0;
            border-radius: 8px;
            background: hsl(var(--ok-edit-btn));
            padding: 0;
            cursor: pointer;
            flex-shrink: 0;
            appearance: none;
            outline: none;
            transition: background-color 150ms ease, box-shadow 150ms ease, filter 150ms ease;
          }
          button.icon-btn img { width: 16px; height: 16px; display: block; }
          button.icon-btn:hover {
            filter: brightness(0.96);
            background: hsl(var(--ok-hover));
          }
          button.icon-btn:focus-visible {
            background: hsl(var(--ok-hover));
            box-shadow: 0 0 0 2px hsl(var(--ok-primary));
          }
          /* Match packages/ui Popup dialog close (size-8, muted → hover muted bg + ring). */
          button.close-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            margin: -8px -8px -8px 0;
            border: 0;
            border-radius: 6px;
            background: transparent;
            padding: 0;
            cursor: pointer;
            flex-shrink: 0;
            appearance: none;
            outline: none;
            transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease;
          }
          button.close-btn img {
            width: 16px;
            height: 16px;
            display: block;
            opacity: 0.7;
            transition: opacity 150ms ease;
          }
          button.close-btn:hover {
            background: hsl(var(--ok-hover));
          }
          button.close-btn:hover img {
            opacity: 1;
          }
          button.close-btn:focus-visible {
            background: hsl(var(--ok-hover));
            box-shadow: 0 0 0 2px hsl(var(--ok-primary));
          }
          button.close-btn:focus-visible img {
            opacity: 1;
          }
          .save-header {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
          }
          .save-header img.logo {
            width: 32px;
            height: 32px;
            flex-shrink: 0;
            display: block;
          }
          .save-title {
            font-size: 16px;
            font-weight: 600;
            line-height: 28px;
            color: hsl(var(--ok-fg));
            white-space: nowrap;
          }
          .save-header .spacer { flex: 1; min-width: 0; }
          .save-body {
            font-size: 14px;
            font-weight: 400;
            line-height: 20px;
            color: hsl(var(--ok-muted));
            width: 100%;
          }
          .save-card {
            position: relative;
            z-index: 2;
            width: 100%;
            background: hsl(var(--ok-row-muted));
            border-radius: 8px;
            overflow: visible;
          }
          .save-card .row {
            pointer-events: none;
            cursor: default;
            /* Keep preview row height stable when switching to rename input. */
            min-height: 48px;
          }
          /* Pencil must remain clickable despite non-interactive preview row. */
          .save-card .row .icon-btn { pointer-events: auto; }
          .save-card .row.editing { pointer-events: auto; }
          .rename-wrap {
            flex: 1;
            min-width: 0;
            display: flex;
            align-items: center;
            height: 32px;
            min-height: 32px;
            background: hsl(var(--ok-bg));
            border: 1px solid hsl(var(--ok-primary));
            border-radius: 8px;
            box-shadow: 0 0 0 2px hsla(var(--ok-primary) / 0.4);
            padding: 4px 4px 4px 12px;
            gap: 4px;
          }
          .rename-wrap input {
            flex: 1;
            min-width: 0;
            border: 0;
            outline: none;
            background: transparent;
            font-size: 14px;
            font-weight: 500;
            line-height: 20px;
            color: hsl(var(--ok-fg));
            font-family: inherit;
            padding: 0;
          }
          .rename-check {
            width: 24px;
            height: 24px;
            border: 0;
            border-radius: 6px;
            background: hsl(var(--ok-primary));
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            padding: 0;
            flex-shrink: 0;
            appearance: none;
            outline: none;
            transition: filter 150ms ease, box-shadow 150ms ease;
          }
          .rename-check img { width: 16px; height: 16px; display: block; }
          .rename-check:hover { filter: brightness(0.95); }
          .rename-check:focus-visible {
            filter: brightness(0.95);
            box-shadow: 0 0 0 2px hsl(var(--ok-primary) / 0.4);
          }
          .save-divider {
            height: 1px;
            width: 100%;
            background: rgba(15, 23, 42, 0.1);
            border: 0;
            margin: 0;
          }
          .vault-row {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            padding: 8px 16px 4px;
            position: relative;
          }
          .vault-ws {
            font-size: 14px;
            font-weight: 500;
            line-height: 20px;
            color: hsl(var(--ok-fg));
            white-space: nowrap;
          }
          .vault-arrow {
            font-size: 14px;
            font-weight: 400;
            line-height: 20px;
            color: hsl(var(--ok-fg));
          }
          button.vault-picker {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: hsl(var(--ok-bg));
            border: 0;
            border-radius: 8px;
            padding: 4px 8px;
            cursor: pointer;
            font: inherit;
            color: hsl(var(--ok-fg));
            appearance: none;
            max-width: 100%;
            outline: none;
            transition: background-color 150ms ease, box-shadow 150ms ease;
          }
          button.vault-picker:hover {
            background: hsl(var(--ok-hover));
          }
          button.vault-picker:focus-visible {
            background: hsl(var(--ok-hover));
            box-shadow: 0 0 0 2px hsl(var(--ok-primary) / 0.4);
          }
          button.vault-picker .vault-name {
            font-size: 14px;
            font-weight: 400;
            line-height: 20px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 140px;
          }
          button.vault-picker img.chevron {
            width: 16px;
            height: 16px;
            display: block;
            flex-shrink: 0;
          }
          .vault-menu {
            position: absolute;
            left: 16px;
            right: 16px;
            top: calc(100% - 2px);
            z-index: 20;
            max-height: min(240px, calc(100vh - 24px));
            overflow-y: auto;
            background: hsl(var(--ok-bg));
            border: 1px solid hsl(var(--ok-primary) / 0.35);
            border-radius: 8px;
            box-shadow: 0 8px 20px rgba(var(--ok-shadow), 0.16);
            padding: 4px;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .vault-menu button {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            border: 0;
            background: transparent;
            border-radius: 6px;
            padding: 6px 8px;
            cursor: pointer;
            font: inherit;
            color: hsl(var(--ok-fg));
            text-align: left;
            appearance: none;
            outline: none;
          }
          .vault-menu button:hover,
          .vault-menu button:focus-visible {
            background: hsl(var(--ok-hover));
          }
          .vault-menu button[aria-selected="true"] {
            background: hsl(var(--ok-hover));
            font-weight: 500;
          }
          .save-actions {
            position: relative;
            z-index: 1;
            display: flex;
            justify-content: flex-end;
            width: 100%;
          }
          .toggle {
            pointer-events: auto;
            position: fixed;
            width: 20px;
            height: 20px;
            border-radius: 40px;
            border: 1px solid #fff;
            background: hsl(var(--ok-primary));
            box-shadow:
              0 0 0 1px rgba(0,0,0,0.08),
              0 1px 3px rgba(0,0,0,0.1);
            padding: 0;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            appearance: none;
            z-index: 2;
          }
          .toggle img {
            width: 11.5px;
            height: 14.2px;
            display: block;
            margin-left: 1px;
          }
          .tooltip {
            pointer-events: none;
            position: fixed;
            z-index: 3;
            box-sizing: border-box;
            max-width: min(220px, calc(100vw - 16px));
            padding: 6px 10px;
            border-radius: 6px;
            background: hsl(var(--ok-fg));
            color: hsl(var(--ok-bg));
            font-size: 12px;
            font-weight: 500;
            line-height: 16px;
            text-align: center;
            box-shadow: 0 4px 12px rgba(var(--ok-shadow), 0.2);
            white-space: normal;
            overflow-wrap: anywhere;
            word-break: break-word;
            /* 8px gap + 5px arrow height — matches packages/ui Tooltip sideOffset + Arrow */
            transform: translate(-50%, calc(-100% - 13px));
          }
          .tooltip-arrow {
            /* Visual twin of packages/ui TooltipPrimitive.Arrow (11×5, fill-foreground) */
            position: absolute;
            left: calc(50% + var(--ok-tooltip-arrow-offset, 0px));
            bottom: 0;
            width: 0;
            height: 0;
            transform: translate(-50%, 100%) translateY(-1px);
            border-left: 5.5px solid transparent;
            border-right: 5.5px solid transparent;
            border-top: 5px solid hsl(var(--ok-fg));
            pointer-events: none;
          }
      `;
    }

    function escapeHtml(value: string): string {
      return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    const MONOGRAM_COLORS = [
      "#ef4444",
      "#f97316",
      "#f59e0b",
      "#eab308",
      "#84cc16",
      "#22c55e",
      "#10b981",
      "#14b8a6",
      "#06b6d4",
      "#0ea5e9",
      "#3b82f6",
      "#6366f1",
      "#8b5cf6",
      "#a855f7",
      "#d946ef",
      "#ec4899",
      "#f43f5e",
      "#64748b",
    ] as const;

    function monogram(title: string): string {
      const trimmed = title.trim();
      if (!trimmed) {
        return "?";
      }
      const words = trimmed.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      if (words.length >= 2) {
        const a = words[0]?.[0];
        const b = words[1]?.[0];
        if (a && b) {
          return (a + b).toLocaleUpperCase();
        }
      }
      return trimmed.slice(0, 2).toLocaleUpperCase();
    }

    function monogramBackground(text: string): string {
      const first = text.trim().charAt(0).toUpperCase();
      const code = first.charCodeAt(0);
      if (code >= 65 && code <= 90) {
        return MONOGRAM_COLORS[(code - 65) % MONOGRAM_COLORS.length] ?? MONOGRAM_COLORS[0];
      }
      return MONOGRAM_COLORS[0];
    }

    function suggestionRowHtml(item: AutofillSuggestion): string {
      const letters = monogram(item.title);
      const iconInner = item.iconUrl
        ? `<img src="${escapeHtml(item.iconUrl)}" alt="" />`
        : escapeHtml(letters);
      const meta = item.username
        ? `<span class="row-meta">${escapeHtml(item.username)}</span>`
        : "";
      return `<button type="button" class="row" data-item="${escapeHtml(item.itemId)}">
              <span class="row-icon" style="background:${monogramBackground(letters)}">${iconInner}</span>
              <span class="row-text">
                <span class="row-title">${escapeHtml(item.title)}</span>
                ${meta}
              </span>
            </button>`;
    }

    function previewRowHtml(input: {
      title: string;
      username: string;
      iconUrl?: string;
      editing?: boolean;
    }): string {
      const letters = monogram(input.title);
      const iconInner = input.iconUrl
        ? `<img src="${escapeHtml(input.iconUrl)}" alt="" />`
        : escapeHtml(letters);
      if (input.editing) {
        return `<div class="row editing">
              <span class="row-icon" style="background:${monogramBackground(letters)}">${iconInner}</span>
              <div class="rename-wrap">
                <input type="text" data-rename-input value="${escapeHtml(input.title)}" />
                <button type="button" class="rename-check" data-rename-confirm="1" aria-label="OK">
                  <img src="${escapeHtml(overlayIconUrl("tabler-check"))}" alt="" />
                </button>
              </div>
            </div>`;
      }
      const meta = input.username
        ? `<span class="row-meta">${escapeHtml(input.username)}</span>`
        : "";
      return `<div class="row">
              <span class="row-icon" style="background:${monogramBackground(letters)}">${iconInner}</span>
              <span class="row-text">
                <span class="row-title">${escapeHtml(input.title)}</span>
                ${meta}
              </span>
              <button type="button" class="icon-btn" data-rename-start="1" aria-label="Edit">
                <img src="${escapeHtml(overlayIconUrl("tabler-pencil"))}" alt="" />
              </button>
            </div>`;
    }

    function selectedVault(): AutofillSaveVaultOption | undefined {
      return saveVaults.find((vault) => vault.vaultId === saveVaultId) ?? saveVaults[0];
    }

    function vaultPickerHtml(): string {
      const vault = selectedVault();
      const icon = vault?.icon || "💼";
      const name = vault?.name || strings.vaultFallback;
      const selectedId = vault?.vaultId ?? saveVaultId;
      const menu = vaultMenuOpen
        ? `<div class="vault-menu" role="listbox">${saveVaults
            .map((option) => {
              const selected = option.vaultId === selectedId;
              return `<button type="button" role="option" data-vault-id="${escapeHtml(option.vaultId)}" aria-selected="${selected ? "true" : "false"}">
                   <span>${escapeHtml(option.icon || "💼")}</span>
                   <span>${escapeHtml(option.name)}</span>
                 </button>`;
            })
            .join("")}</div>`
        : "";
      return `<div class="vault-row">
        <span class="vault-ws">${escapeHtml(saveWorkspaceName || strings.workspaceFallback)}</span>
        <span class="vault-arrow">→</span>
        <button type="button" class="vault-picker" data-vault-toggle="1">
          <span>${escapeHtml(icon)}</span>
          <span class="vault-name">${escapeHtml(name)}</span>
          <img class="chevron" src="${escapeHtml(overlayIconUrl("lucide-chevron-down"))}" alt="" />
        </button>
        ${menu}
      </div>`;
    }

    function savePanelHtml(locked: boolean): string {
      const isUpdate = savePromptKind === "update";
      const titleText = isUpdate ? strings.updateTitle : strings.saveTitle;
      const unlockBody = isUpdate ? strings.updateUnlockBody : strings.saveUnlockBody;
      const confirmText = isUpdate ? strings.updateConfirm : strings.saveConfirm;
      if (locked) {
        return `<div class="panel panel-save">
          <div class="save-header">
            <img class="logo" src="${escapeHtml(overlayIconUrl("okkey-logo-lock"))}" alt="" />
            <span class="save-title">${escapeHtml(titleText)}</span>
            <span class="spacer"></span>
            <button type="button" class="close-btn" data-save-cancel="1" aria-label="Close">
              <img src="${escapeHtml(overlayIconUrl("lucide-x"))}" alt="" />
            </button>
          </div>
          <div class="save-body">${escapeHtml(unlockBody)}</div>
          <div class="save-actions">
            <button type="button" class="cta" data-unlock="1">
              <img src="${escapeHtml(overlayIconUrl("lucide-unlock"))}" alt="" />
              <span>${escapeHtml(strings.unlockCta)}</span>
            </button>
          </div>
        </div>`;
      }
      const title = saveTitleDraft || domainTitle();
      const preview = previewRowHtml({
        title,
        username: pendingSave?.username ?? "",
        iconUrl: saveIconUrl,
        editing: saveEditing,
      });
      const vaultBlock = isUpdate
        ? ""
        : `<hr class="save-divider" />
          ${vaultPickerHtml()}`;
      return `<div class="panel panel-save">
        <div class="save-header">
          <img class="logo" src="${escapeHtml(overlayIconUrl("okkey-logo"))}" alt="" />
          <span class="save-title">${escapeHtml(titleText)}</span>
          <span class="spacer"></span>
          <button type="button" class="close-btn" data-save-cancel="1" aria-label="Close">
            <img src="${escapeHtml(overlayIconUrl("lucide-x"))}" alt="" />
          </button>
        </div>
        <div class="save-card">
          ${preview}
          ${vaultBlock}
        </div>
        <div class="save-actions">
          <button type="button" class="cta" data-save-confirm="1">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    }

    function listHtml(suggestions: AutofillSuggestion[]): string {
      return `<div class="panel"><div class="list">${suggestions
        .map((item) => suggestionRowHtml(item))
        .join("")}</div></div>`;
    }

    function toggleAnchorInput(input: HTMLInputElement): HTMLInputElement {
      return resolveAutofillAnchorInput(input);
    }

    function toggleRectForInput(input: HTMLElement): { left: number; top: number } {
      const rect = input.getBoundingClientRect();
      const size = 20;
      return {
        left: Math.max(4, rect.right - size - 8),
        top: rect.top + (rect.height - size) / 2,
      };
    }

    function positionPanelNearInput(panel: HTMLElement, input: HTMLElement): void {
      const rect = input.getBoundingClientRect();
      const width = panel.offsetWidth || 360;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      panel.style.position = "fixed";
      panel.style.left = `${left}px`;
      panel.style.top = `${rect.bottom + 6}px`;
    }

    function positionSavePanel(panel: HTMLElement): void {
      panel.style.position = "fixed";
      panel.style.top = "16px";
      panel.style.right = "16px";
      panel.style.left = "auto";
      panel.style.transform = "none";
    }

    function wireOverlayOnce(root: ShadowRoot): void {
      if (overlayWired) {
        return;
      }
      overlayWired = true;
      root.addEventListener("mousedown", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        // Allow text inputs to take focus / caret; still keep page fields from stealing.
        if (target.closest("input, textarea, select, [contenteditable]")) {
          return;
        }
        if (target.closest(".panel, .toggle, .tooltip")) {
          event.preventDefault();
        }
      });
      root.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        if (target.closest("[data-toggle]")) {
          void onToggleClick();
          return;
        }
        if (target.closest("[data-unlock]")) {
          void browser.runtime.sendMessage({ type: AUTOFILL_MSG.unlock });
          return;
        }
        if (target.closest("[data-save-cancel]")) {
          pendingSave = null;
          pendingUpdateItemId = null;
          savePromptKind = "create";
          saveEditing = false;
          void clearPendingSaveOffer();
          hideOverlay();
          return;
        }
        if (target.closest("[data-save-confirm]")) {
          void confirmSave();
          return;
        }
        if (target.closest("[data-rename-start]")) {
          saveEditing = true;
          overlayMode = "save-rename";
          void paintOverlay();
          return;
        }
        if (target.closest("[data-rename-confirm]")) {
          const input = root.querySelector("[data-rename-input]");
          if (input instanceof HTMLInputElement) {
            saveTitleDraft = input.value.trim() || domainTitle();
          }
          saveEditing = false;
          overlayMode = "save";
          void paintOverlay();
          return;
        }
        if (target.closest("[data-vault-toggle]")) {
          vaultMenuOpen = !vaultMenuOpen;
          void paintOverlay();
          return;
        }
        const vaultBtn = target.closest("[data-vault-id]");
        if (vaultBtn instanceof HTMLElement && vaultBtn.dataset.vaultId) {
          saveVaultId = vaultBtn.dataset.vaultId;
          vaultMenuOpen = false;
          void paintOverlay();
          return;
        }
        const row = target.closest("[data-item]");
        if (row instanceof HTMLElement && row.dataset.item) {
          void applyFillForItem(row.dataset.item).then(() => hideOverlay());
        }
      });
    }

    function focusRenameInput(root: ShadowRoot): void {
      const renameInput = root.querySelector("[data-rename-input]");
      if (!(renameInput instanceof HTMLInputElement)) {
        return;
      }
      renameInput.focus();
      // Caret at end so the user can append; do not select-all / wipe on type.
      const end = renameInput.value.length;
      try {
        renameInput.setSelectionRange(end, end);
      } catch {
        /* ignore */
      }
      renameInput.onkeydown = (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveTitleDraft = renameInput.value.trim() || domainTitle();
          saveEditing = false;
          overlayMode = "save";
          void paintOverlay();
        } else if (event.key === "Escape") {
          event.preventDefault();
          saveEditing = false;
          overlayMode = "save";
          void paintOverlay();
        }
      };
    }

    async function paintOverlay(opts?: { showToggleOnly?: boolean }): Promise<void> {
      const root = ensureOverlay();
      if (!host) {
        return;
      }
      const theme = await resolveOverlayThemeCss();
      const anchorInput =
        activeInput && document.contains(activeInput) ? toggleAnchorInput(activeInput) : null;
      const togglePos = anchorInput ? toggleRectForInput(anchorInput) : null;
      const showToggle = Boolean(togglePos && !pendingSave && overlayMode !== "unlock-save");

      let panelMarkup = "";
      if (overlayMode === "list" && cachedSuggestions.length > 0) {
        panelMarkup = listHtml(cachedSuggestions);
      } else if (overlayMode === "save" || overlayMode === "save-rename") {
        panelMarkup = savePanelHtml(false);
      } else if (overlayMode === "unlock-save") {
        panelMarkup = savePanelHtml(true);
      }

      const tooltipText =
        overlayMode === "empty-tooltip"
          ? strings.emptyTooltip
          : overlayMode === "unlock-tooltip"
            ? strings.unlockTooltip
            : null;
      const tooltipMarkup =
        tooltipText && togglePos
          ? `<div class="tooltip" style="left:${togglePos.left + 10}px;top:${togglePos.top}px"><span class="tooltip-arrow" aria-hidden="true"></span>${escapeHtml(tooltipText)}</div>`
          : "";

      const toggleMarkup =
        showToggle && togglePos
          ? `<button type="button" class="toggle" data-toggle="1" style="left:${togglePos.left}px;top:${togglePos.top}px" aria-label="Okkey">
               <img src="${escapeHtml(overlayIconUrl("okkey-mark"))}" alt="" />
             </button>`
          : "";

      host.style.display = "block";
      host.style.pointerEvents = "none";
      root.innerHTML = `<style>${panelBaseStyles(theme.cssVars)}</style>${toggleMarkup}${tooltipMarkup}${panelMarkup}`;
      wireOverlayOnce(root);
      focusRenameInput(root);

      const tip = root.querySelector(".tooltip");
      if (tip instanceof HTMLElement && togglePos) {
        const buttonCenter = togglePos.left + 10;
        const rect = tip.getBoundingClientRect();
        const half = rect.width / 2;
        const minCenter = 8 + half;
        const maxCenter = window.innerWidth - 8 - half;
        const currentCenter = rect.left + half;
        const clamped = Math.min(Math.max(currentCenter, minCenter), maxCenter);
        tip.style.left = `${clamped}px`;
        // Keep arrow aimed at the Okkey toggle when the tip is edge-clamped.
        tip.style.setProperty("--ok-tooltip-arrow-offset", `${buttonCenter - clamped}px`);
      }

      const panel = root.querySelector(".panel");
      if (panel instanceof HTMLElement) {
        panel.style.pointerEvents = "auto";
        if (
          overlayMode === "save" ||
          overlayMode === "save-rename" ||
          overlayMode === "unlock-save"
        ) {
          positionSavePanel(panel);
        } else if (anchorInput && document.contains(anchorInput)) {
          positionPanelNearInput(panel, anchorInput);
        }
      }
      if (opts?.showToggleOnly && !panelMarkup && !tooltipMarkup && !toggleMarkup) {
        hideOverlay();
      }
    }

    function fieldKindsForQuery(focused?: HTMLInputElement | null): string[] {
      const pageKinds = collectPageFieldKinds(document);
      const focusedKind = focused
        ? classifyAutofillInput(collectInputHints(focused))
        : null;
      // Focused field only — never union sibling card/email kinds into one query.
      return suggestionFieldKindsForFocus(focusedKind, pageKinds);
    }

    async function onToggleClick(): Promise<void> {
      if (!activeInput) {
        return;
      }
      // Unlock-tooltip clicks open the vault unlock UI (not toggle-closed).
      if (listOpen && overlayMode === "list") {
        listOpen = false;
        overlayMode = "hidden";
        await paintOverlay({ showToggleOnly: true });
        return;
      }
      let response: AutofillQueryResponse;
      try {
        response = await queryMatches(fieldKindsForQuery(activeInput));
      } catch {
        return;
      }
      if (response.status === "signed-out") {
        hideOverlay();
        return;
      }
      if (response.status === "locked") {
        listOpen = false;
        overlayMode = "unlock-tooltip";
        await paintOverlay();
        // Content scripts cannot call action.openPopup — route via background.
        void browser.runtime.sendMessage({ type: AUTOFILL_MSG.unlock });
        return;
      }
      cachedSuggestions = response.suggestions;
      if (cachedSuggestions.length === 0) {
        listOpen = false;
        overlayMode = "empty-tooltip";
        await paintOverlay();
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => {
          if (overlayMode === "empty-tooltip") {
            overlayMode = "hidden";
            void paintOverlay({ showToggleOnly: true });
          }
        }, 2200);
        return;
      }
      listOpen = true;
      overlayMode = "list";
      await paintOverlay();
    }

    async function showForInput(input: HTMLInputElement): Promise<void> {
      if (suggestionsSuppressed()) {
        hideOverlay();
        return;
      }
      activeInput = input;
      let response: AutofillQueryResponse;
      try {
        response = await queryMatches(fieldKindsForQuery(input));
      } catch {
        hideOverlay();
        return;
      }
      if (suggestionsSuppressed() || activeInput !== input) {
        return;
      }
      if (response.status === "signed-out") {
        hideOverlay();
        return;
      }
      if (response.status === "locked") {
        cachedSuggestions = [];
        if (Date.now() < suppressUnlockTooltipUntil) {
          // Post-submit / OTP step: keep the toggle, skip the unlock tooltip.
          listOpen = false;
          overlayMode = "hidden";
          await paintOverlay({ showToggleOnly: true });
          return;
        }
        listOpen = false;
        overlayMode = "unlock-tooltip";
        await paintOverlay();
        return;
      }
      cachedSuggestions = response.suggestions;
      if (cachedSuggestions.length === 0) {
        listOpen = false;
        overlayMode = "hidden";
        await paintOverlay({ showToggleOnly: true });
        return;
      }
      listOpen = true;
      overlayMode = "list";
      await paintOverlay();
    }

    function showSavePrompt(
      creds: { username: string; password: string },
      locked: boolean,
      opts?: { kind?: SavePromptKind; itemId?: string; title?: string; iconUrl?: string },
    ): void {
      pendingSave = creds;
      savePromptKind = opts?.kind ?? "create";
      pendingUpdateItemId = savePromptKind === "update" ? opts?.itemId ?? null : null;
      listOpen = false;
      saveEditing = false;
      vaultMenuOpen = false;
      if (opts?.title) {
        saveTitleDraft = opts.title;
      } else if (!saveTitleDraft) {
        saveTitleDraft = domainTitle();
      }
      if (opts?.iconUrl) {
        saveIconUrl = opts.iconUrl;
      }
      overlayMode = locked ? "unlock-save" : "save";
      void paintOverlay();
      if (!locked && savePromptKind === "create") {
        void hydrateSaveContext();
      }
      if (!opts?.iconUrl) {
        void hydrateSavePromptIcon(creds);
      }
    }

    async function clearPendingSaveOffer(): Promise<void> {
      try {
        await browser.runtime.sendMessage({ type: AUTOFILL_MSG.pendingSaveClear });
      } catch {
        /* ignore */
      }
    }

    async function persistPendingSaveOffer(creds: { username: string; password: string }): Promise<void> {
      try {
        await browser.runtime.sendMessage({
          type: AUTOFILL_MSG.pendingSaveSet,
          username: creds.username,
          password: creds.password,
          captureUrl: pageUrl(),
        });
      } catch {
        /* ignore */
      }
    }

    async function markDestinationInteracted(): Promise<void> {
      try {
        await browser.runtime.sendMessage({
          type: AUTOFILL_MSG.pendingSaveMarkInteracted,
          currentUrl: pageUrl(),
        });
      } catch {
        /* ignore */
      }
    }

    async function restorePendingSaveOffer(): Promise<void> {
      if (window !== window.top) {
        return;
      }
      let response: AutofillPendingSaveGetResponse;
      try {
        response = (await browser.runtime.sendMessage({
          type: AUTOFILL_MSG.pendingSaveGet,
        })) as AutofillPendingSaveGetResponse;
      } catch {
        return;
      }
      if (response.status !== "ok") {
        return;
      }
      if (response.pending.interacted) {
        return;
      }
      await maybeOfferSave({
        username: response.pending.username,
        password: response.pending.password,
      });
    }

    function syncRenameDraftFromDom(): void {
      if (!shadow || !saveEditing) {
        return;
      }
      const input = shadow.querySelector("[data-rename-input]");
      if (input instanceof HTMLInputElement) {
        saveTitleDraft = input.value;
      }
    }

    async function hydrateSaveContext(): Promise<void> {
      try {
        const ctx = await fetchSaveContext();
        if (!pendingSave || ctx.status !== "ok") {
          return;
        }
        syncRenameDraftFromDom();
        saveWorkspaceName = ctx.workspaceName;
        saveVaults = ctx.vaults;
        if (!saveVaultId) {
          saveVaultId = ctx.defaultVaultId;
        }
        await paintOverlay();
      } catch {
        /* keep fallbacks */
      }
    }

    async function hydrateSavePromptIcon(creds: { username: string; password: string }): Promise<void> {
      try {
        const result = (await browser.runtime.sendMessage({
          type: AUTOFILL_MSG.siteIcon,
          websiteUrl: websiteUrl(),
        })) as AutofillSiteIconResponse;
        if (pendingSave !== creds || result.status !== "ok") {
          return;
        }
        syncRenameDraftFromDom();
        saveIconUrl = result.iconUrl;
        await paintOverlay();
      } catch {
        /* keep initials */
      }
    }

    function watchForOtp(itemId: string, totp: string | undefined): void {
      pendingTotpItemId = itemId;
      otpObserver?.disconnect();
      if (!totp) {
        return;
      }
      const tryFillOtp = () => {
        const fields = findLoginFields(document);
        if (fields.otp.length === 0) {
          return;
        }
        fillLoginFormAndMaybeSubmit(document, { username: "", password: "", totp });
        markFilledByOkkey();
        hideOverlay();
        otpObserver?.disconnect();
        otpObserver = null;
        pendingTotpItemId = null;
      };
      tryFillOtp();
      otpObserver = new MutationObserver(() => tryFillOtp());
      otpObserver.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        otpObserver?.disconnect();
        otpObserver = null;
      }, 30_000);
    }

    async function applyFillForItem(itemId: string): Promise<void> {
      const result = await fillItem(itemId);
      if (result.status !== "ok") {
        if (result.status === "locked") {
          void browser.runtime.sendMessage({ type: AUTOFILL_MSG.unlock });
        }
        return;
      }
      markFilledByOkkey();
      hideOverlay();
      const isLogin = !result.fill.categoryId || result.fill.categoryId === "login";
      if (isLogin) {
        const outcome = fillLoginFormAndMaybeSubmit(document, result.fill);
        if (outcome.submitted) {
          hideOverlay();
        }
        if (result.fill.totp) {
          const fields = findLoginFields(document);
          if (fields.otp.length === 0) {
            watchForOtp(itemId, result.fill.totp);
          } else {
            setTimeout(() => {
              submitLoginFormIfReady(document);
            }, 120);
          }
        }
        return;
      }
      const fillValues = {
        ...result.fill.values,
        ...(result.fill.username ? { username: result.fill.username, email: result.fill.username } : {}),
        ...(result.fill.password ? { password: result.fill.password } : {}),
      };
      const isCreditCard = result.fill.categoryId === "credit_card";
      fillAutofillValues(document, fillValues, {
        allowHiddenCreditCard: isCreditCard,
      });
      // Robokassa/GamePush: exp/cvc mount or become visible only after card number is set.
      if (isCreditCard) {
        stopCreditCardFillWatch?.();
        stopCreditCardFillWatch = watchAndFillAutofillValues(document, fillValues, {
          timeoutMs: 12_000,
          kinds: ["cc-number", "cc-exp", "cc-csc", "cc-name"],
        });
      }
    }

    async function confirmSave(): Promise<void> {
      if (!pendingSave) {
        return;
      }
      const creds = pendingSave;
      const title = saveTitleDraft.trim() || domainTitle();
      let result: AutofillSaveResponse;
      try {
        result = (await browser.runtime.sendMessage({
          type: AUTOFILL_MSG.save,
          pageUrl: pageUrl(),
          websiteUrl: websiteUrl(),
          title,
          username: creds.username,
          password: creds.password,
          vaultId: savePromptKind === "create" ? saveVaultId || undefined : undefined,
          itemId: savePromptKind === "update" ? pendingUpdateItemId || undefined : undefined,
        })) as AutofillSaveResponse;
      } catch (err: unknown) {
        console.error("[okkey] autofill save failed", err);
        return;
      }
      if (result.status === "locked") {
        showSavePrompt(creds, true, {
          kind: savePromptKind,
          itemId: pendingUpdateItemId || undefined,
          title: saveTitleDraft,
          iconUrl: saveIconUrl,
        });
        void browser.runtime.sendMessage({ type: AUTOFILL_MSG.unlock });
        return;
      }
      if (result.status === "ok" || result.status === "exists") {
        pendingSave = null;
        pendingUpdateItemId = null;
        savePromptKind = "create";
        saveIconUrl = undefined;
        void clearPendingSaveOffer();
        hideOverlay();
        return;
      }
      if (result.status === "signed-out") {
        pendingSave = null;
        pendingUpdateItemId = null;
        savePromptKind = "create";
        void clearPendingSaveOffer();
        hideOverlay();
        return;
      }
      if (result.status === "error") {
        console.error("[okkey] autofill save error", result.message);
      }
    }

    async function maybeOfferSave(creds: { username: string; password: string }): Promise<void> {
      if (wasFilledByOkkey()) {
        return;
      }
      let response: AutofillSaveOfferResponse;
      try {
        response = (await browser.runtime.sendMessage({
          type: AUTOFILL_MSG.saveOffer,
          pageUrl: pageUrl(),
          username: creds.username,
          password: creds.password,
        })) as AutofillSaveOfferResponse;
      } catch {
        return;
      }
      if (response.status === "signed-out") {
        void clearPendingSaveOffer();
        return;
      }
      if (response.status === "locked") {
        // Kind (save vs update) is resolved after unlock when secrets are available.
        showSavePrompt(creds, true, { kind: "create" });
        return;
      }
      if (response.status === "none") {
        pendingSave = null;
        pendingUpdateItemId = null;
        savePromptKind = "create";
        void clearPendingSaveOffer();
        if (overlayMode === "save" || overlayMode === "save-rename" || overlayMode === "unlock-save") {
          hideOverlay();
        }
        return;
      }
      if (response.status === "update") {
        showSavePrompt(creds, false, {
          kind: "update",
          itemId: response.itemId,
          title: response.title,
          iconUrl: response.iconUrl,
        });
        return;
      }
      showSavePrompt(creds, false, { kind: "create" });
    }

    function onCredentialsSubmitted(): void {
      suppressUnlockTooltipUntil = Date.now() + 12_000;
      if (overlayMode === "unlock-tooltip" || overlayMode === "list") {
        listOpen = false;
        overlayMode = "hidden";
        void paintOverlay({ showToggleOnly: true });
      }
      if (wasFilledByOkkey()) {
        return;
      }
      const creds = captureLoginCredentials(document);
      if (!creds) {
        return;
      }
      void persistPendingSaveOffer(creds);
      void maybeOfferSave(creds);
    }

    document.addEventListener(
      "focusin",
      (event) => {
        // Save prompt stays until X / successful save — page input focus must not dismiss it.
        if (
          pendingSave ||
          overlayMode === "save" ||
          overlayMode === "save-rename" ||
          overlayMode === "unlock-save"
        ) {
          return;
        }
        if (suggestionsSuppressed()) {
          hideOverlay();
          return;
        }
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !isVisibleFillableElement(target)) {
          return;
        }
        const kind = classifyAutofillInput(collectInputHints(target));
        if (!kind) {
          return;
        }
        suppressNativeAutocomplete(target, kind);
        window.clearTimeout(hideTimer);
        void showForInput(target);
      },
      true,
    );

    document.addEventListener(
      "focusout",
      () => {
        hideTimer = window.setTimeout(() => {
          if (pendingSave) {
            return;
          }
          if (overlayMode === "empty-tooltip") {
            return;
          }
          // Keep toggle while field may still be "active"; hide panels/tooltips on blur.
          listOpen = false;
          if (
            overlayMode === "list" ||
            overlayMode === "unlock-tooltip"
          ) {
            overlayMode = "hidden";
            void paintOverlay({ showToggleOnly: true });
            return;
          }
          hideOverlay();
        }, 180);
      },
      true,
    );

    document.addEventListener(
      "scroll",
      () => {
        if (overlayMode === "hidden" && !activeInput) {
          return;
        }
        if (pendingSave) {
          return;
        }
        if (overlayMode === "unlock-tooltip") {
          void paintOverlay();
          return;
        }
        void paintOverlay({
          showToggleOnly: overlayMode === "hidden" || overlayMode === "empty-tooltip",
        });
      },
      true,
    );

    window.addEventListener("resize", () => {
      if (host?.style.display === "block") {
        void paintOverlay();
      }
    });

    document.addEventListener(
      "pointerdown",
      (event) => {
        if (window !== window.top) {
          return;
        }
        const target = event.target;
        if (target instanceof Element) {
          if (host?.contains(target)) {
            return;
          }
          if (target.closest?.("[data-okkey-autofill]")) {
            return;
          }
        }
        void markDestinationInteracted();
      },
      true,
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (window !== window.top) {
          return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }
        // Ignore pure modifiers / navigation that often accompany redirects.
        if (
          event.key === "Shift" ||
          event.key === "Tab" ||
          event.key === "Escape" ||
          event.key === "Meta" ||
          event.key === "Control" ||
          event.key === "Alt"
        ) {
          return;
        }
        const target = event.target;
        if (target instanceof Element && host?.contains(target)) {
          return;
        }
        void markDestinationInteracted();
      },
      true,
    );

    document.addEventListener(
      "submit",
      () => {
        onCredentialsSubmitted();
      },
      true,
    );

    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const control = target.closest('button[type="submit"], input[type="submit"], button:not([type])');
        if (!control) {
          return;
        }
        setTimeout(() => onCredentialsSubmitted(), 0);
      },
      true,
    );

    browser.runtime.onMessage.addListener((message) => {
      if (!message || typeof message !== "object" || !("type" in message)) {
        return;
      }
      if (message.type === AUTOFILL_MSG.unlocked) {
        if (pendingSave) {
          void maybeOfferSave(pendingSave);
          return;
        }
        if (suggestionsSuppressed()) {
          return;
        }
        // Popup unlock steals focus — refresh from retained field, not activeElement.
        if (activeInput && document.contains(activeInput)) {
          try {
            activeInput.focus({ preventScroll: true });
          } catch {
            /* ignore */
          }
          void showForInput(activeInput);
        }
        return;
      }
      if (message.type === AUTOFILL_MSG.applyFill) {
        const itemId = (message as { itemId?: string }).itemId;
        if (typeof itemId === "string" && itemId) {
          void applyFillForItem(itemId);
        }
      }
    });

    if (pendingTotpItemId) {
      void pendingTotpItemId;
    }

    void restorePendingSaveOffer();

    let lastSeenUrl = pageUrl();
    const onPossibleNavigation = (): void => {
      const next = pageUrl();
      if (next === lastSeenUrl) {
        return;
      }
      lastSeenUrl = next;
      if (pendingSave) {
        // Keep local offer; re-paint after SPA redirect away from the login form.
        void maybeOfferSave(pendingSave);
        return;
      }
      void restorePendingSaveOffer();
    };
    window.addEventListener("popstate", onPossibleNavigation);
    window.addEventListener("pageshow", onPossibleNavigation);
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);
    history.pushState = (...args: Parameters<History["pushState"]>) => {
      originalPushState(...args);
      onPossibleNavigation();
    };
    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      originalReplaceState(...args);
      onPossibleNavigation();
    };
  },
});

import { defineContentScript } from "wxt/utils/define-content-script";
import { formatWebMessage } from "@okkey/i18n";

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
  type AutofillUpdateFieldKey,
} from "../lib/autofillMessages";
import {
  getSavePromptKeyFormHandle,
  mountSavePromptKeyForm,
  shadowExtensionCssText,
  unmountSavePromptKeyForm,
  type SavePromptKeyFormQuery,
} from "../components/save-prompt/mountSavePromptKeyForm";
import {
  autofillCategoryIconColor,
  autofillCategoryIconSvgHtml,
} from "../lib/autofillCategoryIcon";
import {
  interFontFaceCss,
  OVERLAY_FONT_STACK,
  overlayIconUrl,
} from "../lib/overlayAssets";
import { defaultOverlayThemeCss, resolveOverlayThemeCss } from "../lib/overlayTheme";
import {
  detectFormTypeForInput,
  detectFormTypeForRoot,
  isAuthCredentialSubmitControl,
  isSaveOfferFormType,
  isUsernameGeneratorField,
  shouldOpenPasswordGenerator,
  type AutofillFormType,
} from "../lib/autofillFormDetect";
import {
  applyGeneratorCopyButtonFeedback,
  createPasswordGeneratorState,
  createUsernameGeneratorState,
  GENERATOR_COPY_FEEDBACK_MS,
  generatorOverlayCss,
  generatorOverlayStrings,
  generatorPanelHtml,
  regenerateGeneratorState,
  syncGeneratorPanelDom,
  updatePasswordGeneratorSettings,
  updateUsernameGeneratorSettings,
  type GeneratorOverlayState,
} from "../lib/autofillGeneratorOverlay";
import { resolveFocusedAutofillKind } from "../lib/autofillFieldClassify";
import {
  captureFormPageUrl,
  websiteUrlForSaveOffer,
} from "../lib/autofillSaveUrls";
import {
  applyPageLocaleAddressFormat,
  captureLoginCredentials,
  classifyAutofillInput,
  suggestionFieldKindsForFocus,
  collectInputHints,
  collectPageFieldKinds,
  fillAutofillValues,
  fillInputValue,
  fillLoginFormAndMaybeSubmit,
  findLoginFields,
  isVisibleFillableElement,
  resolveAutofillAnchorInput,
  resolvePageAddressLocale,
  submitLoginFormIfReady,
  watchAndFillAutofillValues,
} from "../lib/loginFormFields";
import { isOkkeyWebAppOrigin } from "../lib/okkeyWebAppOrigin";
import { shouldFreezeOverlayUpdates } from "../lib/pageBlockingOverlayUi";

type OverlayMode =
  | "hidden"
  | "list"
  | "unlock-tooltip"
  | "empty-tooltip"
  | "save"
  | "save-form"
  | "unlock-save"
  | "password-generator"
  | "username-generator";

type SavePromptKind = "create" | "update";

/** Credentials + capture-time URLs for the save-login prompt (survives redirects). */
type PendingSaveCreds = {
  username: string;
  password: string;
  /** Form page URL at capture (`origin + pathname`). */
  captureUrl: string;
  /** Website to store on the item (login form URL, or origin/ for register). */
  websiteUrl: string;
  formType: AutofillFormType;
};

function msg(locale: "ru" | "en", key: string, fallback: string, values?: Record<string, string | number>): string {
  try {
    return formatWebMessage(locale, key, values);
  } catch {
    return fallback;
  }
}

function overlayStrings() {
  const ru = (navigator.language || "").toLowerCase().startsWith("ru");
  const locale = ru ? "ru" : "en";
  const usernameGeneratorCta = msg(
    locale,
    "extension.autofill.usernameGenerator",
    ru ? "Генератор логина" : "Username generator",
  );
  const emptyTooltip = msg(
    locale,
    "extension.autofill.noItems",
    ru ? "Нет элементов для автозаполнения" : "No items to autofill",
  );
  return ru
    ? {
        unlockCta: "Разблокировать Okkey",
        unlockTooltip: "Разблокируйте Okkey",
        saveTitle: msg(locale, "extension.autofill.saveTitle", "Сохранить учётную запись?"),
        updateTitle: msg(locale, "extension.autofill.updateTitle", "Обновить учётную запись"),
        saveUnlockBody: "Чтобы сохранить учётную запись, сначала нужно разблокировать Okkey.",
        updateUnlockBody: "Чтобы обновить учётную запись, сначала нужно разблокировать Okkey.",
        saveConfirm: msg(locale, "extension.autofill.saveConfirm", "Сохранить"),
        updateConfirm: msg(locale, "extension.autofill.updateConfirm", "Обновить"),
        updateFieldsTemplate: "Обновить: {fields}",
        fieldLogin: msg(locale, "web.keyForm.fieldLabels.login", "логин (емейл)"),
        fieldPassword: msg(locale, "web.keyForm.fieldLabels.password", "пароль"),
        fieldUrl: msg(locale, "web.keyForm.fieldLabels.url", "URL сайта"),
        emptyTooltip,
        workspaceFallback: "Workspace",
        vaultFallback: "Сейф",
        usernameGeneratorCta,
      }
    : {
        unlockCta: "Unlock Okkey",
        unlockTooltip: "Unlock Okkey",
        saveTitle: msg(locale, "extension.autofill.saveTitle", "Save this login?"),
        updateTitle: msg(locale, "extension.autofill.updateTitle", "Update account"),
        saveUnlockBody: "To save this login, unlock Okkey first.",
        updateUnlockBody: "To update this login, unlock Okkey first.",
        saveConfirm: msg(locale, "extension.autofill.saveConfirm", "Save"),
        updateConfirm: msg(locale, "extension.autofill.updateConfirm", "Update"),
        updateFieldsTemplate: "Update: {fields}",
        fieldLogin: msg(locale, "web.keyForm.fieldLabels.login", "login"),
        fieldPassword: msg(locale, "web.keyForm.fieldLabels.password", "password"),
        fieldUrl: msg(locale, "web.keyForm.fieldLabels.url", "website URL"),
        emptyTooltip,
        workspaceFallback: "Workspace",
        vaultFallback: "Vault",
        usernameGeneratorCta,
      };
}

function truncateWithEllipsis(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  if (maxLen <= 1) {
    return "…";
  }
  return `${text.slice(0, maxLen - 1).trimEnd()}…`;
}

function formatUpdateFieldsLine(
  keys: readonly AutofillUpdateFieldKey[],
  strings: ReturnType<typeof overlayStrings>,
): string {
  const labels = keys.map((key) => {
    if (key === "login") {
      return strings.fieldLogin;
    }
    if (key === "password") {
      return strings.fieldPassword;
    }
    return strings.fieldUrl;
  });
  const joined = labels.join(", ");
  const fields = truncateWithEllipsis(joined, 52);
  try {
    return formatWebMessage(
      (navigator.language || "").toLowerCase().startsWith("ru") ? "ru" : "en",
      "extension.autofill.updateFields",
      { fields },
    );
  } catch {
    return strings.updateFieldsTemplate.replace("{fields}", fields);
  }
}

/** Visual state of the in-field Okkey toggle (Figma 1215:4374). */
type AutofillToggleKind = "empty" | "locked" | "open" | "closed";

function pageUrl(): string {
  return captureFormPageUrl(location);
}

function domainTitleFromCapture(captureUrl: string): string {
  try {
    return new URL(captureUrl).hostname.replace(/^www\./i, "") || location.hostname;
  } catch {
    return location.hostname.replace(/^www\./i, "") || location.hostname;
  }
}

function domainTitle(): string {
  return location.hostname.replace(/^www\./i, "") || location.hostname;
}

function pendingOfferKey(creds: PendingSaveCreds): string {
  return `${creds.username}\n${creds.password}\n${creds.captureUrl}\n${creds.websiteUrl}`;
}

async function queryMatches(
  fieldKinds?: string[],
  formType?: AutofillFormType,
): Promise<AutofillQueryResponse> {
  return browser.runtime.sendMessage({
    type: AUTOFILL_MSG.query,
    pageUrl: pageUrl(),
    ...(fieldKinds && fieldKinds.length > 0 ? { fieldKinds } : {}),
    ...(formType ? { formType } : {}),
  });
}

async function fillItem(
  itemId: string,
  fillOverrides?: Record<string, string>,
): Promise<AutofillFillResponse> {
  return browser.runtime.sendMessage({
    type: AUTOFILL_MSG.fill,
    itemId,
    pageUrl: pageUrl(),
    ...(fillOverrides && Object.keys(fillOverrides).length > 0 ? { fillOverrides } : {}),
  });
}

async function fetchSaveContext(): Promise<AutofillSaveContextResponse> {
  return browser.runtime.sendMessage({ type: AUTOFILL_MSG.saveContext });
}

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  allFrames: true,
  runAt: "document_idle",
  main() {
    // Never paint autofill overlays on the Okkey vault web app — they close
    // Radix month/year Selects inside item edit datepickers (~1s query/paint).
    // Re-check at paint time too: dialog close can leave orphan toggles if the
    // early return was skipped by a stale build or odd local origin.
    if (isOkkeyWebAppOrigin()) {
      return;
    }

    const strings = overlayStrings();
    let host: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;
    let hideTimer = 0;
    let activeInput: HTMLInputElement | null = null;
    /** Skip save prompt shortly after Okkey filled credentials. */
    let filledByOkkeyUntil = 0;
    /** After login submit, do not auto-open unlock tooltip (noisy on OTP step). */
    let suppressUnlockTooltipUntil = 0;
    let pendingSave: PendingSaveCreds | null = null;
    /** Dedupe identical saveOffer while the prompt is already up (SPA redirect churn). */
    let lastSaveOfferKey: string | null = null;
    let pendingUpdateItemId: string | null = null;
    let pendingUpdateChangedFields: AutofillUpdateFieldKey[] = [];
    let savePromptKind: SavePromptKind = "create";
    let saveFormMounted = false;
    let pendingTotpItemId: string | null = null;
    let otpObserver: MutationObserver | null = null;
    let stopCreditCardFillWatch: (() => void) | null = null;
    let overlayMode: OverlayMode = "hidden";
    let listOpen = false;
    /** When true, suggestion list shows separator + «Генератор логина» CTA (register username). */
    let listOffersUsernameGenerator = false;
    let cachedSuggestions: AutofillSuggestion[] = [];
    let generatorState: GeneratorOverlayState | null = null;
    /** True while pointer is down on the generator length slider (custom drag). */
    let generatorSliderActive = false;
    /** Copy-success icon feedback deadline (survives panel remounts). */
    let generatorCopiedUntil = 0;
    let generatorCopyResetTimer = 0;
    /** Form type detected before autocomplete suppress (stable for the focused field). */
    let activeFormType: AutofillFormType = "unknown";
    /**
     * Last vault query outcome for the focused field — drives toggle chrome when the
     * dropdown is closed (empty round vs chevron-right vs lock).
     */
    let toggleVaultStatus: "unknown" | "locked" | "empty" | "ready" = "unknown";
    const genStrings = generatorOverlayStrings(
      (navigator.language || "").toLowerCase().startsWith("ru"),
    );

    function resolveToggleKind(): AutofillToggleKind {
      if (overlayMode === "unlock-tooltip" || toggleVaultStatus === "locked") {
        return "locked";
      }
      if (
        overlayMode === "list" ||
        overlayMode === "password-generator" ||
        overlayMode === "username-generator"
      ) {
        return "open";
      }
      if (overlayMode === "empty-tooltip" || toggleVaultStatus === "empty") {
        return "empty";
      }
      if (toggleVaultStatus === "ready") {
        return "closed";
      }
      // Before first query: show closed chevron so click can open / discover state.
      return "closed";
    }

    function keepPageFieldFocused(): void {
      if (!activeInput || !document.contains(activeInput)) {
        return;
      }
      if (document.activeElement === activeInput) {
        return;
      }
      try {
        activeInput.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }

    function isGeneratorOverlayOpen(): boolean {
      return (
        (overlayMode === "password-generator" || overlayMode === "username-generator") &&
        generatorState != null
      );
    }
    let saveTitleDraft = "";
    let saveVaults: AutofillSaveVaultOption[] = [];
    let saveWorkspaceName = "";
    let saveVaultId = "";
    let vaultMenuOpen = false;
    let saveIconUrl: string | undefined;
    /** True while site-icon preview is in flight — transparent tile, not initials. */
    let saveIconLoading = false;

    function markFilledByOkkey(): void {
      filledByOkkeyUntil = Date.now() + 15_000;
    }

    function clearFilledByOkkey(): void {
      filledByOkkeyUntil = 0;
    }

    function wasFilledByOkkey(): boolean {
      return Date.now() < filledByOkkeyUntil;
    }

    /** After fill: suppress auto-list only — toggle stays visible. */
    function suggestionsListSuppressed(): boolean {
      return wasFilledByOkkey();
    }

    let overlayWired = false;
    /** Cached theme CSS — avoid storage reads on every scroll/resize. */
    let cachedThemeCss = defaultOverlayThemeCss().cssVars;
    let themeCssResolved = false;
    /** Monotonic id so late autofill query results never paint after focus left / Select opened. */
    let overlayQueryGeneration = 0;
    /** Monotonic id so a stale async paint (e.g. post-fill showToggleOnly) cannot clobber a newer generator/list. */
    let overlayPaintGeneration = 0;
    /**
     * Sticky freeze while Radix Select / datepicker dropdown is open.
     * Debounced clear survives brief unmounts during floating-ui reposition (~Select close race).
     */
    let overlayUpdatesFrozen = false;
    let overlayFreezeClearTimer = 0;

    function refreshOverlayFreeze(): boolean {
      try {
        if (shouldFreezeOverlayUpdates()) {
          overlayUpdatesFrozen = true;
          window.clearTimeout(overlayFreezeClearTimer);
          overlayFreezeClearTimer = 0;
          return true;
        }
      } catch {
        /* ignore */
      }
      if (overlayUpdatesFrozen) {
        if (overlayFreezeClearTimer === 0) {
          overlayFreezeClearTimer = window.setTimeout(() => {
            overlayFreezeClearTimer = 0;
            try {
              if (!shouldFreezeOverlayUpdates()) {
                overlayUpdatesFrozen = false;
              }
            } catch {
              overlayUpdatesFrozen = false;
            }
          }, 320);
        }
        return true;
      }
      return false;
    }

    function isOverlayUpdateFrozen(): boolean {
      return refreshOverlayFreeze();
    }

    async function themeCssVars(): Promise<string> {
      if (themeCssResolved) {
        return cachedThemeCss;
      }
      try {
        const theme = await resolveOverlayThemeCss();
        cachedThemeCss = theme.cssVars;
        themeCssResolved = true;
        return cachedThemeCss;
      } catch {
        return cachedThemeCss;
      }
    }

    function ensureOverlay(): ShadowRoot {
      if (host && shadow) {
        return shadow;
      }
      host = document.createElement("div");
      host.setAttribute("data-okkey-autofill", "true");
      // Zero-size host: avoid a full-viewport layer that can disturb Radix Select /
      // DismissableLayer (pointer-events / focus / resize). Children use position:fixed.
      host.style.cssText =
        "all:initial;position:fixed;left:0;top:0;width:0;height:0;overflow:visible;z-index:2147483647;pointer-events:none;display:none;";
      shadow = host.attachShadow({ mode: "closed" });
      document.documentElement.appendChild(host);
      return shadow;
    }

    function clearGeneratorCopyFeedback(): void {
      generatorCopiedUntil = 0;
      window.clearTimeout(generatorCopyResetTimer);
      generatorCopyResetTimer = 0;
    }

    function hideOverlay(): void {
      overlayMode = "hidden";
      listOpen = false;
      listOffersUsernameGenerator = false;
      vaultMenuOpen = false;
      generatorState = null;
      generatorSliderActive = false;
      toggleVaultStatus = "unknown";
      clearGeneratorCopyFeedback();
      unmountSavePromptKeyForm();
      saveFormMounted = false;
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

    /**
     * Like isVisibleFillableElement, but ignores readOnly — suppressNativeAutocomplete
     * briefly sets readOnly on focus, which must not abort generator / overlay paint.
     */
    function isPageVisibleAutofillInput(el: HTMLInputElement): boolean {
      if (el.disabled) {
        return false;
      }
      const style = el.ownerDocument.defaultView?.getComputedStyle(el);
      if (style && (style.visibility === "hidden" || style.display === "none")) {
        return false;
      }
      return el.getClientRects().length > 0;
    }

    /** True when focus landed on the page shell (body/main) after dialog teardown. */
    function isNonFieldFocusTarget(el: Element | null): boolean {
      if (!el) {
        return true;
      }
      if (el === document.body || el === document.documentElement) {
        return true;
      }
      const tag = el.tagName;
      return tag === "MAIN" || tag === "BODY" || tag === "HTML";
    }

    /** Pierce open shadow roots — autofocus may land inside a custom element. */
    function deepActiveElement(root: Document | ShadowRoot = document): Element | null {
      let active: Element | null = root.activeElement;
      while (active instanceof Element) {
        const shadow = "shadowRoot" in active ? (active as HTMLElement).shadowRoot : null;
        if (shadow?.activeElement) {
          active = shadow.activeElement;
          continue;
        }
        break;
      }
      return active;
    }

    function isAutofillDropdownOpen(): boolean {
      return (
        listOpen ||
        overlayMode === "list" ||
        overlayMode === "password-generator" ||
        overlayMode === "username-generator" ||
        overlayMode === "unlock-tooltip" ||
        overlayMode === "empty-tooltip"
      );
    }

    function resolveFocusedAutofillInput(): HTMLInputElement | null {
      const focused = deepActiveElement();
      if (!(focused instanceof HTMLInputElement) || !isPageVisibleAutofillInput(focused)) {
        return null;
      }
      if (!classifyAutofillInput(collectInputHints(focused))) {
        return null;
      }
      return focused;
    }

    /**
     * Same path as focusin — used when the field is already focused before the
     * content script attaches (autofocus / restored focus) or after vault unlock.
     */
    function activateAutofillForInput(input: HTMLInputElement): void {
      if (isOkkeyWebAppOrigin()) {
        return;
      }
      if (
        pendingSave ||
        overlayMode === "save" ||
        overlayMode === "save-form" ||
        overlayMode === "unlock-save"
      ) {
        return;
      }
      if (isOverlayUpdateFrozen()) {
        return;
      }
      if (!isPageVisibleAutofillInput(input)) {
        return;
      }
      const kind = classifyAutofillInput(collectInputHints(input));
      if (!kind) {
        return;
      }
      activeFormType = resolveFormType(input);
      suppressNativeAutocomplete(input, kind);
      window.clearTimeout(hideTimer);
      if (input.value.trim().length === 0 && suggestionsListSuppressed()) {
        clearFilledByOkkey();
      }
      void showForInput(input, activeFormType);
    }

    /** If an autofill field already has focus, open suggestions/generator without waiting for focusin. */
    function bootstrapFocusedAutofillField(): void {
      if (isAutofillDropdownOpen()) {
        return;
      }
      const input = resolveFocusedAutofillInput();
      if (!input) {
        return;
      }
      activateAutofillForInput(input);
    }

    function clearActiveInputAndHide(): void {
      activeInput = null;
      hideOverlay();
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
          // Do not steal focus back from an open Select / datepicker dropdown.
          if (isOverlayUpdateFrozen()) {
            return;
          }
          if (document.activeElement !== input) {
            return;
          }
          try {
            input.focus({ preventScroll: true });
          } catch {
            /* ignore */
          }
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

    function panelBaseStyles(themeCssVars: string): string {
      return `
          ${interFontFaceCss()}
          ${generatorOverlayCss()}
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
          /* Edge-to-edge under suggestion rows (outside .list padding). */
          .list-sep {
            display: block;
            width: 100%;
            height: 1px;
            margin: 0;
            border: 0;
            background: hsla(var(--ok-fg) / 0.12);
          }
          button.list-gen-cta {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            min-height: 40px;
            margin: 0;
            padding: 10px 12px;
            border: 0;
            border-radius: 0;
            background: transparent;
            color: hsl(var(--ok-fg));
            font: inherit;
            font-size: 14px;
            font-weight: 500;
            line-height: 20px;
            cursor: pointer;
            appearance: none;
            outline: none;
            transition: background-color 150ms ease, box-shadow 150ms ease;
          }
          button.list-gen-cta:hover {
            background: hsl(var(--ok-hover));
          }
          button.list-gen-cta:focus,
          button.list-gen-cta:focus-visible {
            background: hsl(var(--ok-hover));
            box-shadow: inset 0 0 0 2px hsl(var(--ok-primary) / 0.4);
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
          .row-icon svg {
            width: 18px;
            height: 18px;
            display: block;
            color: #fff;
            flex-shrink: 0;
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
          /* Match packages/ui Button variant=default (primary) hover/focus/active/disabled. */
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
            box-shadow: none;
            outline: none;
            transition: color 150ms ease, background-color 150ms ease, box-shadow 150ms ease;
          }
          button.cta:hover {
            background: hsl(var(--ok-primary) / 0.85);
          }
          button.cta:active {
            background: hsl(var(--ok-primary));
            color: hsl(var(--ok-primary-fg));
          }
          button.cta:focus-visible {
            background: hsl(var(--ok-primary) / 0.85);
            box-shadow: 0 0 0 2px hsl(var(--ok-primary) / 0.4);
          }
          button.cta:disabled,
          button.cta[disabled] {
            opacity: 0.5;
            pointer-events: none;
            cursor: default;
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
            filter: brightness(0.9);
            background: hsl(var(--ok-edit-btn));
          }
          button.icon-btn:focus-visible {
            filter: brightness(0.9);
            background: hsl(var(--ok-edit-btn));
            box-shadow: 0 0 0 2px hsl(var(--ok-primary) / 0.4);
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
          .panel-save-form {
            max-height: min(720px, calc(100vh - 32px));
            /* Edge-to-edge sticky chrome; padding lives on header / scroll / footer. */
            padding: 0;
            gap: 0;
            /* Do not clip portaled vault menu; ScrollArea owns overflow for the body. */
            overflow: visible;
          }
          .panel-save-form .save-header,
          .panel-save-form .save-actions {
            position: relative;
            z-index: 10;
            flex: 0 0 auto;
            background: hsl(var(--ok-bg));
            transition: box-shadow 150ms ease;
          }
          .panel-save-form .save-header {
            padding: 16px 16px 12px;
          }
          .panel-save-form .save-actions {
            padding: 12px 16px 16px;
          }
          /* Match packages/ui popup sticky header/footer scroll shadows. */
          .panel-save-form .save-header[data-scroll-shadow] {
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }
          .panel-save-form .save-actions[data-scroll-shadow] {
            box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.1);
          }
          .panel-save-form .save-form-body {
            display: flex;
            flex-direction: column;
            flex: 1 1 auto;
            min-height: 0;
            max-height: min(560px, calc(100vh - 160px));
          }
          .panel-save-form [data-save-path] .vault-row {
            padding: 6px 8px 4px;
          }
          .panel-save-form [data-save-path] .update-fields {
            padding: 8px 12px 10px;
          }
          [data-key-form-portal] {
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 20;
            overflow: visible;
          }
          [data-key-form-portal] > * {
            pointer-events: auto;
          }
          .vault-menu-portal {
            position: absolute;
            z-index: 30;
          }
          .save-card .row {
            pointer-events: none;
            cursor: default;
            /*
             * Fixed height = padding 8+8 + title(20)+meta(18). Rename mode drops
             * meta but must not shrink the popup (align-items centers the input).
             */
            height: 54px;
            min-height: 54px;
            box-sizing: border-box;
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
            max-height: 32px;
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
          .update-fields {
            display: block;
            width: 100%;
            padding: 8px 16px 12px;
            font-size: 14px;
            font-weight: 400;
            line-height: 20px;
            color: hsl(var(--ok-muted));
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            box-sizing: border-box;
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
          button.vault-picker:hover,
          button.vault-picker:focus-visible,
          button.vault-picker[aria-expanded="true"],
          button.vault-picker[data-state="open"] {
            background: hsl(var(--ok-hover));
          }
          /* Match packages/ui SelectTrigger open/focus primary ring. */
          button.vault-picker:focus-visible,
          button.vault-picker[aria-expanded="true"],
          button.vault-picker[data-state="open"] {
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
          /* Figma 1215:4374 — 24×24 mark; 42×24 pill when lock/chevron present. */
          .toggle {
            pointer-events: auto;
            position: fixed;
            box-sizing: border-box;
            height: 24px;
            width: 24px;
            padding: 0;
            margin: 0;
            border: 0;
            border-radius: 12px;
            background: transparent;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            appearance: none;
            z-index: 2;
            outline: none;
          }
          .toggle.toggle-pill {
            width: 42px;
            height: 22px;
            border-radius: 11px;
            background: #f1f5f9;
            border: 1px solid #b1b8bd;
            box-shadow: none;
          }
          .toggle-side {
            position: absolute;
            left: 2px;
            top: 50%;
            transform: translateY(-50%);
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
          }
          .toggle-side img {
            width: 16px;
            height: 16px;
            display: block;
          }
          .toggle-side img.toggle-lock {
            width: 12px;
            height: 12px;
          }
          .toggle-chevron {
            transition: transform 180ms ease;
            transform: rotate(-90deg); /* right when closed */
          }
          .toggle.toggle-open .toggle-chevron {
            transform: rotate(0deg); /* down when open */
          }
          .toggle-mark {
            position: absolute;
            right: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 22px;
            height: 22px;
            border-radius: 40px;
            border: 1px solid #f1f5f9;
            background: hsl(var(--ok-primary));
            box-shadow: 0 0 0 1px #b1b8bd;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .toggle:not(.toggle-pill) .toggle-mark {
            right: auto;
            left: 0;
            width: 24px;
            height: 24px;
            border: 1px solid #fff;
            box-shadow:
              0 0 0 1px rgba(0,0,0,0.08),
              0 1px 3px rgba(0,0,0,0.1);
          }
          .toggle-mark img {
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

    /**
     * Match web `Favicon`: real image → transparent tile; colored monogram only when
     * there is no image (or the image fails to load). While a preview is in flight,
     * keep a transparent tile (same as list/form) — never flash initials.
     */
    function rowIconHtml(input: {
      title: string;
      iconUrl?: string;
      iconPending?: boolean;
      categoryId?: string;
    }): string {
      const letters = monogram(input.title);
      const fallbackBg = monogramBackground(letters);
      const categorySvg = input.categoryId
        ? autofillCategoryIconSvgHtml(input.categoryId)
        : null;
      const categoryColor = input.categoryId
        ? autofillCategoryIconColor(input.categoryId)
        : null;
      if (categorySvg && categoryColor) {
        return `<span class="row-icon" style="background:${categoryColor}">${categorySvg}</span>`;
      }
      if (input.iconUrl) {
        // Transparent tile while image loads (web Favicon); colored monogram only on error.
        return `<span class="row-icon" style="background:transparent" data-icon-fallback="${escapeHtml(letters)}" data-icon-fallback-bg="${escapeHtml(fallbackBg)}"><img src="${escapeHtml(input.iconUrl)}" alt="" data-row-favicon="1" /></span>`;
      }
      if (input.iconPending) {
        return `<span class="row-icon" style="background:transparent" data-icon-fallback="${escapeHtml(letters)}" data-icon-fallback-bg="${escapeHtml(fallbackBg)}" data-icon-pending="1"></span>`;
      }
      return `<span class="row-icon" style="background:${fallbackBg}">${escapeHtml(letters)}</span>`;
    }

    function applyRowIconFallback(tile: HTMLElement): void {
      const letters = tile.getAttribute("data-icon-fallback") || "?";
      const bg = tile.getAttribute("data-icon-fallback-bg") || "#64748b";
      tile.style.background = bg;
      tile.textContent = letters;
    }

    function wireRowFaviconFallbacks(rootEl: ParentNode): void {
      for (const img of rootEl.querySelectorAll<HTMLImageElement>("img[data-row-favicon]")) {
        if (img.dataset.faviconWired === "1") {
          continue;
        }
        img.dataset.faviconWired = "1";
        const applyFallback = () => {
          const tile = img.parentElement;
          if (!(tile instanceof HTMLElement) || !tile.classList.contains("row-icon")) {
            return;
          }
          applyRowIconFallback(tile);
        };
        img.addEventListener("error", applyFallback);
        // Cached broken images may already be in error state before the listener attaches.
        if (img.complete && img.naturalWidth === 0) {
          applyFallback();
        }
      }
    }

    /**
     * Page CSP often blocks `data:` / `blob:` on `<img>` in the content overlay.
     * Decode via fetch + canvas so the save/list tiles match the vault favicon image.
     */
    function materializeRowFaviconDataUrls(rootEl: ParentNode): void {
      for (const img of rootEl.querySelectorAll<HTMLImageElement>("img[data-row-favicon]")) {
        const src = img.getAttribute("src") || "";
        if (!src.startsWith("data:") && !src.startsWith("blob:")) {
          continue;
        }
        if (img.dataset.faviconMaterialized === "1") {
          continue;
        }
        img.dataset.faviconMaterialized = "1";
        const tile = img.parentElement;
        if (!(tile instanceof HTMLElement) || !tile.classList.contains("row-icon")) {
          continue;
        }
        void (async () => {
          try {
            const response = await fetch(src);
            if (!response.ok) {
              throw new Error("favicon fetch failed");
            }
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);
            if (!tile.isConnected || !img.isConnected) {
              bitmap.close();
              return;
            }
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            canvas.setAttribute("aria-hidden", "true");
            canvas.style.width = "100%";
            canvas.style.height = "100%";
            canvas.style.display = "block";
            canvas.style.objectFit = "cover";
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              bitmap.close();
              throw new Error("no 2d context");
            }
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            tile.style.background = "transparent";
            img.replaceWith(canvas);
          } catch {
            if (tile.isConnected) {
              applyRowIconFallback(tile);
            }
          }
        })();
      }
    }

    function suggestionRowHtml(item: AutofillSuggestion): string {
      const meta = item.username
        ? `<span class="row-meta">${escapeHtml(item.username)}</span>`
        : "";
      const suggestionKey = item.suggestionKey || item.itemId;
      return `<button type="button" class="row" data-item="${escapeHtml(item.itemId)}" data-suggestion-key="${escapeHtml(suggestionKey)}">
              ${rowIconHtml({ title: item.title, iconUrl: item.iconUrl, categoryId: item.categoryId })}
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
      iconPending?: boolean;
    }): string {
      const icon = rowIconHtml({
        title: input.title,
        iconUrl: input.iconUrl,
        iconPending: input.iconPending,
      });
      const meta = input.username
        ? `<span class="row-meta">${escapeHtml(input.username)}</span>`
        : "";
      return `<div class="row">
              ${icon}
              <span class="row-text">
                <span class="row-title">${escapeHtml(input.title)}</span>
                ${meta}
              </span>
              <button type="button" class="icon-btn" data-open-key-form="1" aria-label="Edit">
                <img src="${escapeHtml(overlayIconUrl("tabler-pencil"))}" alt="" />
              </button>
            </div>`;
    }

    function selectedVault(): AutofillSaveVaultOption | undefined {
      return saveVaults.find((vault) => vault.vaultId === saveVaultId) ?? saveVaults[0];
    }

    function vaultMenuOptionsHtml(): string {
      const selectedId = selectedVault()?.vaultId ?? saveVaultId;
      return saveVaults
        .map((option) => {
          const selected = option.vaultId === selectedId;
          return `<button type="button" role="option" data-vault-id="${escapeHtml(option.vaultId)}" aria-selected="${selected ? "true" : "false"}">
                   <span>${escapeHtml(option.icon || "💼")}</span>
                   <span>${escapeHtml(option.name)}</span>
                 </button>`;
        })
        .join("");
    }

    function vaultPickerHtml(opts?: { menuInPortal?: boolean }): string {
      const vault = selectedVault();
      const icon = vault?.icon || "💼";
      const name = vault?.name || strings.vaultFallback;
      const menuInPortal = Boolean(opts?.menuInPortal);
      const menu =
        vaultMenuOpen && !menuInPortal
          ? `<div class="vault-menu" role="listbox">${vaultMenuOptionsHtml()}</div>`
          : "";
      return `<div class="vault-row">
        <span class="vault-ws">${escapeHtml(saveWorkspaceName || strings.workspaceFallback)}</span>
        <span class="vault-arrow">→</span>
        <button type="button" class="vault-picker" data-vault-toggle="1" aria-expanded="${vaultMenuOpen ? "true" : "false"}" data-state="${vaultMenuOpen ? "open" : "closed"}">
          <span>${escapeHtml(icon)}</span>
          <span class="vault-name">${escapeHtml(name)}</span>
          <img class="chevron" src="${escapeHtml(overlayIconUrl("lucide-chevron-down"))}" alt="" />
        </button>
        ${menu}
      </div>`;
    }

    function savePathSecondaryHtml(isUpdate: boolean, formMode = false): string {
      if (isUpdate) {
        const fields = `<span class="update-fields">${escapeHtml(
          formatUpdateFieldsLine(
            pendingUpdateChangedFields.length > 0
              ? pendingUpdateChangedFields
              : (["login", "password"] as AutofillUpdateFieldKey[]),
            strings,
          ),
        )}</span>`;
        // Form mode: gray breadcrumbs container has no border-top divider.
        return formMode ? fields : `<hr class="save-divider" />${fields}`;
      }
      const picker = vaultPickerHtml({ menuInPortal: formMode });
      return formMode ? picker : `<hr class="save-divider" />${picker}`;
    }

    function savePanelHtml(locked: boolean, formMode = false): string {
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
      if (formMode) {
        return `<div class="panel panel-save panel-save-form">
          <div class="save-header">
            <img class="logo" src="${escapeHtml(overlayIconUrl("okkey-logo"))}" alt="" />
            <span class="save-title">${escapeHtml(titleText)}</span>
            <span class="spacer"></span>
            <button type="button" class="close-btn" data-save-cancel="1" aria-label="Close">
              <img src="${escapeHtml(overlayIconUrl("lucide-x"))}" alt="" />
            </button>
          </div>
          <div class="save-form-body" data-key-form-root></div>
          <div class="save-actions">
            <button type="button" class="cta" data-save-confirm="1">${escapeHtml(confirmText)}</button>
          </div>
          <div data-key-form-portal></div>
        </div>`;
      }
      const secondaryBlock = savePathSecondaryHtml(isUpdate, false);
      const title = saveTitleDraft || domainTitle();
      const preview = previewRowHtml({
        title,
        username: pendingSave?.username ?? "",
        iconUrl: saveIconUrl,
        iconPending: saveIconLoading && !saveIconUrl,
      });
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
          <div data-save-path>${secondaryBlock}</div>
        </div>
        <div class="save-actions">
          <button type="button" class="cta" data-save-confirm="1">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    }

    function listHtml(suggestions: AutofillSuggestion[]): string {
      const rows = suggestions.map((item) => suggestionRowHtml(item)).join("");
      const generatorFooter = listOffersUsernameGenerator
        ? `<hr class="list-sep" role="separator" />
           <button type="button" class="list-gen-cta" data-open-username-generator="1">${escapeHtml(strings.usernameGeneratorCta)}</button>`
        : "";
      // Separator + CTA sit outside `.list` padding so they run edge-to-edge on the panel.
      return `<div class="panel"><div class="list">${rows}</div>${generatorFooter}</div>`;
    }

    function toggleAnchorInput(input: HTMLInputElement): HTMLInputElement {
      return resolveAutofillAnchorInput(input);
    }

    function toggleRectForInput(
      input: HTMLElement,
      kind: AutofillToggleKind = resolveToggleKind(),
    ): { left: number; top: number; width: number; height: number } | null {
      if (!document.contains(input)) {
        return null;
      }
      const rect = input.getBoundingClientRect();
      // Detached / closing dialog nodes often report 0×0 or sit at viewport center
      // briefly — never paint an orphan toggle from those coords.
      if (rect.width < 2 || rect.height < 2) {
        return null;
      }
      if (
        rect.bottom < 0 ||
        rect.right < 0 ||
        rect.top > window.innerHeight ||
        rect.left > window.innerWidth
      ) {
        return null;
      }
      const height = kind === "empty" ? 24 : 22;
      const width = kind === "empty" ? 24 : 42;
      return {
        left: Math.max(4, rect.right - width - 8),
        top: rect.top + (rect.height - height) / 2,
        width,
        height,
      };
    }

    function toggleButtonHtml(
      kind: AutofillToggleKind,
      pos: { left: number; top: number },
      /** When set, paint chevron at this rotate state first (for open↔closed CSS transition). */
      chevronFrom?: "open" | "closed",
    ): string {
      const mark = `<span class="toggle-mark"><img src="${escapeHtml(overlayIconUrl("okkey-mark"))}" alt="" /></span>`;
      if (kind === "empty") {
        return `<button type="button" class="toggle toggle-empty" data-toggle="1" data-toggle-kind="empty" style="left:${pos.left}px;top:${pos.top}px" aria-label="Okkey">${mark}</button>`;
      }
      const chevronKind = chevronFrom ?? (kind === "open" ? "open" : "closed");
      const openClass = chevronKind === "open" ? " toggle-open" : "";
      const sideImg =
        kind === "locked"
          ? `<img class="toggle-lock" src="${escapeHtml(overlayIconUrl("lucide-lock"))}" alt="" />`
          : `<img class="toggle-chevron" src="${escapeHtml(overlayIconUrl("lucide-chevron-down"))}" alt="" />`;
      return `<button type="button" class="toggle toggle-pill${openClass}" data-toggle="1" data-toggle-kind="${kind}" style="left:${pos.left}px;top:${pos.top}px" aria-label="Okkey" aria-expanded="${kind === "open" ? "true" : "false"}">
        <span class="toggle-side">${sideImg}</span>
        ${mark}
      </button>`;
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
        // Panel / toggle clicks must not steal focus from the page autofill field.
        // Length slider uses custom pointer drag (also preventDefault) so the page input keeps focus.
        // Inline save key-form needs real focus on its inputs / menus.
        if (
          target.closest(
            "textarea, input, select, [contenteditable='true'], [data-key-form-root], [data-key-form-portal]",
          )
        ) {
          window.clearTimeout(hideTimer);
          return;
        }
        if (target.closest(".panel, .toggle, .tooltip")) {
          window.clearTimeout(hideTimer);
          event.preventDefault();
          if (isGeneratorOverlayOpen()) {
            keepPageFieldFocused();
          }
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
        if (target.closest("[data-open-username-generator]")) {
          window.clearTimeout(hideTimer);
          listOffersUsernameGenerator = false;
          openGeneratorForField("username");
          keepPageFieldFocused();
          return;
        }
        if (target.closest("[data-unlock]")) {
          void browser.runtime.sendMessage({ type: AUTOFILL_MSG.unlock });
          return;
        }
        if (target.closest("[data-save-cancel]")) {
          pendingSave = null;
          lastSaveOfferKey = null;
          pendingUpdateItemId = null;
          pendingUpdateChangedFields = [];
          savePromptKind = "create";
          closeSaveKeyForm();
          // Dismiss must survive redirect — do not restore on the next page.
          void dismissPendingSaveOffer();
          hideOverlay();
          return;
        }
        if (target.closest("[data-save-confirm]")) {
          if (overlayMode === "save-form") {
            void confirmSaveForm();
            return;
          }
          void confirmSave();
          return;
        }
        if (target.closest("[data-open-key-form]")) {
          openSaveKeyForm();
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
        // Click empty space in the save panel closes vault dropdown without applying a choice.
        if (vaultMenuOpen && target.closest(".panel-save") && !target.closest(".vault-menu")) {
          vaultMenuOpen = false;
          void paintOverlay();
          return;
        }
        const row = target.closest("[data-item]");
        if (row instanceof HTMLElement && row.dataset.item) {
          const key = row.dataset.suggestionKey;
          const match =
            (key
              ? cachedSuggestions.find((s) => (s.suggestionKey || s.itemId) === key)
              : undefined) ?? cachedSuggestions.find((s) => s.itemId === row.dataset.item);
          void applyFillForItem(row.dataset.item, match?.fillOverrides).then(() => {
            listOpen = false;
            listOffersUsernameGenerator = false;
            overlayMode = "hidden";
            void paintOverlay({ showToggleOnly: true });
          });
        }
      });
    }

    function insertGeneratedValue(value: string): void {
      if (!activeInput || !value) {
        return;
      }
      const kind = classifyAutofillInput(collectInputHints(activeInput));
      fillInputValue(activeInput, value);
      // Register: fill empty password + confirm/repeat with the same generated password.
      if (kind === "password") {
        const fields = findLoginFields(activeInput.form ?? document);
        for (const el of fields.password) {
          if (el === activeInput) {
            continue;
          }
          if (el.value.trim().length > 0) {
            continue;
          }
          fillInputValue(el, value);
        }
      }
      markFilledByOkkey();
      generatorState = null;
      clearGeneratorCopyFeedback();
      listOpen = false;
      overlayMode = "hidden";
      void paintOverlay({ showToggleOnly: true });
    }

    function wireGeneratorPanel(root: ShadowRoot): void {
      const panel = root.querySelector("[data-generator]");
      if (!(panel instanceof HTMLElement) || !generatorState) {
        return;
      }

      const copyBtn = panel.querySelector("[data-gen-copy]");
      if (copyBtn instanceof HTMLElement) {
        const remainingMs = generatorCopiedUntil - Date.now();
        if (remainingMs > 0) {
          applyGeneratorCopyButtonFeedback(copyBtn, true, genStrings);
          window.clearTimeout(generatorCopyResetTimer);
          generatorCopyResetTimer = window.setTimeout(() => {
            generatorCopiedUntil = 0;
            generatorCopyResetTimer = 0;
            const live = root.querySelector("[data-gen-copy]");
            if (live instanceof HTMLElement) {
              applyGeneratorCopyButtonFeedback(live, false, genStrings);
            }
            keepPageFieldFocused();
          }, remainingMs);
        }

        copyBtn.onclick = () => {
          window.clearTimeout(hideTimer);
          if (!generatorState?.value) {
            return;
          }
          const value = generatorState.value;
          void navigator.clipboard.writeText(value).catch(() => {
            /* ignore */
          });
          applyGeneratorCopyButtonFeedback(copyBtn, true, genStrings);
          window.clearTimeout(generatorCopyResetTimer);
          generatorCopiedUntil = Date.now() + GENERATOR_COPY_FEEDBACK_MS;
          generatorCopyResetTimer = window.setTimeout(() => {
            generatorCopiedUntil = 0;
            generatorCopyResetTimer = 0;
            const live = root.querySelector("[data-gen-copy]");
            if (live instanceof HTMLElement) {
              applyGeneratorCopyButtonFeedback(live, false, genStrings);
            }
            keepPageFieldFocused();
          }, GENERATOR_COPY_FEEDBACK_MS);
          keepPageFieldFocused();
        };
      }

      const regen = panel.querySelector("[data-gen-regen]");
      if (regen instanceof HTMLElement) {
        regen.onclick = () => {
          window.clearTimeout(hideTimer);
          if (!generatorState) {
            return;
          }
          generatorState = regenerateGeneratorState(generatorState);
          void paintOverlay().then(() => keepPageFieldFocused());
        };
      }

      const cancel = panel.querySelector("[data-gen-cancel]");
      if (cancel instanceof HTMLElement) {
        cancel.onclick = () => {
          generatorState = null;
          clearGeneratorCopyFeedback();
          listOpen = false;
          overlayMode = "hidden";
          void paintOverlay({ showToggleOnly: true });
        };
      }

      const insert = panel.querySelector("[data-gen-insert]");
      if (insert instanceof HTMLElement) {
        insert.onclick = () => {
          if (!generatorState) {
            return;
          }
          insertGeneratedValue(generatorState.value);
        };
      }

      for (const checkbox of panel.querySelectorAll<HTMLInputElement>("[data-gen-setting]")) {
        checkbox.onchange = () => {
          window.clearTimeout(hideTimer);
          if (!generatorState) {
            return;
          }
          const key = checkbox.dataset.genSetting;
          if (!key) {
            return;
          }
          if (generatorState.kind === "password") {
            generatorState = updatePasswordGeneratorSettings(generatorState, {
              [key]: checkbox.checked,
            });
          } else {
            generatorState = updateUsernameGeneratorSettings(generatorState, {
              [key]: checkbox.checked,
            });
          }
          void paintOverlay().then(() => keepPageFieldFocused());
        };
      }

      const lengthInput = panel.querySelector<HTMLInputElement>("[data-gen-length]");
      if (lengthInput && generatorState.kind === "password") {
        const applyLengthFromInput = () => {
          window.clearTimeout(hideTimer);
          if (!generatorState || generatorState.kind !== "password") {
            return;
          }
          const nextLength = Number(lengthInput.value);
          if (!Number.isFinite(nextLength) || nextLength === generatorState.preferences.length) {
            syncGeneratorPanelDom(panel, generatorState, genStrings);
            return;
          }
          // Update state + live DOM only — remounting via paintOverlay kills range drag.
          generatorState = updatePasswordGeneratorSettings(generatorState, {
            length: nextLength,
          });
          syncGeneratorPanelDom(panel, generatorState, genStrings);
        };

        const setLengthFromClientX = (clientX: number) => {
          const rect = lengthInput.getBoundingClientRect();
          if (rect.width <= 0) {
            return;
          }
          const min = Number(lengthInput.min);
          const max = Number(lengthInput.max);
          const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
          const next = Math.round(min + ratio * (max - min));
          lengthInput.value = String(next);
          applyLengthFromInput();
        };

        const endSliderDrag = () => {
          if (!generatorSliderActive) {
            return;
          }
          generatorSliderActive = false;
          keepPageFieldFocused();
        };

        // Custom pointer drag: mousedown preventDefault keeps focus on the page field,
        // so native range drag cannot run — we map pointer X → value ourselves.
        lengthInput.onpointerdown = (event) => {
          if (event.button !== 0) {
            return;
          }
          window.clearTimeout(hideTimer);
          generatorSliderActive = true;
          try {
            lengthInput.setPointerCapture(event.pointerId);
          } catch {
            /* ignore */
          }
          setLengthFromClientX(event.clientX);
          keepPageFieldFocused();
        };
        lengthInput.onpointermove = (event) => {
          if (!generatorSliderActive) {
            return;
          }
          setLengthFromClientX(event.clientX);
        };
        lengthInput.onpointerup = endSliderDrag;
        lengthInput.onpointercancel = endSliderDrag;
        // Keyboard / a11y still use native input events (no remount).
        lengthInput.oninput = applyLengthFromInput;
        lengthInput.onchange = () => {
          applyLengthFromInput();
          keepPageFieldFocused();
        };
      }

      keepPageFieldFocused();
    }

    function openGeneratorForField(
      kind: "password" | "username",
    ): void {
      generatorState =
        kind === "password" ? createPasswordGeneratorState() : createUsernameGeneratorState();
      cachedSuggestions = [];
      listOpen = false;
      listOffersUsernameGenerator = false;
      toggleVaultStatus = "ready";
      overlayMode = kind === "password" ? "password-generator" : "username-generator";
      void paintOverlay();
    }

    function closeSaveKeyForm(): void {
      unmountSavePromptKeyForm();
      saveFormMounted = false;
      if (overlayMode === "save-form") {
        overlayMode = pendingSave ? "save" : "hidden";
      }
    }

    function currentSaveFormQuery(): SavePromptKeyFormQuery | null {
      if (!pendingSave) {
        return null;
      }
      return {
        kind: savePromptKind,
        title: saveTitleDraft || domainTitleFromCapture(pendingSave.captureUrl),
        username: pendingSave.username,
        password: pendingSave.password,
        websiteUrl: pendingSave.websiteUrl,
        ...(savePromptKind === "create" && saveVaultId ? { vaultId: saveVaultId } : {}),
        ...(savePromptKind === "update" && pendingUpdateItemId
          ? { itemId: pendingUpdateItemId }
          : {}),
      };
    }

    function onSaveFormSaved(): void {
      closeSaveKeyForm();
      pendingSave = null;
      lastSaveOfferKey = null;
      pendingUpdateItemId = null;
      pendingUpdateChangedFields = [];
      savePromptKind = "create";
      saveIconUrl = undefined;
      saveIconLoading = false;
      void clearPendingSaveOffer();
      hideOverlay();
    }

    function onSaveFormLocked(): void {
      void browser.runtime.sendMessage({ type: AUTOFILL_MSG.unlock });
    }

    function clearFormVaultMenuPortal(root: ShadowRoot): void {
      const portal = root.querySelector("[data-key-form-portal]");
      if (!(portal instanceof HTMLElement)) {
        return;
      }
      for (const el of portal.querySelectorAll("[data-vault-menu-portal='1']")) {
        el.remove();
      }
    }

    /** Vault dropdown must live outside ScrollArea so it is not clipped. */
    function syncFormVaultMenuPortal(root: ShadowRoot): void {
      clearFormVaultMenuPortal(root);
      if (!vaultMenuOpen || overlayMode !== "save-form") {
        return;
      }
      const portal = root.querySelector("[data-key-form-portal]");
      const picker = root.querySelector("[data-vault-toggle]");
      const panel = root.querySelector(".panel-save-form");
      if (
        !(portal instanceof HTMLElement) ||
        !(picker instanceof HTMLElement) ||
        !(panel instanceof HTMLElement)
      ) {
        return;
      }
      const panelRect = panel.getBoundingClientRect();
      const pickerRect = picker.getBoundingClientRect();
      const menu = document.createElement("div");
      menu.className = "vault-menu vault-menu-portal";
      menu.setAttribute("role", "listbox");
      menu.setAttribute("data-vault-menu-portal", "1");
      menu.style.top = `${Math.max(0, pickerRect.bottom - panelRect.top - 2)}px`;
      menu.style.left = "16px";
      menu.style.right = "16px";
      menu.innerHTML = vaultMenuOptionsHtml();
      portal.appendChild(menu);
    }

    function refreshSaveFormPath(root: ShadowRoot): void {
      const pathEl = root.querySelector("[data-save-path]");
      if (pathEl instanceof HTMLElement) {
        pathEl.innerHTML = savePathSecondaryHtml(savePromptKind === "update", true);
      }
      syncFormVaultMenuPortal(root);
    }

    function mountSaveKeyFormIntoPanel(root: ShadowRoot): void {
      const query = currentSaveFormQuery();
      const mountEl = root.querySelector("[data-key-form-root]");
      if (!query || !(mountEl instanceof HTMLElement)) {
        return;
      }
      const portalEl = root.querySelector("[data-key-form-portal]");
      mountSavePromptKeyForm(mountEl, {
        query,
        iconUrl: saveIconUrl,
        getVaultId: () => saveVaultId || query.vaultId,
        portalContainer: portalEl instanceof HTMLElement ? portalEl : null,
        onPathHostReady: () => refreshSaveFormPath(root),
        onScrollBody: () => {
          if (!vaultMenuOpen) {
            return;
          }
          vaultMenuOpen = false;
          refreshSaveFormPath(root);
        },
        onSaved: onSaveFormSaved,
        onLocked: onSaveFormLocked,
      });
      saveFormMounted = true;
      refreshSaveFormPath(root);
    }

    function openSaveKeyForm(): void {
      if (!pendingSave) {
        return;
      }
      vaultMenuOpen = false;
      overlayMode = "save-form";
      void paintOverlay();
    }

    async function confirmSaveForm(): Promise<void> {
      const handle = getSavePromptKeyFormHandle();
      if (!handle) {
        return;
      }
      await handle.submit();
    }

    function updateSaveFormPathDom(root: ShadowRoot): void {
      refreshSaveFormPath(root);
    }

    async function paintOverlay(opts?: { showToggleOnly?: boolean }): Promise<void> {
      const paintGen = ++overlayPaintGeneration;
      try {
        // Defense in depth: never paint on Okkey web even if main() early-return was skipped.
        if (isOkkeyWebAppOrigin()) {
          clearActiveInputAndHide();
          return;
        }
        // Full no-op while Select / datepicker dropdown is open — late paint after a
        // slow autofill query (~1s) closes them via focus/resize/DismissableLayer.
        if (isOverlayUpdateFrozen() && !pendingSave) {
          return;
        }
        const root = ensureOverlay();
        if (!host) {
          return;
        }
        const cssVars = await themeCssVars();
        // A newer paintOverlay started while we awaited theme — drop this stale paint.
        if (paintGen !== overlayPaintGeneration) {
          return;
        }
        if (isOverlayUpdateFrozen() && !pendingSave) {
          return;
        }
        if (isOkkeyWebAppOrigin()) {
          clearActiveInputAndHide();
          return;
        }
        // Stale post-fill / blur `showToggleOnly` must not wipe an open generator panel.
        const generatorOpen =
          (overlayMode === "password-generator" || overlayMode === "username-generator") &&
          generatorState != null;
        const showToggleOnly = Boolean(opts?.showToggleOnly) && !generatorOpen;
        const toggleKind = resolveToggleKind();
        const anchorInput =
          activeInput && document.contains(activeInput) ? toggleAnchorInput(activeInput) : null;
        const togglePos = anchorInput ? toggleRectForInput(anchorInput, toggleKind) : null;
        // After dialog close, activeInput may still be set but no longer a valid anchor —
        // drop the orphan instead of leaving a floating toggle (often at prior center coords).
        if (
          !pendingSave &&
          showToggleOnly &&
          overlayMode === "hidden" &&
          (!anchorInput || !togglePos)
        ) {
          clearActiveInputAndHide();
          return;
        }
        const showToggle = Boolean(togglePos && !pendingSave && overlayMode !== "unlock-save");

        let panelMarkup = "";
        const allowListPanel =
          overlayMode === "list" &&
          cachedSuggestions.length > 0 &&
          !showToggleOnly &&
          !isOverlayUpdateFrozen();
        const allowGeneratorPanel = generatorOpen && !showToggleOnly && !isOverlayUpdateFrozen();
        if (allowListPanel) {
          panelMarkup = listHtml(cachedSuggestions);
        } else if (allowGeneratorPanel && generatorState) {
          panelMarkup = generatorPanelHtml(generatorState, genStrings);
        } else if (overlayMode === "save") {
          if (saveFormMounted) {
            unmountSavePromptKeyForm();
            saveFormMounted = false;
          }
          panelMarkup = savePanelHtml(false);
        } else if (overlayMode === "unlock-save") {
          if (saveFormMounted) {
            unmountSavePromptKeyForm();
            saveFormMounted = false;
          }
          panelMarkup = savePanelHtml(true);
        } else if (overlayMode === "save-form") {
          panelMarkup = savePanelHtml(false, true);
        } else if (saveFormMounted) {
          unmountSavePromptKeyForm();
          saveFormMounted = false;
        }

        // Preserve the React key-form tree when only the vault path / menu changes.
        if (
          overlayMode === "save-form" &&
          saveFormMounted &&
          root.querySelector("[data-key-form-root]")
        ) {
          host.style.display = "block";
          host.style.pointerEvents = "none";
          updateSaveFormPathDom(root);
          const panel = root.querySelector(".panel");
          if (panel instanceof HTMLElement) {
            panel.style.pointerEvents = "auto";
            positionSavePanel(panel);
          }
          return;
        }

        const tooltipText =
          overlayMode === "empty-tooltip"
            ? strings.emptyTooltip
            : overlayMode === "unlock-tooltip"
              ? strings.unlockTooltip
              : null;
        const tooltipMarkup =
          tooltipText && togglePos
            ? `<div class="tooltip" style="left:${togglePos.left + togglePos.width / 2}px;top:${togglePos.top}px"><span class="tooltip-arrow" aria-hidden="true"></span>${escapeHtml(tooltipText)}</div>`
            : "";

        // Full HTML replace would skip CSS transform transition — paint from prior
        // chevron angle first, then flip class on the next frame.
        const prevToggle = root.querySelector("[data-toggle='1']");
        const prevKind = prevToggle?.getAttribute("data-toggle-kind");
        const animateChevron =
          showToggle &&
          (toggleKind === "open" || toggleKind === "closed") &&
          (prevKind === "open" || prevKind === "closed") &&
          prevKind !== toggleKind;
        const toggleMarkup =
          showToggle && togglePos
            ? toggleButtonHtml(
                toggleKind,
                togglePos,
                animateChevron ? (prevKind as "open" | "closed") : undefined,
              )
            : "";

        host.style.display = "block";
        host.style.pointerEvents = "none";
        const formCss =
          overlayMode === "save-form" ? `<style data-okkey-tw="1">${shadowExtensionCssText()}</style>` : "";
        if (saveFormMounted && overlayMode !== "save-form") {
          unmountSavePromptKeyForm();
          saveFormMounted = false;
        } else if (overlayMode === "save-form") {
          // About to replace innerHTML — drop the previous React root first.
          unmountSavePromptKeyForm();
          saveFormMounted = false;
        }
        root.innerHTML = `<style>${panelBaseStyles(cssVars)}</style>${formCss}${toggleMarkup}${tooltipMarkup}${panelMarkup}`;
        wireOverlayOnce(root);
        wireGeneratorPanel(root);
        wireRowFaviconFallbacks(root);
        materializeRowFaviconDataUrls(root);

        if (overlayMode === "save-form") {
          mountSaveKeyFormIntoPanel(root);
        }

        if (animateChevron) {
          const btn = root.querySelector("[data-toggle='1']");
          if (btn instanceof HTMLElement) {
            void btn.offsetWidth;
            requestAnimationFrame(() => {
              if (paintGen !== overlayPaintGeneration) {
                return;
              }
              btn.classList.toggle("toggle-open", toggleKind === "open");
              btn.setAttribute("data-toggle-kind", toggleKind);
              btn.setAttribute("aria-expanded", toggleKind === "open" ? "true" : "false");
            });
          }
        }

        const tip = root.querySelector(".tooltip");
        if (tip instanceof HTMLElement && togglePos) {
          const buttonCenter = togglePos.left + togglePos.width / 2;
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
            overlayMode === "unlock-save" ||
            overlayMode === "save-form"
          ) {
            positionSavePanel(panel);
          } else if (anchorInput && document.contains(anchorInput)) {
            positionPanelNearInput(panel, anchorInput);
          }
        }
        if (showToggleOnly && !panelMarkup && !tooltipMarkup && !toggleMarkup) {
          hideOverlay();
        }
      } catch {
        /* Never let overlay paint failures disrupt page UI (Select/focus). */
      }
    }

    /** Reposition overlay without throwing into page scroll/resize handlers. */
    function safeRepaintOverlay(opts?: { showToggleOnly?: boolean }): void {
      try {
        if (isOverlayUpdateFrozen()) {
          return;
        }
        if (!host || host.style.display === "none") {
          return;
        }
        void paintOverlay(opts).catch(() => {
          /* ignore */
        });
      } catch {
        /* ignore */
      }
    }

    function fieldKindsForQuery(focused?: HTMLInputElement | null): string[] {
      const pageKinds = collectPageFieldKinds(document);
      const focusedKind = focused
        ? resolveFocusedAutofillKind(
            collectInputHints(focused),
            `${location.pathname}${location.search}`,
          )
        : null;
      // Focused field only — never union sibling card/email kinds into one query.
      return suggestionFieldKindsForFocus(focusedKind, pageKinds);
    }

    function resolveFormType(focused?: HTMLInputElement | null): AutofillFormType {
      if (!focused) {
        return "unknown";
      }
      try {
        return detectFormTypeForInput(focused, { urlPath: location.pathname });
      } catch {
        return "unknown";
      }
    }

    function isRegisterUsernameField(
      input: HTMLInputElement,
      formType: AutofillFormType,
    ): boolean {
      if (formType !== "register") {
        return false;
      }
      return isUsernameGeneratorField(classifyAutofillInput(collectInputHints(input)));
    }

    /**
     * Register password → generator. Username waits for nickname query (see
     * {@link applyRegisterUsernameSuggestions}); opens generator only when none.
     * Returns true when a generator was opened (caller should skip vault query).
     */
    function maybeOpenRegisterGenerator(input: HTMLInputElement, formType: AutofillFormType): boolean {
      const kind = classifyAutofillInput(collectInputHints(input));
      if (shouldOpenPasswordGenerator(formType, kind, input)) {
        openGeneratorForField("password");
        return true;
      }
      return false;
    }

    /** After vault query on register username: nickname list + CTA, or generator. */
    function applyRegisterUsernameSuggestions(suggestions: AutofillSuggestion[]): void {
      if (suggestions.length === 0) {
        listOffersUsernameGenerator = false;
        openGeneratorForField("username");
        return;
      }
      cachedSuggestions = suggestions;
      listOffersUsernameGenerator = true;
      listOpen = true;
      overlayMode = "list";
      void paintOverlay().then(() => keepPageFieldFocused());
    }

    async function onToggleClick(): Promise<void> {
      if (!activeInput) {
        return;
      }
      const kind = resolveToggleKind();

      // Empty round mark: tooltip only — never open a dropdown.
      if (kind === "empty" || overlayMode === "empty-tooltip") {
        toggleVaultStatus = "empty";
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

      // Lock pill: open extension master-password unlock.
      if (kind === "locked" || overlayMode === "unlock-tooltip") {
        toggleVaultStatus = "locked";
        listOpen = false;
        overlayMode = "unlock-tooltip";
        await paintOverlay();
        void browser.runtime.sendMessage({ type: AUTOFILL_MSG.unlock });
        return;
      }

      // Chevron open → close list / generator (arrow rotates back to right).
      if (listOpen && overlayMode === "list") {
        listOpen = false;
        overlayMode = "hidden";
        await paintOverlay({ showToggleOnly: true });
        return;
      }
      if (
        overlayMode === "password-generator" ||
        overlayMode === "username-generator"
      ) {
        generatorState = null;
        clearGeneratorCopyFeedback();
        listOpen = false;
        overlayMode = "hidden";
        await paintOverlay({ showToggleOnly: true });
        return;
      }

      // Chevron closed → open dropdown (query / generator).
      clearFilledByOkkey();
      if (isOverlayUpdateFrozen()) {
        return;
      }
      const formType = activeFormType !== "unknown" ? activeFormType : resolveFormType(activeInput);
      if (maybeOpenRegisterGenerator(activeInput, formType)) {
        toggleVaultStatus = "ready";
        return;
      }
      const queryGen = ++overlayQueryGeneration;
      let response: AutofillQueryResponse;
      try {
        response = await queryMatches(fieldKindsForQuery(activeInput), formType);
      } catch {
        return;
      }
      if (queryGen !== overlayQueryGeneration || isOverlayUpdateFrozen()) {
        return;
      }
      if (response.status === "signed-out") {
        hideOverlay();
        return;
      }
      if (response.status === "locked") {
        toggleVaultStatus = "locked";
        listOpen = false;
        overlayMode = "unlock-tooltip";
        await paintOverlay();
        void browser.runtime.sendMessage({ type: AUTOFILL_MSG.unlock });
        return;
      }
      cachedSuggestions = response.suggestions;
      if (isRegisterUsernameField(activeInput, formType)) {
        applyRegisterUsernameSuggestions(cachedSuggestions);
        toggleVaultStatus = "ready";
        return;
      }
      if (cachedSuggestions.length === 0) {
        toggleVaultStatus = "empty";
        listOffersUsernameGenerator = false;
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
      toggleVaultStatus = "ready";
      listOffersUsernameGenerator = false;
      listOpen = true;
      overlayMode = "list";
      await paintOverlay();
    }

    async function showForInput(
      input: HTMLInputElement,
      formTypeOverride?: AutofillFormType,
    ): Promise<void> {
      activeInput = input;
      // While datepicker / Select is open — do not start or apply query-driven overlays.
      if (isOverlayUpdateFrozen()) {
        return;
      }
      const formType = formTypeOverride ?? resolveFormType(input);
      activeFormType = formType;
      if (formType === "search") {
        hideOverlay();
        return;
      }
      // Register password/username generators must open even after a personal_data fill
      // (suggestionsListSuppressed only blocks vault suggestion lists, not generators).
      if (maybeOpenRegisterGenerator(input, formType)) {
        toggleVaultStatus = "ready";
        return;
      }
      // After Okkey fill: keep the toggle, do not auto-open the list until clear/toggle.
      if (suggestionsListSuppressed()) {
        listOpen = false;
        overlayMode = "hidden";
        generatorState = null;
        await paintOverlay({ showToggleOnly: true });
        return;
      }
      const queryGen = ++overlayQueryGeneration;
      let response: AutofillQueryResponse;
      try {
        response = await queryMatches(fieldKindsForQuery(input), formType);
      } catch {
        // Do not repaint if focus left for Select / datepicker while the query failed.
        if (
          queryGen === overlayQueryGeneration &&
          activeInput === input &&
          document.activeElement === input &&
          !isOverlayUpdateFrozen()
        ) {
          listOpen = false;
          overlayMode = "hidden";
          await paintOverlay({ showToggleOnly: true });
        }
        return;
      }
      // Focus may have moved to month/year Select (or another control) while the
      // autofill query ran (~1s). Never repaint in that case — overlay DOM mutation
      // closes Radix Select (resize/blur/DismissableLayer), even when the open
      // dropdown was briefly missed by the blocking-UI selector.
      if (
        queryGen !== overlayQueryGeneration ||
        activeInput !== input ||
        document.activeElement !== input ||
        isOverlayUpdateFrozen()
      ) {
        return;
      }
      if (suggestionsListSuppressed()) {
        listOpen = false;
        overlayMode = "hidden";
        await paintOverlay({ showToggleOnly: true });
        return;
      }
      if (response.status === "signed-out") {
        hideOverlay();
        return;
      }
      if (response.status === "locked") {
        toggleVaultStatus = "locked";
        cachedSuggestions = [];
        if (Date.now() < suppressUnlockTooltipUntil) {
          // Post-submit / OTP step: keep the lock toggle, skip the unlock tooltip.
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
      if (isRegisterUsernameField(input, formType)) {
        applyRegisterUsernameSuggestions(cachedSuggestions);
        toggleVaultStatus = "ready";
        return;
      }
      if (cachedSuggestions.length === 0) {
        toggleVaultStatus = "empty";
        listOffersUsernameGenerator = false;
        listOpen = false;
        overlayMode = "hidden";
        await paintOverlay({ showToggleOnly: true });
        return;
      }
      toggleVaultStatus = "ready";
      listOffersUsernameGenerator = false;
      listOpen = true;
      overlayMode = "list";
      await paintOverlay();
    }

    function showSavePrompt(
      creds: PendingSaveCreds,
      locked: boolean,
      opts?: {
        kind?: SavePromptKind;
        itemId?: string;
        title?: string;
        iconUrl?: string;
        changedFields?: AutofillUpdateFieldKey[];
      },
    ): void {
      pendingSave = creds;
      lastSaveOfferKey = pendingOfferKey(creds);
      savePromptKind = opts?.kind ?? "create";
      pendingUpdateItemId = savePromptKind === "update" ? opts?.itemId ?? null : null;
      pendingUpdateChangedFields =
        savePromptKind === "update" ? opts?.changedFields ?? [] : [];
      listOpen = false;
      closeSaveKeyForm();
      vaultMenuOpen = false;
      if (opts?.title) {
        saveTitleDraft = opts.title;
      } else if (!saveTitleDraft) {
        saveTitleDraft = domainTitleFromCapture(creds.captureUrl);
      }
      if (opts?.iconUrl) {
        saveIconUrl = opts.iconUrl;
        saveIconLoading = false;
      } else {
        saveIconUrl = undefined;
        // Transparent pending tile until preview matches post-save vault favicon.
        saveIconLoading = !locked;
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

    async function dismissPendingSaveOffer(): Promise<void> {
      try {
        await browser.runtime.sendMessage({ type: AUTOFILL_MSG.pendingSaveDismiss });
      } catch {
        /* ignore */
      }
      void clearPendingSaveOffer();
    }

    async function persistPendingSaveOffer(creds: PendingSaveCreds): Promise<void> {
      try {
        await browser.runtime.sendMessage({
          type: AUTOFILL_MSG.pendingSaveSet,
          username: creds.username,
          password: creds.password,
          captureUrl: creds.captureUrl,
          websiteUrl: creds.websiteUrl,
          formType: creds.formType,
        });
      } catch {
        /* ignore */
      }
    }

    /**
     * Rebuild pending creds + persist to the background tab map / session storage.
     * Must run in capture phase (before navigation unload) so restore can find the offer.
     */
    function stagePendingSaveFromSnapshot(
      form: HTMLFormElement | null,
      snapshot: { username: string; password: string; captureUrl: string },
    ): PendingSaveCreds | null {
      const formType = resolveSaveOfferFormType(form);
      if (
        formType === "checkout" ||
        formType === "search" ||
        formType === "identity"
      ) {
        return null;
      }
      if (!isSaveOfferFormType(formType) && formType !== "unknown") {
        return null;
      }
      const isRegister = formType === "register";
      if (wasFilledByOkkey() && !isRegister) {
        return null;
      }
      const creds: PendingSaveCreds = {
        username: snapshot.username,
        password: snapshot.password,
        captureUrl: snapshot.captureUrl,
        websiteUrl: websiteUrlForSaveOffer(snapshot.captureUrl, formType),
        formType,
      };
      pendingSave = creds;
      // Fire-and-forget is OK here only because we also await persist in offer path;
      // capture-phase kickoff maximizes chance the SW receives it before unload.
      void persistPendingSaveOffer(creds);
      return creds;
    }

    async function restorePendingSaveOffer(): Promise<void> {
      if (window !== window.top) {
        return;
      }
      // Already showing this offer (SPA) — keep it.
      if (
        pendingSave &&
        (overlayMode === "save" ||
          overlayMode === "save-form" ||
          overlayMode === "unlock-save")
      ) {
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
      if (response.pending.dismissed || response.pending.interacted) {
        return;
      }
      const pending: PendingSaveCreds = {
        username: response.pending.username,
        password: response.pending.password,
        captureUrl: response.pending.captureUrl,
        websiteUrl: response.pending.websiteUrl || response.pending.captureUrl,
        formType: (response.pending.formType as AutofillFormType) || "unknown",
      };
      pendingSave = pending;
      await maybeOfferSave(pending, { allowAfterOkkeyFill: true });
    }

    /** Full navigations race SW hydration / CS inject — retry a few times. */
    function scheduleRestorePendingSaveOffer(): void {
      void restorePendingSaveOffer();
      window.setTimeout(() => void restorePendingSaveOffer(), 50);
      window.setTimeout(() => void restorePendingSaveOffer(), 250);
      window.setTimeout(() => void restorePendingSaveOffer(), 800);
    }

    async function hydrateSaveContext(): Promise<void> {
      try {
        const ctx = await fetchSaveContext();
        if (!pendingSave || ctx.status !== "ok") {
          return;
        }
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

    async function hydrateSavePromptIcon(creds: PendingSaveCreds): Promise<void> {
      const offerKey = pendingOfferKey(creds);
      try {
        // Same URLs as save/upload: website written on the item + capture form URL.
        const result = (await browser.runtime.sendMessage({
          type: AUTOFILL_MSG.siteIcon,
          websiteUrl: creds.websiteUrl,
          urls: [creds.captureUrl, creds.websiteUrl],
        })) as AutofillSiteIconResponse;
        if (!pendingSave || pendingOfferKey(pendingSave) !== offerKey) {
          return;
        }
        saveIconLoading = false;
        if (result.status === "ok") {
          saveIconUrl = result.iconUrl;
        } else {
          saveIconUrl = undefined;
        }
        await paintOverlay();
      } catch {
        if (!pendingSave || pendingOfferKey(pendingSave) !== offerKey) {
          return;
        }
        saveIconLoading = false;
        saveIconUrl = undefined;
        await paintOverlay();
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
        fillLoginFormAndMaybeSubmit(
          document,
          { username: "", password: "", totp },
          { onlyEmpty: true, forceFill: activeInput },
        );
        markFilledByOkkey();
        listOpen = false;
        overlayMode = "hidden";
        void paintOverlay({ showToggleOnly: true });
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

    async function applyFillForItem(
      itemId: string,
      fillOverrides?: Record<string, string>,
    ): Promise<void> {
      const result = await fillItem(itemId, fillOverrides);
      if (result.status !== "ok") {
        if (result.status === "locked") {
          void browser.runtime.sendMessage({ type: AUTOFILL_MSG.unlock });
        }
        return;
      }
      markFilledByOkkey();
      listOpen = false;
      overlayMode = "hidden";
      // Keep toggle on the filled field (do not hideOverlay).
      void paintOverlay({ showToggleOnly: true });
      // Focused field always overwrites; other form fields only when empty.
      const fillOpts = {
        onlyEmpty: true as const,
        forceFill: activeInput,
      };
      const isLogin = !result.fill.categoryId || result.fill.categoryId === "login";
      if (isLogin) {
        const focusedKind = activeInput
          ? resolveFocusedAutofillKind(
              collectInputHints(activeInput),
              `${location.pathname}${location.search}`,
            )
          : null;
        // OTP / email one-time field: fill TOTP only — never vault password.
        if (focusedKind === "otp") {
          if (!result.fill.totp) {
            return;
          }
          fillLoginFormAndMaybeSubmit(
            document,
            { username: "", password: "", totp: result.fill.totp },
            fillOpts,
          );
          setTimeout(() => {
            submitLoginFormIfReady(document);
          }, 120);
          return;
        }
        const outcome = fillLoginFormAndMaybeSubmit(document, result.fill, fillOpts);
        if (outcome.submitted) {
          listOpen = false;
          overlayMode = "hidden";
          void paintOverlay({ showToggleOnly: true });
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
      const fillValues = applyPageLocaleAddressFormat(
        {
          ...result.fill.values,
          ...(result.fill.username ? { username: result.fill.username } : {}),
          // Login-style items may use username as email; personal_data keeps email separate
          // so nickname does not overwrite the email field.
          ...(result.fill.username && !result.fill.values?.email
            ? { email: result.fill.username }
            : {}),
          ...(result.fill.password ? { password: result.fill.password } : {}),
          ...(fillOverrides ?? {}),
        },
        resolvePageAddressLocale(document),
      );
      const isCreditCard = result.fill.categoryId === "credit_card";
      fillAutofillValues(document, fillValues, {
        allowHiddenCreditCard: isCreditCard,
        ...fillOpts,
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
      const title = saveTitleDraft.trim() || domainTitleFromCapture(creds.captureUrl);
      let result: AutofillSaveResponse;
      try {
        result = (await browser.runtime.sendMessage({
          type: AUTOFILL_MSG.save,
          // Always the capture-time URLs — never the post-login redirect location.
          pageUrl: creds.captureUrl,
          websiteUrl: creds.websiteUrl,
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
          changedFields: pendingUpdateChangedFields,
        });
        void browser.runtime.sendMessage({ type: AUTOFILL_MSG.unlock });
        return;
      }
      if (result.status === "ok" || result.status === "exists") {
        pendingSave = null;
        lastSaveOfferKey = null;
        pendingUpdateItemId = null;
        pendingUpdateChangedFields = [];
        savePromptKind = "create";
        saveIconUrl = undefined;
        saveIconLoading = false;
        void clearPendingSaveOffer();
        hideOverlay();
        return;
      }
      if (result.status === "signed-out") {
        pendingSave = null;
        lastSaveOfferKey = null;
        pendingUpdateItemId = null;
        pendingUpdateChangedFields = [];
        savePromptKind = "create";
        void clearPendingSaveOffer();
        hideOverlay();
        return;
      }
      if (result.status === "error") {
        console.error("[okkey] autofill save error", result.message);
      }
    }

    async function maybeOfferSave(
      creds: PendingSaveCreds,
      opts?: { allowAfterOkkeyFill?: boolean },
    ): Promise<void> {
      // Vault autofill of an existing login must not re-prompt; register / generator fills may.
      if (wasFilledByOkkey() && !opts?.allowAfterOkkeyFill) {
        return;
      }
      const offerKey = pendingOfferKey(creds);
      // Already showing this exact offer (e.g. SPA URL churn) — do not re-query / flicker.
      if (
        lastSaveOfferKey === offerKey &&
        (overlayMode === "save" ||
          overlayMode === "save-form" ||
          overlayMode === "unlock-save")
      ) {
        return;
      }
      let response: AutofillSaveOfferResponse;
      try {
        response = (await browser.runtime.sendMessage({
          type: AUTOFILL_MSG.saveOffer,
          pageUrl: creds.captureUrl,
          websiteUrl: creds.websiteUrl,
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
        lastSaveOfferKey = null;
        pendingUpdateItemId = null;
        pendingUpdateChangedFields = [];
        savePromptKind = "create";
        void clearPendingSaveOffer();
        if (overlayMode === "save" || overlayMode === "save-form" || overlayMode === "unlock-save") {
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
          changedFields: response.changedFields,
        });
        return;
      }
      showSavePrompt(creds, false, { kind: "create" });
    }

    function resolveSaveOfferFormType(form: HTMLFormElement | null): AutofillFormType {
      // Prefer the submitted form over stale focus-time type (login↔register SPA).
      try {
        if (form) {
          return detectFormTypeForRoot(form, document, {
            urlPath: location.pathname,
            formEl: form,
          });
        }
        if (activeInput && document.contains(activeInput)) {
          return detectFormTypeForInput(activeInput, { urlPath: location.pathname });
        }
        if (activeFormType === "login" || activeFormType === "register") {
          return activeFormType;
        }
        return detectFormTypeForRoot(document, document, { urlPath: location.pathname });
      } catch {
        return activeFormType === "login" || activeFormType === "register"
          ? activeFormType
          : "unknown";
      }
    }

    /**
     * After login or register submit — offer create/update Login item.
     * Register also fires when the user used Okkey's password generator (`wasFilledByOkkey`).
     *
     * @param snapshot Capture-phase username/password + form URL (before redirect / form clear).
     */
    function onCredentialsSubmitted(
      form?: HTMLFormElement | null,
      snapshot?: { username: string; password: string; captureUrl: string } | null,
    ): void {
      suppressUnlockTooltipUntil = Date.now() + 12_000;
      if (overlayMode === "unlock-tooltip" || overlayMode === "list") {
        listOpen = false;
        overlayMode = "hidden";
        void paintOverlay({ showToggleOnly: true });
      }
      const formType = resolveSaveOfferFormType(form ?? null);
      // Skip checkout / search / identity; allow login, register, and ambiguous unknown
      // (unknown keeps prior login-page behavior when heuristics miss).
      if (
        formType === "checkout" ||
        formType === "search" ||
        formType === "identity"
      ) {
        return;
      }
      const isRegister = formType === "register";
      if (wasFilledByOkkey() && !isRegister) {
        return;
      }
      const scope: ParentNode = form ?? document;
      let username = snapshot?.username ?? "";
      let password = snapshot?.password ?? "";
      if (!password) {
        const raw = captureLoginCredentials(scope) ?? (form ? captureLoginCredentials(document) : null);
        if (!raw) {
          return;
        }
        username = raw.username;
        password = raw.password;
      }
      // Prefer offering on explicit login/register; unknown still offers when creds exist.
      if (!isSaveOfferFormType(formType) && formType !== "unknown") {
        return;
      }
      // Prefer capture-phase URL; fall back only if snapshot missing (should be rare).
      const captureUrl = snapshot?.captureUrl || captureFormPageUrl(location);
      const creds: PendingSaveCreds = {
        username,
        password,
        captureUrl,
        websiteUrl: websiteUrlForSaveOffer(captureUrl, formType),
        formType,
      };
      // Hold early so focusout hide (180ms) cannot race past async saveOffer.
      pendingSave = creds;
      void (async () => {
        // Await persist so a fast full-page redirect still finds pending in session.
        await persistPendingSaveOffer(creds);
        await maybeOfferSave(creds, { allowAfterOkkeyFill: isRegister });
      })();
    }

    /**
     * Snapshot username/password + form URL during capture phase (before page handlers /
     * redirects run). Same timing as the demoqa register fix.
     */
    function snapshotCredentialsForOffer(
      form: HTMLFormElement | null,
    ): { username: string; password: string; captureUrl: string } | null {
      const scope: ParentNode = form ?? document;
      const raw =
        captureLoginCredentials(scope) ?? (form ? captureLoginCredentials(document) : null);
      if (!raw) {
        return null;
      }
      return {
        username: raw.username,
        password: raw.password,
        captureUrl: captureFormPageUrl(location),
      };
    }

    document.addEventListener(
      "focusin",
      (event) => {
        if (isOkkeyWebAppOrigin()) {
          clearActiveInputAndHide();
          return;
        }
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !isPageVisibleAutofillInput(target)) {
          // Focus moved to body/main/non-input (e.g. dialog closed) — drop any orphan toggle.
          if (target instanceof Element && isNonFieldFocusTarget(target)) {
            window.clearTimeout(hideTimer);
            clearActiveInputAndHide();
          }
          return;
        }
        activateAutofillForInput(target);
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
          if (isOverlayUpdateFrozen()) {
            return;
          }
          if (isOkkeyWebAppOrigin()) {
            clearActiveInputAndHide();
            return;
          }
          const focused = document.activeElement instanceof Element ? document.activeElement : null;
          // Still on the autofill field (focus moved to another field whose focusin already ran,
          // or focus never left) — keep list / generator panels open.
          if (focused === activeInput) {
            return;
          }
          // Interacting with overlay controls (closed shadow → activeElement is the host).
          if (host && focused && (focused === host || host.contains(focused))) {
            if (isGeneratorOverlayOpen()) {
              keepPageFieldFocused();
            }
            return;
          }
          // Length slider custom drag / brief repaint: keep open and restore field focus.
          if (isGeneratorOverlayOpen() && generatorSliderActive) {
            keepPageFieldFocused();
            return;
          }
          // Generator: close when focus genuinely left the field + autofill UI.
          if (isGeneratorOverlayOpen()) {
            generatorState = null;
            clearGeneratorCopyFeedback();
            listOpen = false;
            overlayMode = "hidden";
            void paintOverlay({ showToggleOnly: true });
            return;
          }
          // Dialog close / save: focus lands on body or main — never keep a floating toggle.
          if (isNonFieldFocusTarget(focused)) {
            clearActiveInputAndHide();
            return;
          }
          // Anchor removed with the dialog — hide instead of painting at stale center coords.
          // Use page-visible check (not isVisibleFillableElement) so brief readOnly suppress
          // does not tear down an open password generator.
          if (!activeInput || !document.contains(activeInput) || !isPageVisibleAutofillInput(activeInput)) {
            clearActiveInputAndHide();
            return;
          }
          // Keep toggle while field may still be "active"; hide panels/tooltips on blur.
          listOpen = false;
          generatorState = null;
          if (
            overlayMode === "list" ||
            overlayMode === "unlock-tooltip" ||
            (activeInput && document.contains(activeInput))
          ) {
            overlayMode = "hidden";
            void paintOverlay({ showToggleOnly: true });
            return;
          }
          clearActiveInputAndHide();
        }, 180);
      },
      true,
    );

    const onAutofillFieldEdited = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      if (document.activeElement !== target) {
        return;
      }
      if (isOverlayUpdateFrozen()) {
        return;
      }
      if (!isVisibleFillableElement(target)) {
        return;
      }
      const kind = classifyAutofillInput(collectInputHints(target));
      if (!kind) {
        return;
      }
      activeInput = target;
      if (target.value.trim().length > 0) {
        // Filled (by us or user) — keep toggle, close list if open.
        if (listOpen || overlayMode === "list") {
          listOpen = false;
          overlayMode = "hidden";
          void paintOverlay({ showToggleOnly: true });
        } else if (host?.style.display === "block") {
          void paintOverlay({ showToggleOnly: true });
        }
        return;
      }
      // Cleared while focused — re-show suggestions without blur→focus.
      clearFilledByOkkey();
      window.clearTimeout(hideTimer);
      void showForInput(target);
    };
    document.addEventListener("input", onAutofillFieldEdited, true);
    document.addEventListener("change", onAutofillFieldEdited, true);

    document.addEventListener(
      "scroll",
      () => {
        // Capture-phase scroll fires for floating-ui / Radix Select positioning.
        // Must never throw or force async storage work that breaks page UI.
        try {
          if (isOverlayUpdateFrozen()) {
            return;
          }
          if (pendingSave) {
            return;
          }
          if (!host || host.style.display === "none") {
            return;
          }
          if (overlayMode === "hidden" && !activeInput) {
            return;
          }
          if (overlayMode === "unlock-tooltip") {
            safeRepaintOverlay();
            return;
          }
          safeRepaintOverlay({
            showToggleOnly: overlayMode === "hidden" || overlayMode === "empty-tooltip",
          });
        } catch {
          /* ignore — page Select/focus must keep working */
        }
      },
      true,
    );

    window.addEventListener("resize", () => {
      try {
        if (isOverlayUpdateFrozen()) {
          return;
        }
        if (host?.style.display === "block") {
          safeRepaintOverlay();
        }
      } catch {
        /* ignore */
      }
    });

    // Track Select / datepicker open state so late query results stay no-op even if
    // the dropdown briefly fails a one-shot querySelector during reposition.
    try {
      const freezeObserver = new MutationObserver(() => {
        refreshOverlayFreeze();
      });
      freezeObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-state", "aria-expanded", "data-radix-select-viewport"],
      });
    } catch {
      /* ignore */
    }

    // Debounced DOM collect refresh (BW: attributeFilter without `class` — SPA class storms).
    try {
      let collectDebounce: ReturnType<typeof setTimeout> | null = null;
      const COLLECT_DEBOUNCE_MS = 500;
      const onDomCollectMutation = (): void => {
        if (collectDebounce != null) {
          clearTimeout(collectDebounce);
        }
        collectDebounce = setTimeout(() => {
          collectDebounce = null;
          if (pendingSave || isOverlayUpdateFrozen()) {
            return;
          }
          // Re-bind autofill when SPA mounts login/OTP fields after navigation.
          bootstrapFocusedAutofillField();
        }, COLLECT_DEBOUNCE_MS);
      };
      const collectObserver = new MutationObserver(onDomCollectMutation);
      collectObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          "style",
          "hidden",
          "disabled",
          "type",
          "name",
          "id",
          "autocomplete",
          "aria-label",
          "placeholder",
        ],
      });
    } catch {
      /* ignore */
    }

    document.addEventListener(
      "submit",
      (event) => {
        const form = event.target instanceof HTMLFormElement ? event.target : null;
        // Capture-phase snapshot — page submit handlers may clear inputs before bubble.
        const snapshot = snapshotCredentialsForOffer(form);
        // Stage into background *now* (before unload) so post-redirect restore works.
        if (snapshot) {
          stagePendingSaveFromSnapshot(form, snapshot);
        }
        onCredentialsSubmitted(form, snapshot);
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
        const control = target.closest(
          'button, input[type="submit"], input[type="button"], [role="button"]',
        );
        if (!control || !isAuthCredentialSubmitControl(control)) {
          return;
        }
        const form =
          control.closest("form") ??
          (activeInput?.form && document.contains(activeInput) ? activeInput.form : null);
        // Capture + persist NOW (capture phase, before demoqa/AJAX / navigation).
        const snapshot = snapshotCredentialsForOffer(form);
        if (!snapshot) {
          return;
        }
        stagePendingSaveFromSnapshot(form, snapshot);
        // Defer only the offer UI so page click handlers can run first.
        setTimeout(() => onCredentialsSubmitted(form, snapshot), 0);
      },
      true,
    );

    browser.runtime.onMessage.addListener((message) => {
      if (!message || typeof message !== "object" || !("type" in message)) {
        return undefined;
      }
      if (message.type === AUTOFILL_MSG.unlocked) {
        if (pendingSave) {
          // Fire-and-forget: ack sync so the message channel closes cleanly.
          // Pending offers (incl. register + generator) must survive wasFilledByOkkey.
          void maybeOfferSave(pendingSave, { allowAfterOkkeyFill: true });
          return undefined;
        }
        if (suggestionsListSuppressed()) {
          if (activeInput && document.contains(activeInput)) {
            void paintOverlay({ showToggleOnly: true });
          }
          return undefined;
        }
        // Prefer retained field; else whatever is focused now (autofocus before CS ready).
        const unlockTarget =
          activeInput && document.contains(activeInput)
            ? activeInput
            : resolveFocusedAutofillInput();
        if (unlockTarget && !isOverlayUpdateFrozen()) {
          try {
            unlockTarget.focus({ preventScroll: true });
          } catch {
            /* ignore */
          }
          activateAutofillForInput(unlockTarget);
        }
        return undefined;
      }
      if (message.type === AUTOFILL_MSG.applyFill) {
        const itemId = (message as { itemId?: string }).itemId;
        if (typeof itemId === "string" && itemId) {
          // Return a Promise so MV3 keeps the channel open until fill finishes
          // (avoids "async response… channel closed" when sender awaits sendMessage).
          return applyFillForItem(itemId).then(() => ({ ok: true as const }));
        }
        return Promise.resolve({ ok: false as const });
      }
      return undefined;
    });

    if (pendingTotpItemId) {
      void pendingTotpItemId;
    }

    // Full-page post-login redirect: CS reinjects → pull pending from SW session by tabId.
    scheduleRestorePendingSaveOffer();

    // Autofocus / restored focus often happens before this script runs — no focusin fires.
    bootstrapFocusedAutofillField();
    requestAnimationFrame(() => {
      bootstrapFocusedAutofillField();
    });

    let lastSeenUrl = pageUrl();
    const onPossibleNavigation = (): void => {
      const next = pageUrl();
      if (next === lastSeenUrl) {
        return;
      }
      lastSeenUrl = next;
      if (pendingSave) {
        // Keep local offer; re-paint after SPA redirect away from the login/register form.
        void maybeOfferSave(pendingSave, { allowAfterOkkeyFill: true });
        return;
      }
      scheduleRestorePendingSaveOffer();
      // SPA navigations may leave autofocus set without a new focusin.
      bootstrapFocusedAutofillField();
    };
    window.addEventListener("popstate", onPossibleNavigation);
    window.addEventListener("pageshow", (event) => {
      // Always try restore on pageshow (incl. bfcache) — URL may be unchanged after POST redirect.
      scheduleRestorePendingSaveOffer();
      onPossibleNavigation();
      // bfcache restore: field may still be focused with no focus event.
      if (event.persisted) {
        bootstrapFocusedAutofillField();
      }
    });
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

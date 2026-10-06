import { defineContentScript } from "wxt/utils/define-content-script";

import {
  AUTOFILL_MSG,
  type AutofillFillResponse,
  type AutofillQueryResponse,
  type AutofillSaveResponse,
  type AutofillSiteIconResponse,
} from "../lib/autofillMessages";
import { resolveOverlayThemeCss } from "../lib/overlayTheme";
import {
  captureLoginCredentials,
  classifyLoginInput,
  fillLoginFormAndMaybeSubmit,
  findLoginFields,
  isVisibleFillableElement,
  submitLoginFormIfReady,
} from "../lib/loginFormFields";

function overlayStrings() {
  const ru = (navigator.language || "").toLowerCase().startsWith("ru");
  return ru
    ? {
        unlockTitle: "Сейф закрыт",
        unlockCta: "Разблокировать",
        saveTitle: "Сохранить учётную запись?",
        saveBody: "Okkey может сохранить логин и пароль для этого сайта.",
        saveConfirm: "Сохранить",
        saveCancel: "Отмена",
        saveLocked: "Разблокируйте сейф, чтобы сохранить учётную запись",
        saved: "Сохранено",
      }
    : {
        unlockTitle: "Vault locked",
        unlockCta: "Unlock",
        saveTitle: "Save this login?",
        saveBody: "Okkey can save the username and password for this site.",
        saveConfirm: "Save",
        saveCancel: "Cancel",
        saveLocked: "Unlock the vault to save this login",
        saved: "Saved",
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

async function queryMatches(): Promise<AutofillQueryResponse> {
  return browser.runtime.sendMessage({ type: AUTOFILL_MSG.query, pageUrl: pageUrl() });
}

async function fillItem(itemId: string): Promise<AutofillFillResponse> {
  return browser.runtime.sendMessage({ type: AUTOFILL_MSG.fill, itemId, pageUrl: pageUrl() });
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
    let pendingSave: { username: string; password: string } | null = null;
    let pendingTotpItemId: string | null = null;
    let otpObserver: MutationObserver | null = null;

    function markFilledByOkkey(): void {
      filledByOkkeyUntil = Date.now() + 15_000;
    }

    function wasFilledByOkkey(): boolean {
      return Date.now() < filledByOkkeyUntil;
    }

    function ensureOverlay(): ShadowRoot {
      if (host && shadow) {
        return shadow;
      }
      host = document.createElement("div");
      host.setAttribute("data-okkey-autofill", "true");
      host.style.all = "initial";
      host.style.position = "fixed";
      host.style.zIndex = "2147483647";
      host.style.pointerEvents = "none";
      shadow = host.attachShadow({ mode: "closed" });
      document.documentElement.appendChild(host);
      return shadow;
    }

    function hideOverlay(): void {
      if (host) {
        host.style.display = "none";
        host.style.pointerEvents = "none";
      }
      if (!pendingSave) {
        restoreNativeAutocomplete();
      }
    }

    const suppressedFields = new Map<
      HTMLInputElement,
      { autocomplete: string | null; readonly: boolean }
    >();

    function suppressNativeAutocomplete(input: HTMLInputElement, kind: "username" | "password" | "otp"): void {
      if (!suppressedFields.has(input)) {
        suppressedFields.set(input, {
          autocomplete: input.getAttribute("autocomplete"),
          readonly: input.readOnly,
        });
      }
      if (kind === "password") {
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

    function panelBaseStyles(minWidth: number, themeCssVars: string): string {
      const fontStack =
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", ui-sans-serif, sans-serif';
      return `
          :host {
            all: initial;
            ${themeCssVars}
            font-family: ${fontStack} !important;
            color: hsl(var(--ok-fg));
            line-height: 20px;
            -webkit-font-smoothing: antialiased;
          }
          .panel {
            display: block;
            pointer-events: auto;
            box-sizing: border-box;
            min-width: ${Math.max(220, minWidth)}px;
            max-width: 360px;
            font-family: ${fontStack} !important;
            font-size: 14px;
            line-height: 20px;
            color: hsl(var(--ok-fg));
            background: hsl(var(--ok-bg));
            border: 0;
            border-radius: 8px;
            box-shadow:
              0 0 0 1px rgba(var(--ok-shadow), 0.12),
              0 10px 30px rgba(var(--ok-shadow), 0.12);
            overflow: hidden;
            -webkit-font-smoothing: antialiased;
          }
          .panel, .panel *, .panel *::before, .panel *::after {
            box-sizing: border-box;
            font-family: ${fontStack} !important;
          }
          .list {
            display: flex;
            flex-direction: column;
            gap: 0;
            padding: 8px;
          }
          button.row {
            display: flex;
            align-items: center;
            gap: 16px;
            width: 100%;
            min-height: 60px;
            height: 60px;
            text-align: left;
            border: 0;
            border-radius: 8px;
            background: transparent;
            padding: 0 12px;
            margin: 0;
            cursor: pointer;
            color: hsl(var(--ok-fg));
            appearance: none;
            -webkit-appearance: none;
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
            min-height: 40px;
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
            font-size: 14px;
            font-weight: 400;
            line-height: 20px;
            color: hsl(var(--ok-muted));
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            min-height: 20px;
          }
          button.cta, button.secondary {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 36px;
            border: 0;
            border-radius: 8px;
            padding: 0 12px;
            cursor: pointer;
            font: inherit;
            appearance: none;
            -webkit-appearance: none;
          }
          button.cta {
            background: hsl(var(--ok-primary));
            color: hsl(var(--ok-primary-fg));
          }
          button.cta:hover {
            filter: brightness(0.92);
          }
          button.secondary {
            background: transparent;
            color: hsl(var(--ok-fg));
            box-shadow: 0 0 0 1px rgba(var(--ok-shadow), 0.14);
          }
          button.secondary:hover { background: hsl(var(--ok-muted-bg)); }
          .empty, .save-body {
            padding: 12px 16px;
            color: hsl(var(--ok-muted));
            font-size: 14px;
            line-height: 20px;
          }
          .save-title {
            padding: 16px 16px 0;
            font-size: 16px;
            font-weight: 600;
            line-height: 24px;
            color: hsl(var(--ok-fg));
          }
          .save-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 12px 16px 16px;
          }
      `;
    }

    function wirePanelClicks(root: ShadowRoot): void {
      const panel = root.querySelector(".panel");
      if (!(panel instanceof HTMLElement)) {
        return;
      }
      panel.addEventListener("mousedown", (event) => event.preventDefault());
      panel.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        if (target.closest("[data-unlock]")) {
          void browser.runtime.sendMessage({ type: AUTOFILL_MSG.unlock });
          return;
        }
        if (target.closest("[data-save-cancel]")) {
          pendingSave = null;
          hideOverlay();
          return;
        }
        if (target.closest("[data-save-confirm]")) {
          void confirmSave();
          return;
        }
        const row = target.closest("[data-item]");
        if (!(row instanceof HTMLElement) || !row.dataset.item) {
          return;
        }
        void applyFillForItem(row.dataset.item).then(() => hideOverlay());
      });
    }

    async function renderPanel(
      html: string,
      anchor: HTMLElement | null,
      opts?: { fixedCenter?: boolean },
    ): Promise<void> {
      const root = ensureOverlay();
      if (!host) {
        return;
      }
      host.style.display = "block";
      host.style.pointerEvents = "auto";
      const minWidth = anchor ? Math.max(220, anchor.getBoundingClientRect().width) : 280;
      if (opts?.fixedCenter || !anchor) {
        host.style.left = "50%";
        host.style.top = "24px";
        host.style.transform = "translateX(-50%)";
      } else {
        const rect = anchor.getBoundingClientRect();
        host.style.transform = "";
        host.style.left = `${Math.max(8, rect.left)}px`;
        host.style.top = `${rect.bottom + 6}px`;
      }
      const theme = await resolveOverlayThemeCss();
      root.innerHTML = `
        <style>${panelBaseStyles(minWidth, theme.cssVars)}</style>
        <div class="panel">${html}</div>
      `;
      wirePanelClicks(root);
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

    function suggestionRowHtml(item: {
      itemId: string;
      title: string;
      username: string;
      iconUrl?: string;
    }): string {
      const letters = monogram(item.title);
      const iconInner = item.iconUrl
        ? `<img src="${escapeHtml(item.iconUrl)}" alt="" />`
        : escapeHtml(letters);
      const meta = item.username
        ? `<span class="row-meta">${escapeHtml(item.username)}</span>`
        : "";
      const titleOnlyStyle = item.username ? "" : ` style="min-height:0"`;
      return `<button type="button" class="row" data-item="${escapeHtml(item.itemId)}">
              <span class="row-icon" style="background:${monogramBackground(letters)}">${iconInner}</span>
              <span class="row-text"${titleOnlyStyle}>
                <span class="row-title">${escapeHtml(item.title)}</span>
                ${meta}
              </span>
            </button>`;
    }

    function recordPreviewRowHtml(input: {
      title: string;
      username: string;
      website: string;
      iconUrl?: string;
    }): string {
      const letters = monogram(input.title);
      const iconInner = input.iconUrl
        ? `<img src="${escapeHtml(input.iconUrl)}" alt="" />`
        : escapeHtml(letters);
      const metaParts = [input.username, input.website].filter((part) => part.trim().length > 0);
      const meta = metaParts.length
        ? `<span class="row-meta">${escapeHtml(metaParts.join(" · "))}</span>`
        : "";
      return `<div class="row" style="pointer-events:none">
              <span class="row-icon" style="background:${monogramBackground(letters)}">${iconInner}</span>
              <span class="row-text">
                <span class="row-title">${escapeHtml(input.title)}</span>
                ${meta}
              </span>
            </div>`;
    }

    function showSavePrompt(
      creds: { username: string; password: string },
      locked: boolean,
      iconUrl?: string,
    ): void {
      pendingSave = creds;
      const preview = recordPreviewRowHtml({
        title: domainTitle(),
        username: creds.username,
        website: websiteUrl(),
        iconUrl,
      });
      const body = locked
        ? `${preview ? `<div class="list" style="padding-top:8px">${preview}</div>` : ""}
           <div class="empty">${strings.saveLocked}</div>
           <button type="button" class="cta" data-unlock="1" style="margin:0 16px 16px;width:calc(100% - 32px)">${strings.unlockCta}</button>`
        : `<div class="save-body">${strings.saveBody}</div>
           <div class="list" style="padding-top:0">${preview}</div>
           <div class="save-actions">
             <button type="button" class="secondary" data-save-cancel="1">${strings.saveCancel}</button>
             <button type="button" class="cta" data-save-confirm="1">${strings.saveConfirm}</button>
           </div>`;
      void renderPanel(
        `<div class="save-title">${strings.saveTitle}</div>${body}`,
        null,
        { fixedCenter: true },
      );
    }

    async function hydrateSavePromptIcon(creds: { username: string; password: string }, locked: boolean): Promise<void> {
      try {
        const result = (await browser.runtime.sendMessage({
          type: AUTOFILL_MSG.siteIcon,
          websiteUrl: websiteUrl(),
        })) as AutofillSiteIconResponse;
        if (pendingSave !== creds || result.status !== "ok") {
          return;
        }
        showSavePrompt(creds, locked, result.iconUrl);
      } catch {
        /* keep initials */
      }
    }

    async function showForInput(input: HTMLInputElement): Promise<void> {
      if (suggestionsSuppressed()) {
        hideOverlay();
        return;
      }
      activeInput = input;
      let response: AutofillQueryResponse;
      try {
        response = await queryMatches();
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
        void renderPanel(
          `<div class="list">
             <div class="empty">${strings.unlockTitle}</div>
             <button type="button" class="cta" data-unlock="1" style="margin:0 8px 8px;width:calc(100% - 16px)">${strings.unlockCta}</button>
           </div>`,
          input,
        );
        return;
      }
      const suggestions = response.suggestions;
      if (suggestions.length === 0) {
        hideOverlay();
        return;
      }
      const rows = suggestions.map((item) => suggestionRowHtml(item)).join("");
      void renderPanel(`<div class="list">${rows}</div>`, input);
    }

    function escapeHtml(value: string): string {
      return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
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
      const outcome = fillLoginFormAndMaybeSubmit(document, result.fill);
      if (outcome.submitted) {
        hideOverlay();
      }
      if (result.fill.totp) {
        // If OTP was not on this step, watch for the next screen.
        const fields = findLoginFields(document);
        if (fields.otp.length === 0) {
          watchForOtp(itemId, result.fill.totp);
        } else {
          // OTP filled; try submit again shortly for SPA validation.
          setTimeout(() => {
            submitLoginFormIfReady(document);
          }, 120);
        }
      }
    }

    async function confirmSave(): Promise<void> {
      if (!pendingSave) {
        return;
      }
      const creds = pendingSave;
      const result = (await browser.runtime.sendMessage({
        type: AUTOFILL_MSG.save,
        pageUrl: pageUrl(),
        websiteUrl: websiteUrl(),
        title: domainTitle(),
        username: creds.username,
        password: creds.password,
      })) as AutofillSaveResponse;
      if (result.status === "locked") {
        showSavePrompt(creds, true);
        void hydrateSavePromptIcon(creds, true);
        void browser.runtime.sendMessage({ type: AUTOFILL_MSG.unlock });
        return;
      }
      if (result.status === "ok" || result.status === "exists") {
        pendingSave = null;
        hideOverlay();
        return;
      }
      if (result.status === "signed-out") {
        pendingSave = null;
        hideOverlay();
      }
    }

    async function maybeOfferSave(creds: { username: string; password: string }): Promise<void> {
      if (wasFilledByOkkey()) {
        return;
      }
      let response: AutofillQueryResponse;
      try {
        response = await queryMatches();
      } catch {
        return;
      }
      if (response.status === "signed-out") {
        return;
      }
      if (response.status === "locked") {
        showSavePrompt(creds, true);
        void hydrateSavePromptIcon(creds, true);
        return;
      }
      if (response.suggestions.length > 0) {
        return;
      }
      showSavePrompt(creds, false);
      void hydrateSavePromptIcon(creds, false);
    }

    function onCredentialsSubmitted(): void {
      if (wasFilledByOkkey()) {
        return;
      }
      const creds = captureLoginCredentials(document);
      if (!creds) {
        return;
      }
      void maybeOfferSave(creds);
    }

    document.addEventListener(
      "focusin",
      (event) => {
        if (suggestionsSuppressed()) {
          if (!pendingSave) {
            hideOverlay();
          }
          return;
        }
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !isVisibleFillableElement(target)) {
          return;
        }
        const kind = classifyLoginInput({
          type: target.type,
          name: target.name,
          id: target.id,
          autocomplete: target.autocomplete,
          placeholder: target.placeholder,
          ariaLabel: target.getAttribute("aria-label") ?? undefined,
          inputMode: target.inputMode,
          maxLength: target.maxLength,
        });
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
          // Keep save prompt visible (no active input).
          if (pendingSave) {
            return;
          }
          hideOverlay();
        }, 180);
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
        // Defer so field values are final.
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
        if (activeInput && document.activeElement === activeInput) {
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

    // Late OTP step after navigation within SPA when we already filled login.
    if (pendingTotpItemId) {
      void pendingTotpItemId;
    }
  },
});

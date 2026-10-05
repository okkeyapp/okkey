import { defineContentScript } from "wxt/utils/define-content-script";

import {
  AUTOFILL_MSG,
  type AutofillFillResponse,
  type AutofillQueryResponse,
  type AutofillSaveResponse,
} from "../lib/autofillMessages";
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
      host.style.zIndex = "2147483646";
      host.style.pointerEvents = "none";
      shadow = host.attachShadow({ mode: "closed" });
      document.documentElement.appendChild(host);
      return shadow;
    }

    function hideOverlay(): void {
      if (host) {
        host.style.display = "none";
      }
    }

    function panelBaseStyles(minWidth: number): string {
      return `
          :host { all: initial; }
          .panel {
            pointer-events: auto;
            min-width: ${Math.max(220, minWidth)}px;
            max-width: 360px;
            font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #0f172a;
            background: #fff;
            border: 0;
            border-radius: 8px;
            box-shadow:
              0 0 0 1px rgba(15, 23, 42, 0.12),
              0 10px 30px rgba(15, 23, 42, 0.12);
            overflow: hidden;
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
            cursor: pointer;
            color: inherit;
          }
          button.row:hover, button.row:focus-visible {
            background: rgba(148, 163, 184, 0.28);
            outline: none;
          }
          .row-icon {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: #f1f5f9;
            color: #64748b;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 600;
            flex-shrink: 0;
            overflow: hidden;
          }
          .row-icon img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .row-text {
            min-width: 0;
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .row-title {
            font-size: 14px;
            font-weight: 500;
            line-height: 20px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .row-meta {
            font-size: 14px;
            line-height: 20px;
            color: #64748b;
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
          }
          button.cta {
            background: #0f172a;
            color: #fff;
          }
          button.cta:hover { background: #1e293b; }
          button.secondary {
            background: transparent;
            color: #0f172a;
            box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.14);
          }
          button.secondary:hover { background: #f8fafc; }
          .empty, .save-body {
            padding: 12px 16px;
            color: #64748b;
            font-size: 14px;
            line-height: 20px;
          }
          .save-title {
            padding: 16px 16px 0;
            font-size: 16px;
            font-weight: 600;
            line-height: 24px;
            color: #0f172a;
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

    function renderPanel(html: string, anchor: HTMLElement | null, opts?: { fixedCenter?: boolean }): void {
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
      root.innerHTML = `
        <style>${panelBaseStyles(minWidth)}</style>
        <div class="panel">${html}</div>
      `;
      wirePanelClicks(root);
    }

    function monogram(title: string): string {
      const ch = title.trim().charAt(0);
      return ch ? ch.toUpperCase() : "?";
    }

    function faviconUrlForDomain(): string {
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(location.hostname)}&sz=64`;
    }

    async function showForInput(input: HTMLInputElement): Promise<void> {
      activeInput = input;
      let response: AutofillQueryResponse;
      try {
        response = await queryMatches();
      } catch {
        hideOverlay();
        return;
      }
      if (activeInput !== input) {
        return;
      }
      if (response.status === "signed-out") {
        hideOverlay();
        return;
      }
      if (response.status === "locked") {
        renderPanel(
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
      const rows = suggestions
        .map(
          (item) =>
            `<button type="button" class="row" data-item="${item.itemId}">
              <span class="row-icon">${escapeHtml(monogram(item.title))}</span>
              <span class="row-text">
                <span class="row-title">${escapeHtml(item.title)}</span>
                ${item.username ? `<span class="row-meta">${escapeHtml(item.username)}</span>` : `<span class="row-meta"></span>`}
              </span>
            </button>`,
        )
        .join("");
      renderPanel(`<div class="list">${rows}</div>`, input);
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
      fillLoginFormAndMaybeSubmit(document, result.fill);
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

    function showSavePrompt(creds: { username: string; password: string }, locked: boolean): void {
      pendingSave = creds;
      const icon = `<span class="row-icon"><img src="${faviconUrlForDomain()}" alt="" /></span>`;
      const body = locked
        ? `<div class="empty">${strings.saveLocked}</div>
           <button type="button" class="cta" data-unlock="1" style="margin:0 16px 16px;width:calc(100% - 32px)">${strings.unlockCta}</button>`
        : `<div class="save-body">${strings.saveBody}</div>
           <div class="list" style="padding-top:0">
             <div class="row" style="pointer-events:none">
               ${icon}
               <span class="row-text">
                 <span class="row-title">${escapeHtml(domainTitle())}</span>
                 <span class="row-meta">${escapeHtml(creds.username || "—")}</span>
               </span>
             </div>
           </div>
           <div class="save-actions">
             <button type="button" class="secondary" data-save-cancel="1">${strings.saveCancel}</button>
             <button type="button" class="cta" data-save-confirm="1">${strings.saveConfirm}</button>
           </div>`;
      renderPanel(
        `<div class="save-title">${strings.saveTitle}</div>${body}`,
        null,
        { fixedCenter: true },
      );
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
        return;
      }
      if (response.suggestions.length > 0) {
        return;
      }
      showSavePrompt(creds, false);
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

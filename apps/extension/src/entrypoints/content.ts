import { defineContentScript } from "wxt/utils/define-content-script";

import {
  AUTOFILL_MSG,
  type AutofillFillResponse,
  type AutofillQueryResponse,
} from "../lib/autofillMessages";
import { classifyLoginInput, fillLoginForm, isVisibleFillableElement } from "../lib/loginFormFields";

function overlayStrings() {
  const ru = (navigator.language || "").toLowerCase().startsWith("ru");
  return ru
    ? {
        brand: "Okkey",
        unlockTitle: "Сейф закрыт",
        unlockCta: "Разблокировать",
        empty: "Нет подходящих логинов",
      }
    : {
        brand: "Okkey",
        unlockTitle: "Vault locked",
        unlockCta: "Unlock",
        empty: "No matching logins",
      };
}

function pageUrl(): string {
  return location.origin + location.pathname;
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
        const row = target.closest("[data-item]");
        if (!(row instanceof HTMLElement) || !row.dataset.item) {
          return;
        }
        void fillItem(row.dataset.item).then((result) => {
          if (result.status === "ok") {
            fillLoginForm(document, result.fill);
            hideOverlay();
          }
        });
      });
    }

    function renderPanel(html: string, anchor: HTMLElement): void {
      const root = ensureOverlay();
      const rect = anchor.getBoundingClientRect();
      if (!host) {
        return;
      }
      host.style.display = "block";
      host.style.pointerEvents = "auto";
      host.style.left = `${Math.max(8, rect.left)}px`;
      host.style.top = `${rect.bottom + 6}px`;
      root.innerHTML = `
        <style>
          :host { all: initial; }
          .panel {
            pointer-events: auto;
            min-width: ${Math.max(220, rect.width)}px;
            max-width: 360px;
            font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #0f172a;
            background: #fff;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.16);
            overflow: hidden;
          }
          .head {
            padding: 8px 10px;
            font-weight: 600;
            font-size: 12px;
            color: #64748b;
            border-bottom: 1px solid #e2e8f0;
          }
          button.row, button.cta {
            display: block;
            width: 100%;
            text-align: left;
            border: 0;
            background: transparent;
            padding: 8px 10px;
            cursor: pointer;
            color: inherit;
          }
          button.row:hover, button.cta:hover { background: #f1f5f9; }
          .meta { color: #64748b; font-size: 12px; }
          .empty { padding: 10px; color: #64748b; }
        </style>
        <div class="panel">${html}</div>
      `;
      wirePanelClicks(root);
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
          `<div class="head">${strings.brand}</div>
           <div class="empty">${strings.unlockTitle}</div>
           <button type="button" class="cta" data-unlock="1">${strings.unlockCta}</button>`,
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
              <div>${escapeHtml(item.title)}</div>
              ${item.username ? `<div class="meta">${escapeHtml(item.username)}</div>` : ""}
            </button>`,
        )
        .join("");
      renderPanel(`<div class="head">${strings.brand}</div>${rows}`, input);
    }

    function escapeHtml(value: string): string {
      return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
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
        hideTimer = window.setTimeout(() => hideOverlay(), 180);
      },
      true,
    );

    browser.runtime.onMessage.addListener((message) => {
      if (message && typeof message === "object" && "type" in message && message.type === AUTOFILL_MSG.unlocked) {
        if (activeInput && document.activeElement === activeInput) {
          void showForInput(activeInput);
        }
      }
    });
  },
});

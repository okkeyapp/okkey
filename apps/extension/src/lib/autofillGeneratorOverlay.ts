/**
 * Autofill overlay password / username generator panels.
 * Password layout mirrors {@link KeyFormPasswordGeneratorPanel} from `@okkey/vault-ui`
 * (KeyFormEditor web popup): settings → value → strength → actions.
 */

import {
  createKeyFormEditorMessages,
  estimatePasswordCrackTimeKey,
  formatKeyFormMessage,
  getPasswordStrength,
  type PasswordStrengthLabelKey,
} from "@okkey/vault-ui";
import { formatWebMessage, type WebLocale } from "@okkey/i18n";

import {
  DEFAULT_PASSWORD_GENERATOR_LENGTH,
  DEFAULT_PASSWORD_GENERATOR_SETTINGS,
  generatePassword,
  getGeneratedPasswordCharKind,
  loadPasswordGeneratorPreferences,
  normalizePasswordGeneratorPreferences,
  PASSWORD_GENERATOR_LENGTH_MAX,
  PASSWORD_GENERATOR_LENGTH_MIN,
  savePasswordGeneratorPreferences,
  type PasswordGeneratorPreferences,
  type PasswordGeneratorSettings,
} from "./passwordGenerator.ts";
import {
  DEFAULT_USERNAME_GENERATOR_PREFERENCES,
  generateUsername,
  loadUsernameGeneratorPreferences,
  normalizeUsernameGeneratorPreferences,
  saveUsernameGeneratorPreferences,
  type UsernameGeneratorPreferences,
} from "./usernameGenerator.ts";

export type GeneratorOverlayKind = "password" | "username";

export type PasswordGeneratorOverlayState = {
  kind: "password";
  preferences: PasswordGeneratorPreferences;
  value: string;
};

export type UsernameGeneratorOverlayState = {
  kind: "username";
  preferences: UsernameGeneratorPreferences;
  value: string;
};

export type GeneratorOverlayState = PasswordGeneratorOverlayState | UsernameGeneratorOverlayState;

export function createPasswordGeneratorState(): PasswordGeneratorOverlayState {
  const preferences = loadPasswordGeneratorPreferences();
  return {
    kind: "password",
    preferences,
    value: generatePassword(preferences, preferences.length),
  };
}

export function createUsernameGeneratorState(): UsernameGeneratorOverlayState {
  const preferences = loadUsernameGeneratorPreferences();
  return {
    kind: "username",
    preferences,
    value: generateUsername(preferences),
  };
}

export function regenerateGeneratorState(state: GeneratorOverlayState): GeneratorOverlayState {
  if (state.kind === "password") {
    return {
      ...state,
      value: generatePassword(state.preferences, state.preferences.length),
    };
  }
  return {
    ...state,
    value: generateUsername(state.preferences),
  };
}

export function updatePasswordGeneratorSettings(
  state: PasswordGeneratorOverlayState,
  patch: Partial<PasswordGeneratorSettings> & { length?: number },
): PasswordGeneratorOverlayState {
  const next = normalizePasswordGeneratorPreferences({ ...state.preferences, ...patch });
  savePasswordGeneratorPreferences(next);
  return {
    kind: "password",
    preferences: next,
    value: generatePassword(next, next.length),
  };
}

export function updateUsernameGeneratorSettings(
  state: UsernameGeneratorOverlayState,
  patch: Partial<UsernameGeneratorPreferences>,
): UsernameGeneratorOverlayState {
  const next = normalizeUsernameGeneratorPreferences({ ...state.preferences, ...patch });
  saveUsernameGeneratorPreferences(next);
  return {
    kind: "username",
    preferences: next,
    value: generateUsername(next),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Match KeyFormEditor / KeyFormPasswordGeneratorPanel: digits lime, symbols orange. */
function coloredPasswordHtml(password: string): string {
  return Array.from(password)
    .map((ch) => {
      const kind = getGeneratedPasswordCharKind(ch);
      const cls =
        kind === "number" ? " gen-num" : kind === "symbol" ? " gen-sym" : "";
      return `<span class="gen-ch${cls}">${escapeHtml(ch)}</span>`;
    })
    .join("");
}

const STRENGTH_COLOR: Record<PasswordStrengthLabelKey, string> = {
  weak: "hsl(0 72% 51%)",
  fair: "hsl(32 95% 44%)",
  good: "hsl(32 95% 44%)",
  strong: "hsl(84 81% 44%)",
  excellent: "hsl(85 85% 35%)",
};

function resolveLocale(ru: boolean): WebLocale {
  return ru ? "ru" : "en";
}

export type GeneratorOverlayStrings = {
  insert: string;
  cancel: string;
  regenerate: string;
  copy: string;
  copied: string;
  uppercase: string;
  lowercase: string;
  numbers: string;
  symbols: string;
  charactersTemplate: string;
  lengthRange: string;
  lengthAria: string;
  capitalize: string;
  includeNumber: string;
  strength: string;
  crackTime: string;
  strengthLabels: Record<PasswordStrengthLabelKey, string>;
  crackTimeLabels: Record<string, string>;
};

export function generatorOverlayStrings(ru: boolean): GeneratorOverlayStrings {
  const locale = resolveLocale(ru);
  const messages = createKeyFormEditorMessages(locale);
  return {
    insert: messages.passwordGenerator.insert,
    cancel: messages.passwordGenerator.cancel,
    regenerate: messages.passwordGenerator.regenerate,
    copy: messages.copy,
    copied: messages.copied,
    uppercase: messages.passwordGenerator.uppercase,
    lowercase: messages.passwordGenerator.lowercase,
    numbers: messages.passwordGenerator.numbers,
    symbols: messages.passwordGenerator.symbols,
    charactersTemplate: messages.passwordGenerator.charactersTemplate,
    lengthRange: messages.passwordGenerator.lengthRange,
    lengthAria: messages.passwordGenerator.lengthAria,
    capitalize: formatWebMessage(locale, "web.tools.generator.username.capitalize"),
    includeNumber: formatWebMessage(locale, "web.tools.generator.username.includeNumber"),
    strength: messages.passwordGenerator.strength,
    crackTime: messages.passwordGenerator.crackTime,
    strengthLabels: { ...messages.passwordStrengthLabels },
    crackTimeLabels: { ...messages.crackTimeLabels },
  };
}

const COPY_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10.6667 8.60004V11.4C10.6667 13.7334 9.73334 14.6667 7.40001 14.6667H4.60001C2.26668 14.6667 1.33334 13.7334 1.33334 11.4V8.60004C1.33334 6.26671 2.26668 5.33337 4.60001 5.33337H7.40001C9.73334 5.33337 10.6667 6.26671 10.6667 8.60004Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.6667 4.60004V7.40004C14.6667 9.73337 13.7333 10.6667 11.4 10.6667H10.6667V8.60004C10.6667 6.26671 9.73334 5.33337 7.40001 5.33337H5.33334V4.60004C5.33334 2.26671 6.26668 1.33337 8.60001 1.33337H11.4C13.7333 1.33337 14.6667 2.26671 14.6667 4.60004Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Plain check — matches `KeyFormPasswordGeneratorPanel` CopySuccessIcon. */
const COPY_SUCCESS_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const REGEN_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M14 8C14 6.4087 13.3679 4.88258 12.2426 3.75736C11.1174 2.63214 9.5913 2 8 2C6.32263 2.00631 4.71265 2.66082 3.50667 3.82667L2 5.33333M5.33333 5.33333H2V2M2 8C2 9.5913 2.63214 11.1174 3.75736 12.2426C4.88258 13.3679 6.4087 14 8 14C9.67737 13.9937 11.2874 13.3392 12.4933 12.1733L14 10.6667M14 14V10.6667H10.6667" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Match key-field / KeyFormEditor generated-password copy success duration. */
export const GENERATOR_COPY_FEEDBACK_MS = 3000;

export function applyGeneratorCopyButtonFeedback(
  button: HTMLElement,
  copied: boolean,
  strings: GeneratorOverlayStrings,
): void {
  button.innerHTML = copied ? COPY_SUCCESS_ICON : COPY_ICON;
  const label = copied ? strings.copied : strings.copy;
  button.title = label;
  button.setAttribute("aria-label", label);
  if (copied) {
    button.setAttribute("data-gen-copied", "1");
  } else {
    button.removeAttribute("data-gen-copied");
  }
}

/** Extra CSS rules for generator panels (append to overlay stylesheet). */
export function generatorOverlayCss(): string {
  return `
          .panel.panel-gen {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            width: min(420px, calc(100vw - 16px));
            padding: 12px;
            gap: 12px;
          }
          .gen-settings {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 12px;
            border-radius: 8px;
            background: hsl(var(--ok-row-muted));
          }
          .gen-charsets {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
          }
          .gen-opt {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            font-weight: 400;
            line-height: 20px;
            color: hsl(var(--ok-fg));
            cursor: pointer;
            user-select: none;
          }
          .gen-opt input {
            width: 16px;
            height: 16px;
            accent-color: hsl(var(--ok-primary));
            cursor: pointer;
          }
          .gen-sep {
            height: 1px;
            margin: 0 -12px;
            background: hsla(var(--ok-fg) / 0.12);
          }
          .gen-length {
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: 100%;
          }
          .gen-length-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            font-size: 14px;
            line-height: 20px;
          }
          .gen-length-label {
            font-weight: 500;
            color: hsl(var(--ok-fg));
          }
          .gen-length-range {
            font-size: 12px;
            font-weight: 400;
            color: hsl(var(--ok-muted));
          }
          .gen-length input[type="range"] {
            width: 100%;
            accent-color: hsl(var(--ok-primary));
            cursor: pointer;
          }
          .gen-output {
            display: flex;
            align-items: center;
            gap: 8px;
            border: 1px solid hsla(var(--ok-fg) / 0.12);
            border-radius: 8px;
            background: hsl(var(--ok-bg));
            padding: 8px 12px;
            min-height: 40px;
          }
          .gen-value {
            flex: 1;
            min-width: 0;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 14px;
            font-weight: 600;
            line-height: 20px;
            word-break: break-all;
            color: hsl(var(--ok-fg));
          }
          .gen-ch.gen-num { color: #65a30d; }
          .gen-ch.gen-sym { color: #ea580c; }
          .gen-icon-btn {
            width: 32px;
            height: 32px;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: hsl(var(--ok-muted));
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            appearance: none;
            outline: none;
            padding: 0;
            transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease;
          }
          .gen-icon-btn:hover {
            background: hsl(var(--ok-hover));
            color: hsl(var(--ok-fg));
          }
          .gen-icon-btn:focus,
          .gen-icon-btn:focus-visible {
            background: hsl(var(--ok-hover));
            color: hsl(var(--ok-fg));
            box-shadow: 0 0 0 2px hsl(var(--ok-primary) / 0.4);
          }
          .gen-opt input:focus,
          .gen-opt input:focus-visible {
            outline: none;
            box-shadow: 0 0 0 2px hsl(var(--ok-primary) / 0.4);
            border-radius: 2px;
          }
          .gen-metrics {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 0 12px;
            font-size: 14px;
            line-height: 20px;
            color: hsl(var(--ok-muted));
          }
          .gen-metrics-value {
            font-weight: 500;
          }
          .gen-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 12px;
          }
          .gen-actions button {
            border-radius: 8px;
            border: 0;
            padding: 8px 16px;
            font: inherit;
            font-size: 14px;
            font-weight: 500;
            line-height: 20px;
            cursor: pointer;
            appearance: none;
            outline: none;
            transition: background-color 150ms ease, filter 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
          }
          .gen-actions button.gen-cancel {
            background: transparent;
            color: hsl(var(--ok-fg));
            border: 1px solid hsla(var(--ok-fg) / 0.16);
          }
          .gen-actions button.gen-cancel:hover {
            background: hsl(var(--ok-hover));
          }
          .gen-actions button.gen-cancel:focus,
          .gen-actions button.gen-cancel:focus-visible {
            background: hsl(var(--ok-hover));
            box-shadow: 0 0 0 2px hsl(var(--ok-primary) / 0.4);
          }
          .gen-actions button.gen-insert {
            background: hsl(var(--ok-primary));
            color: hsl(var(--ok-primary-fg));
          }
          .gen-actions button.gen-insert:hover {
            filter: brightness(0.95);
          }
          .gen-actions button.gen-insert:focus,
          .gen-actions button.gen-insert:focus-visible {
            filter: brightness(0.95);
            box-shadow: 0 0 0 2px hsl(var(--ok-primary) / 0.4);
          }
`;
}

/** In-place DOM refresh so range drag is not killed by remounting the panel. */
export function syncGeneratorPanelDom(
  panel: HTMLElement,
  state: GeneratorOverlayState,
  strings: GeneratorOverlayStrings,
): void {
  const valueEl = panel.querySelector("[data-gen-value]");
  if (valueEl instanceof HTMLElement) {
    valueEl.innerHTML =
      state.kind === "password" ? coloredPasswordHtml(state.value) : escapeHtml(state.value);
  }

  if (state.kind !== "password") {
    return;
  }

  const length = state.preferences.length;
  const lengthInput = panel.querySelector<HTMLInputElement>("[data-gen-length]");
  if (lengthInput && lengthInput.value !== String(length)) {
    lengthInput.value = String(length);
  }

  const lengthLabel = panel.querySelector("[data-gen-length-label]");
  if (lengthLabel instanceof HTMLElement) {
    lengthLabel.textContent = formatKeyFormMessage(strings.charactersTemplate, { count: length });
  }

  const metrics = panel.querySelector(".gen-metrics");
  if (!(metrics instanceof HTMLElement)) {
    return;
  }
  const strength = getPasswordStrength(state.value);
  const crackKey = estimatePasswordCrackTimeKey(state.value);
  const strengthKey = strength?.labelKey ?? "weak";
  const strengthColor = STRENGTH_COLOR[strengthKey];
  metrics.innerHTML = `<span>${escapeHtml(strings.strength)} <span class="gen-metrics-value" style="color:${strengthColor}">${escapeHtml(strings.strengthLabels[strengthKey])}</span></span>
      <span>${escapeHtml(strings.crackTime)} <span class="gen-metrics-value" style="color:${strengthColor}">${escapeHtml(strings.crackTimeLabels[crackKey] ?? crackKey)}</span></span>`;
}

export function generatorPanelHtml(
  state: GeneratorOverlayState,
  strings: GeneratorOverlayStrings,
): string {
  let settingsHtml = "";
  let metricsHtml = "";
  const valueHtml =
    state.kind === "password" ? coloredPasswordHtml(state.value) : escapeHtml(state.value);

  if (state.kind === "password") {
    const s = state.preferences;
    const opts: Array<{ key: keyof PasswordGeneratorSettings; label: string; checked: boolean }> = [
      { key: "uppercase", label: strings.uppercase, checked: s.uppercase },
      { key: "lowercase", label: strings.lowercase, checked: s.lowercase },
      { key: "numbers", label: strings.numbers, checked: s.numbers },
      { key: "symbols", label: strings.symbols, checked: s.symbols },
    ];
    const charactersLabel = formatKeyFormMessage(strings.charactersTemplate, { count: s.length });
    settingsHtml = `<div class="gen-settings">
      <div class="gen-charsets">
        ${opts
          .map(
            (o) =>
              `<label class="gen-opt"><input type="checkbox" data-gen-setting="${o.key}" ${o.checked ? "checked" : ""} /><span>${escapeHtml(o.label)}</span></label>`,
          )
          .join("")}
      </div>
      <div class="gen-sep" role="separator"></div>
      <div class="gen-length">
        <div class="gen-length-row">
          <span class="gen-length-label" data-gen-length-label>${escapeHtml(charactersLabel)}</span>
          <span class="gen-length-range">${escapeHtml(strings.lengthRange)}</span>
        </div>
        <input type="range" data-gen-length min="${PASSWORD_GENERATOR_LENGTH_MIN}" max="${PASSWORD_GENERATOR_LENGTH_MAX}" value="${s.length}" aria-label="${escapeHtml(strings.lengthAria)}" />
      </div>
    </div>`;

    const strength = getPasswordStrength(state.value);
    const crackKey = estimatePasswordCrackTimeKey(state.value);
    const strengthKey = strength?.labelKey ?? "weak";
    const strengthColor = STRENGTH_COLOR[strengthKey];
    metricsHtml = `<div class="gen-metrics">
      <span>${escapeHtml(strings.strength)} <span class="gen-metrics-value" style="color:${strengthColor}">${escapeHtml(strings.strengthLabels[strengthKey])}</span></span>
      <span>${escapeHtml(strings.crackTime)} <span class="gen-metrics-value" style="color:${strengthColor}">${escapeHtml(strings.crackTimeLabels[crackKey] ?? crackKey)}</span></span>
    </div>`;
  } else {
    const p = state.preferences;
    settingsHtml = `<div class="gen-settings">
      <div class="gen-charsets">
        <label class="gen-opt"><input type="checkbox" data-gen-setting="capitalize" ${p.capitalize ? "checked" : ""} /><span>${escapeHtml(strings.capitalize)}</span></label>
        <label class="gen-opt"><input type="checkbox" data-gen-setting="includeNumber" ${p.includeNumber ? "checked" : ""} /><span>${escapeHtml(strings.includeNumber)}</span></label>
      </div>
    </div>`;
  }

  return `<div class="panel panel-gen" data-generator="${state.kind}">
    ${settingsHtml}
    <div class="gen-output">
      <div class="gen-value" data-gen-value>${valueHtml}</div>
      <button type="button" class="gen-icon-btn" data-gen-copy="1" title="${escapeHtml(strings.copy)}" aria-label="${escapeHtml(strings.copy)}">${COPY_ICON}</button>
      <button type="button" class="gen-icon-btn" data-gen-regen="1" title="${escapeHtml(strings.regenerate)}" aria-label="${escapeHtml(strings.regenerate)}">${REGEN_ICON}</button>
    </div>
    ${metricsHtml}
    <div class="gen-actions">
      <button type="button" class="gen-cancel" data-gen-cancel="1">${escapeHtml(strings.cancel)}</button>
      <button type="button" class="gen-insert" data-gen-insert="1">${escapeHtml(strings.insert)}</button>
    </div>
  </div>`;
}

export {
  DEFAULT_PASSWORD_GENERATOR_LENGTH,
  DEFAULT_PASSWORD_GENERATOR_SETTINGS,
  DEFAULT_USERNAME_GENERATOR_PREFERENCES,
};

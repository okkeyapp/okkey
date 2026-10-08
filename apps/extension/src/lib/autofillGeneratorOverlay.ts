/**
 * Compact password / username generator panels for the autofill overlay
 * (ported from web KeyFormEditor /tools/generator — vanilla HTML for the CS shadow root).
 */

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

export type GeneratorOverlayStrings = {
  insert: string;
  cancel: string;
  regenerate: string;
  uppercase: string;
  lowercase: string;
  numbers: string;
  symbols: string;
  length: string;
  capitalize: string;
  includeNumber: string;
  passwordTitle: string;
  usernameTitle: string;
};

export function generatorOverlayStrings(ru: boolean): GeneratorOverlayStrings {
  return ru
    ? {
        insert: "Вставить",
        cancel: "Отмена",
        regenerate: "Обновить",
        uppercase: "A-Z",
        lowercase: "a-z",
        numbers: "0-9",
        symbols: "!@#",
        length: "Длина",
        capitalize: "С заглавной",
        includeNumber: "С числом",
        passwordTitle: "Генератор пароля",
        usernameTitle: "Генератор имени пользователя",
      }
    : {
        insert: "Insert",
        cancel: "Cancel",
        regenerate: "Regenerate",
        uppercase: "A-Z",
        lowercase: "a-z",
        numbers: "0-9",
        symbols: "!@#",
        length: "Length",
        capitalize: "Capitalize",
        includeNumber: "Include number",
        passwordTitle: "Password generator",
        usernameTitle: "Username generator",
      };
}

/** Extra CSS rules for generator panels (append to overlay stylesheet). */
export function generatorOverlayCss(): string {
  return `
          .panel.panel-gen {
            width: min(420px, calc(100vw - 16px));
            padding: 12px;
            gap: 10px;
            align-items: stretch;
          }
          .gen-title {
            font-size: 14px;
            font-weight: 600;
            line-height: 20px;
            color: hsl(var(--ok-fg));
          }
          .gen-output {
            display: flex;
            align-items: center;
            gap: 8px;
            border: 1px solid hsla(var(--ok-fg) / 0.12);
            border-radius: 8px;
            background: hsl(var(--ok-bg));
            padding: 8px 10px;
            min-height: 40px;
          }
          .gen-value {
            flex: 1;
            min-width: 0;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 13px;
            font-weight: 600;
            line-height: 18px;
            word-break: break-all;
            color: hsl(var(--ok-fg));
          }
          .gen-ch.gen-num { color: #3b82f6; }
          .gen-ch.gen-sym { color: #22c55e; }
          .gen-icon-btn {
            width: 28px;
            height: 28px;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: hsl(var(--ok-muted));
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 14px;
            appearance: none;
            outline: none;
          }
          .gen-icon-btn:hover,
          .gen-icon-btn:focus-visible {
            background: hsl(var(--ok-hover));
            color: hsl(var(--ok-fg));
          }
          .gen-opts {
            display: flex;
            flex-wrap: wrap;
            gap: 8px 12px;
            padding: 10px;
            border-radius: 8px;
            background: hsl(var(--ok-row-muted));
          }
          .gen-opt {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            font-weight: 500;
            color: hsl(var(--ok-fg));
            cursor: pointer;
            user-select: none;
          }
          .gen-opt input { accent-color: hsl(var(--ok-primary)); }
          .gen-length {
            display: flex;
            flex-direction: column;
            gap: 6px;
            width: 100%;
          }
          .gen-length-row {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            font-weight: 500;
            color: hsl(var(--ok-fg));
          }
          .gen-length input[type="range"] {
            width: 100%;
            accent-color: hsl(var(--ok-primary));
          }
          .gen-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 2px;
          }
          .gen-actions button {
            border-radius: 8px;
            border: 0;
            padding: 8px 14px;
            font: inherit;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            appearance: none;
            outline: none;
          }
          .gen-actions button.gen-cancel {
            background: transparent;
            color: hsl(var(--ok-fg));
            border: 1px solid hsla(var(--ok-fg) / 0.16);
          }
          .gen-actions button.gen-cancel:hover {
            background: hsl(var(--ok-hover));
          }
          .gen-actions button.gen-insert {
            background: hsl(var(--ok-primary));
            color: hsl(var(--ok-primary-fg));
          }
          .gen-actions button.gen-insert:hover {
            filter: brightness(0.95);
          }
`;
}

export function generatorPanelHtml(
  state: GeneratorOverlayState,
  strings: GeneratorOverlayStrings,
): string {
  const title = state.kind === "password" ? strings.passwordTitle : strings.usernameTitle;
  const valueHtml =
    state.kind === "password" ? coloredPasswordHtml(state.value) : escapeHtml(state.value);

  let optionsHtml = "";
  if (state.kind === "password") {
    const s = state.preferences;
    const opts: Array<{ key: keyof PasswordGeneratorSettings; label: string; checked: boolean }> = [
      { key: "uppercase", label: strings.uppercase, checked: s.uppercase },
      { key: "lowercase", label: strings.lowercase, checked: s.lowercase },
      { key: "numbers", label: strings.numbers, checked: s.numbers },
      { key: "symbols", label: strings.symbols, checked: s.symbols },
    ];
    optionsHtml = `<div class="gen-opts" data-gen-opts="password">
      ${opts
        .map(
          (o) =>
            `<label class="gen-opt"><input type="checkbox" data-gen-setting="${o.key}" ${o.checked ? "checked" : ""} /><span>${escapeHtml(o.label)}</span></label>`,
        )
        .join("")}
      <div class="gen-length">
        <div class="gen-length-row"><span>${escapeHtml(strings.length)}</span><span data-gen-length-label>${s.length}</span></div>
        <input type="range" data-gen-length min="${PASSWORD_GENERATOR_LENGTH_MIN}" max="${PASSWORD_GENERATOR_LENGTH_MAX}" value="${s.length}" />
      </div>
    </div>`;
  } else {
    const p = state.preferences;
    optionsHtml = `<div class="gen-opts" data-gen-opts="username">
      <label class="gen-opt"><input type="checkbox" data-gen-setting="capitalize" ${p.capitalize ? "checked" : ""} /><span>${escapeHtml(strings.capitalize)}</span></label>
      <label class="gen-opt"><input type="checkbox" data-gen-setting="includeNumber" ${p.includeNumber ? "checked" : ""} /><span>${escapeHtml(strings.includeNumber)}</span></label>
    </div>`;
  }

  return `<div class="panel panel-gen" data-generator="${state.kind}">
    <div class="gen-title">${escapeHtml(title)}</div>
    <div class="gen-output">
      <div class="gen-value" data-gen-value>${valueHtml}</div>
      <button type="button" class="gen-icon-btn" data-gen-regen="1" title="${escapeHtml(strings.regenerate)}" aria-label="${escapeHtml(strings.regenerate)}">↻</button>
    </div>
    ${optionsHtml}
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

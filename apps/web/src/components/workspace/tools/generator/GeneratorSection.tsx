import {
  Button,
  Checkbox,
  Input,
  Slider,
  Switch,
  cn,
} from "@okkey/ui";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

import { useLocale } from "../../../../locale/LocaleContext";
import {
  estimatePasswordCrackTimeKey,
  getPasswordStrength,
  passwordStrengthTextClassName,
} from "../../../../lib/passwordStrength";
import {
  generatePassphrase,
  loadPassphraseGeneratorPreferences,
  savePassphraseGeneratorPreferences,
  PASSPHRASE_WORD_COUNT_MAX,
  PASSPHRASE_WORD_COUNT_MIN,
  type PassphraseGeneratorPreferences,
} from "../../../../lib/passphraseGenerator";
import {
  generatePassword,
  getGeneratedPasswordCharKind,
  loadPasswordGeneratorPreferences,
  savePasswordGeneratorPreferences,
  PASSWORD_GENERATOR_LENGTH_MAX,
  PASSWORD_GENERATOR_LENGTH_MIN,
  type PasswordGeneratorPreferences,
  type PasswordGeneratorSettings,
} from "../../../../lib/passwordGenerator";
import {
  generateUsername,
  loadUsernameGeneratorPreferences,
  saveUsernameGeneratorPreferences,
  type UsernameGeneratorPreferences,
} from "../../../../lib/usernameGenerator";
import {
  GeneratorExternalLinkIcon,
  GeneratorPassphraseTabIcon,
  GeneratorPasswordTabIcon,
  GeneratorRefreshIcon,
  GeneratorUsernameTabIcon,
} from "./generatorIcons";

export type GeneratorMode = "password" | "passphrase" | "username";

const GENERATOR_MODES: readonly GeneratorMode[] = ["password", "passphrase", "username"];

const MODE_ICONS: Record<GeneratorMode, typeof GeneratorPasswordTabIcon> = {
  password: GeneratorPasswordTabIcon,
  passphrase: GeneratorPassphraseTabIcon,
  username: GeneratorUsernameTabIcon,
};

const tabButtonClassName = (active: boolean) =>
  cn(
    "relative min-w-0 shrink gap-2 overflow-hidden border",
    active
      ? cn(
          "z-10",
          "!bg-background hover:!bg-background active:!bg-background",
          "hover:!border-input focus:!border-input focus-visible:!border-input",
          "focus:hover:!border-input focus-visible:hover:!border-input",
          "!shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
          "focus:!shadow-[0_1px_2px_rgba(0,0,0,0.05)] focus-visible:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
          "focus:hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)] focus-visible:hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
          "dark:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
          "dark:focus:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:focus-visible:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
          "dark:focus:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:focus-visible:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
        )
      : cn(
          "z-0 border-transparent shadow-none",
          "hover:border-transparent hover:bg-foreground/5",
          "focus:shadow-none focus-visible:shadow-none",
          "dark:focus:shadow-none dark:focus-visible:shadow-none",
          "focus:bg-foreground/10 focus-visible:bg-foreground/10",
          "active:bg-foreground/10",
        ),
  );

function renderColoredPassword(password: string): ReactNode {
  return Array.from(password).map((character, index) => {
    const kind = getGeneratedPasswordCharKind(character);
    const className =
      kind === "number" ? "text-blue-500" : kind === "symbol" ? "text-green-500" : undefined;
    return (
      <span key={`${character}-${index}`} className={className}>
        {character}
      </span>
    );
  });
}

function GeneratorOutputCard({
  value,
  colored,
  onRegenerate,
  regenerateAria,
  showStrength,
  strengthLabel,
  strengthValue,
  strengthClassName,
  crackTimeLabel,
  crackTimeValue,
  crackTimeClassName,
  onCopy,
  copyAria,
}: {
  value: string;
  colored?: boolean;
  onRegenerate: () => void;
  regenerateAria: string;
  showStrength: boolean;
  strengthLabel: string;
  strengthValue: string;
  strengthClassName: string;
  crackTimeLabel: string;
  crackTimeValue: string;
  crackTimeClassName: string;
  onCopy: () => void;
  copyAria: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border transition-[border-color,box-shadow]",
        "has-[[data-generator-copy]:focus]:border-accent",
        "has-[[data-generator-copy]:focus]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
        "has-[[data-generator-copy]:focus-visible]:border-accent",
        "has-[[data-generator-copy]:focus-visible]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
        "dark:has-[[data-generator-copy]:focus]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
        "dark:has-[[data-generator-copy]:focus-visible]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
      )}
    >
      <div className="flex min-h-[100px] items-center gap-4 p-4">
        <span className="size-6 shrink-0" aria-hidden />
        <button
          type="button"
          data-generator-copy
          className="min-w-0 flex-1 break-all text-center text-2xl font-medium leading-tight text-foreground outline-none sm:text-[32px] sm:leading-10"
          onClick={onCopy}
          aria-label={copyAria}
          title={copyAria}
        >
          {colored ? renderColoredPassword(value) : value}
        </button>
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          className="size-6 min-h-6 min-w-6 shrink-0 p-0 text-foreground/50 hover:bg-transparent hover:text-foreground"
          aria-label={regenerateAria}
          onClick={onRegenerate}
        >
          <GeneratorRefreshIcon />
        </Button>
      </div>
      {showStrength ? (
        <div className="flex h-[60px] items-center justify-center gap-4 border-t border-border px-4 text-sm font-medium text-foreground">
          <p>
            {strengthLabel} <span className={cn("font-medium", strengthClassName)}>{strengthValue}</span>
          </p>
          <p>
            {crackTimeLabel}{" "}
            <span className={cn("font-medium", crackTimeClassName)}>{crackTimeValue}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function GeneratorSection() {
  const { t } = useLocale();
  const [mode, setMode] = useState<GeneratorMode>("password");

  const [passwordPreferences, setPasswordPreferences] = useState<PasswordGeneratorPreferences>(
    loadPasswordGeneratorPreferences,
  );
  const [passphrasePreferences, setPassphrasePreferences] =
    useState<PassphraseGeneratorPreferences>(loadPassphraseGeneratorPreferences);
  const [usernamePreferences, setUsernamePreferences] = useState<UsernameGeneratorPreferences>(
    loadUsernameGeneratorPreferences,
  );

  const { length: passwordLength, ...passwordSettings } = passwordPreferences;

  const [passwordValue, setPasswordValue] = useState(() =>
    generatePassword(passwordSettings, passwordLength),
  );
  const [passphraseValue, setPassphraseValue] = useState(() =>
    generatePassphrase(passphrasePreferences),
  );
  const [usernameValue, setUsernameValue] = useState(() => generateUsername(usernamePreferences));
  const [separatorDraft, setSeparatorDraft] = useState(passphrasePreferences.wordSeparator);

  useEffect(() => {
    savePasswordGeneratorPreferences(passwordPreferences);
  }, [passwordPreferences]);

  useEffect(() => {
    savePassphraseGeneratorPreferences(passphrasePreferences);
  }, [passphrasePreferences]);

  useEffect(() => {
    saveUsernameGeneratorPreferences(usernamePreferences);
  }, [usernamePreferences]);

  const activeValue =
    mode === "password" ? passwordValue : mode === "passphrase" ? passphraseValue : usernameValue;
  const strength = getPasswordStrength(activeValue);
  const crackTimeKey = estimatePasswordCrackTimeKey(activeValue);
  const strengthClassName = strength
    ? passwordStrengthTextClassName[strength.labelKey]
    : "text-muted-foreground";
  const showStrength = mode !== "username";

  function regenerate() {
    if (mode === "password") {
      setPasswordValue(generatePassword(passwordSettings, passwordLength));
      return;
    }
    if (mode === "passphrase") {
      setPassphraseValue(generatePassphrase(passphrasePreferences));
      return;
    }
    setUsernameValue(generateUsername(usernamePreferences));
  }

  function updatePasswordSetting(key: keyof PasswordGeneratorSettings, checked: boolean) {
    setPasswordPreferences((current) => {
      const nextSettings: PasswordGeneratorSettings = {
        uppercase: current.uppercase,
        lowercase: current.lowercase,
        numbers: current.numbers,
        symbols: current.symbols,
        [key]: checked,
      };
      if (
        !nextSettings.uppercase &&
        !nextSettings.lowercase &&
        !nextSettings.numbers &&
        !nextSettings.symbols
      ) {
        return current;
      }
      setPasswordValue(generatePassword(nextSettings, current.length));
      return { ...nextSettings, length: current.length };
    });
  }

  function updatePasswordLength(nextLength: number) {
    setPasswordPreferences((current) => {
      const length = Math.min(
        PASSWORD_GENERATOR_LENGTH_MAX,
        Math.max(PASSWORD_GENERATOR_LENGTH_MIN, nextLength),
      );
      const settings: PasswordGeneratorSettings = {
        uppercase: current.uppercase,
        lowercase: current.lowercase,
        numbers: current.numbers,
        symbols: current.symbols,
      };
      setPasswordValue(generatePassword(settings, length));
      return { ...settings, length };
    });
  }

  function updatePassphrasePreferences(patch: Partial<PassphraseGeneratorPreferences>) {
    setPassphrasePreferences((current) => {
      const next = { ...current, ...patch };
      if (patch.wordSeparator !== undefined) {
        next.wordSeparator =
          patch.wordSeparator.length > 1 ? patch.wordSeparator[0]! : patch.wordSeparator;
      }
      if (patch.numWords !== undefined) {
        next.numWords = Math.min(
          PASSPHRASE_WORD_COUNT_MAX,
          Math.max(PASSPHRASE_WORD_COUNT_MIN, Math.round(patch.numWords)),
        );
      }
      setPassphraseValue(generatePassphrase(next));
      return next;
    });
  }

  function commitSeparatorDraft(raw: string) {
    const next = raw.length === 0 ? "-" : raw.length > 1 ? raw[0]! : raw;
    setSeparatorDraft(next);
    updatePassphrasePreferences({ wordSeparator: next });
  }

  function updateUsernamePreferences(patch: Partial<UsernameGeneratorPreferences>) {
    setUsernamePreferences((current) => {
      const next = { ...current, ...patch };
      setUsernameValue(generateUsername(next));
      return next;
    });
  }

  async function copyActiveValue() {
    try {
      await navigator.clipboard.writeText(activeValue);
      window.dispatchEvent(new CustomEvent("okkey:sensitive-clipboard"));
      toast.success(t("web.keyForm.copied"));
    } catch {
      /* ignore */
    }
  }

  const passwordOptions: Array<{ key: keyof PasswordGeneratorSettings; label: string }> = [
    { key: "uppercase", label: t("web.keyForm.passwordGenerator.uppercase") },
    { key: "lowercase", label: t("web.keyForm.passwordGenerator.lowercase") },
    { key: "numbers", label: t("web.keyForm.passwordGenerator.numbers") },
    { key: "symbols", label: t("web.keyForm.passwordGenerator.symbols") },
  ];

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold leading-7 text-foreground">
          {t("web.tools.sections.generator")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">
          {t("web.tools.generator.intro")}{" "}
          <a
            href={t("web.tools.generator.learnMoreUrl")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
          >
            {t("web.tools.generator.learnMore")}
            <GeneratorExternalLinkIcon />
          </a>
        </p>
      </div>

      <div className="flex w-full min-w-0 items-center justify-center">
        <div
          className="relative flex w-fit max-w-full min-w-0 rounded-lg bg-secondary p-1"
          role="tablist"
          aria-label={t("web.tools.generator.tabsAria")}
        >
          {GENERATOR_MODES.map((value) => {
            const active = mode === value;
            const Icon = MODE_ICONS[value];
            return (
              <Button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                size="sm"
                variant={active ? "outline" : "ghost"}
                className={tabButtonClassName(active)}
                onClick={() => setMode(value)}
              >
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{t(`web.tools.generator.modes.${value}`)}</span>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <GeneratorOutputCard
          value={activeValue}
          colored={mode === "password"}
          onRegenerate={regenerate}
          regenerateAria={t("web.tools.generator.regenerateAria")}
          showStrength={showStrength}
          strengthLabel={t("web.keyForm.passwordGenerator.strength")}
          strengthValue={t(`web.keyForm.strength.${strength?.labelKey ?? "weak"}`)}
          strengthClassName={strengthClassName}
          crackTimeLabel={t("web.keyForm.passwordGenerator.crackTime")}
          crackTimeValue={t(`web.keyForm.crackTime.${crackTimeKey}`)}
          crackTimeClassName={strengthClassName}
          onCopy={() => void copyActiveValue()}
          copyAria={t("web.tools.generator.copyAria")}
        />

        {mode === "password" ? (
          <div className="overflow-hidden rounded-xl bg-secondary">
            <div className="flex min-h-[60px] items-center px-4 py-4">
              <div className="flex w-full items-center gap-3">
                <p className="shrink-0 text-sm font-medium text-foreground">
                  {t("web.keyForm.passwordGenerator.characters", { count: passwordLength })}
                </p>
                <Slider
                  className="min-w-0 flex-1 [&>span:first-child]:bg-background"
                  value={[passwordLength]}
                  min={PASSWORD_GENERATOR_LENGTH_MIN}
                  max={PASSWORD_GENERATOR_LENGTH_MAX}
                  step={1}
                  onValueChange={(value) => updatePasswordLength(value[0] ?? passwordLength)}
                  aria-label={t("web.keyForm.passwordGenerator.lengthAria")}
                />
              </div>
            </div>
            <div className="flex border-t border-border">
              {passwordOptions.map((option, index) => (
                <label
                  key={option.key}
                  className={cn(
                    "flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2 px-4 py-[18px] text-sm font-medium text-foreground",
                    index > 0 && "border-l border-border",
                  )}
                >
                  <Checkbox
                    checked={passwordSettings[option.key]}
                    onCheckedChange={(checked) => updatePasswordSetting(option.key, checked === true)}
                  />
                  <span className="truncate">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {mode === "passphrase" ? (
          <div className="overflow-hidden rounded-xl bg-secondary">
            <div className="flex min-h-[60px] items-center px-4 py-4">
              <div className="flex w-full items-center gap-3">
                <p className="shrink-0 text-sm font-medium text-foreground">
                  {t("web.tools.generator.passphrase.words", { count: passphrasePreferences.numWords })}
                </p>
                <Slider
                  className="min-w-0 flex-1 [&>span:first-child]:bg-background"
                  value={[passphrasePreferences.numWords]}
                  min={PASSPHRASE_WORD_COUNT_MIN}
                  max={PASSPHRASE_WORD_COUNT_MAX}
                  step={1}
                  onValueChange={(value) =>
                    updatePassphrasePreferences({ numWords: value[0] ?? passphrasePreferences.numWords })
                  }
                  aria-label={t("web.tools.generator.passphrase.wordsAria")}
                />
              </div>
            </div>
            <div className="flex flex-col border-t border-border sm:flex-row">
              <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-[18px]">
                <p className="shrink-0 text-sm font-medium text-foreground">
                  {t("web.tools.generator.passphrase.separator")}
                </p>
                <Input
                  value={separatorDraft}
                  maxLength={1}
                  className="h-8 w-12 text-center"
                  aria-label={t("web.tools.generator.passphrase.separatorAria")}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSeparatorDraft(next);
                    if (next.length === 1) {
                      updatePassphrasePreferences({ wordSeparator: next });
                    }
                  }}
                  onBlur={() => commitSeparatorDraft(separatorDraft)}
                />
              </div>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 border-t border-border px-4 py-[18px] sm:border-l sm:border-t-0">
                <span className="text-sm font-medium text-foreground">
                  {t("web.tools.generator.passphrase.capitalize")}
                </span>
                <Switch
                  checked={passphrasePreferences.capitalize}
                  onCheckedChange={(checked) => updatePassphrasePreferences({ capitalize: checked })}
                />
              </label>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 border-t border-border px-4 py-[18px] sm:border-l sm:border-t-0">
                <span className="text-sm font-medium text-foreground">
                  {t("web.tools.generator.passphrase.includeNumber")}
                </span>
                <Switch
                  checked={passphrasePreferences.includeNumber}
                  onCheckedChange={(checked) =>
                    updatePassphrasePreferences({ includeNumber: checked })
                  }
                />
              </label>
            </div>
          </div>
        ) : null}

        {mode === "username" ? (
          <div className="overflow-hidden rounded-xl bg-secondary">
            <div className="flex flex-col sm:flex-row">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 px-4 py-[18px]">
                <span className="text-sm font-medium text-foreground">
                  {t("web.tools.generator.username.capitalize")}
                </span>
                <Switch
                  checked={usernamePreferences.capitalize}
                  onCheckedChange={(checked) => updateUsernamePreferences({ capitalize: checked })}
                />
              </label>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 border-t border-border px-4 py-[18px] sm:border-l sm:border-t-0">
                <span className="text-sm font-medium text-foreground">
                  {t("web.tools.generator.username.includeNumber")}
                </span>
                <Switch
                  checked={usernamePreferences.includeNumber}
                  onCheckedChange={(checked) =>
                    updateUsernamePreferences({ includeNumber: checked })
                  }
                />
              </label>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

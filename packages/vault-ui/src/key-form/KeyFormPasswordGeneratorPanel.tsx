import { useState, type ReactNode, type SVGProps } from "react";
import {
  Button,
  Checkbox,
  Separator,
  Slider,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@okkey/ui";

import {
  formatKeyFormMessage,
  type KeyFormEditorMessages,
} from "./keyFormI18n.js";
import {
  estimatePasswordCrackTimeKey,
  getPasswordStrength,
  passwordStrengthTextClassName,
} from "../lib/passwordStrength.js";

export type KeyFormPasswordGeneratorSettings = {
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
};

export type KeyFormPasswordGeneratorPanelProps = {
  messages: KeyFormEditorMessages;
  settings: KeyFormPasswordGeneratorSettings;
  length: number;
  generatedPassword: string;
  lengthMin?: number;
  lengthMax?: number;
  /** Soften icon hover on additional-section surfaces. */
  additionalSectionHover?: boolean;
  onSettingChange: (key: keyof KeyFormPasswordGeneratorSettings, checked: boolean) => void;
  onLengthChange: (length: number) => void;
  onRegenerate: () => void;
  onCopy: () => void | Promise<void>;
  onCancel: () => void;
  onInsert: () => void;
};

const SYMBOL_SET = "!@#$%^&*";

function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M10.6667 8.60004V11.4C10.6667 13.7334 9.73334 14.6667 7.40001 14.6667H4.60001C2.26668 14.6667 1.33334 13.7334 1.33334 11.4V8.60004C1.33334 6.26671 2.26668 5.33337 4.60001 5.33337H7.40001C9.73334 5.33337 10.6667 6.26671 10.6667 8.60004Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.6667 4.60004V7.40004C14.6667 9.73337 13.7333 10.6667 11.4 10.6667H10.6667V8.60004C10.6667 6.26671 9.73334 5.33337 7.40001 5.33337H5.33334V4.60004C5.33334 2.26671 6.26668 1.33337 8.60001 1.33337H11.4C13.7333 1.33337 14.6667 2.26671 14.6667 4.60004Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopySuccessIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RegeneratePasswordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M14 8C14 6.4087 13.3679 4.88258 12.2426 3.75736C11.1174 2.63214 9.5913 2 8 2C6.32263 2.00631 4.71265 2.66082 3.50667 3.82667L2 5.33333M5.33333 5.33333H2V2M2 8C2 9.5913 2.63214 11.1174 3.75736 12.2426C4.88258 13.3679 6.4087 14 8 14C9.67737 13.9937 11.2874 13.3392 12.4933 12.1733L14 10.6667M14 14V10.6667H10.6667"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function renderKeyFormGeneratedPassword(password: string): ReactNode {
  return Array.from(password).map((character, index) => {
    const key = `${character}-${index}`;
    if (/\d/.test(character)) {
      return (
        <span key={key} className="text-lime-600">
          {character}
        </span>
      );
    }
    if (SYMBOL_SET.includes(character)) {
      return (
        <span key={key} className="text-orange-600">
          {character}
        </span>
      );
    }
    return <span key={key}>{character}</span>;
  });
}

/**
 * Password generator panel used by KeyFormEditor (and mirrored by the extension
 * autofill overlay). Layout: settings (charsets + length) → value → strength → actions.
 */
export function KeyFormPasswordGeneratorPanel({
  messages,
  settings,
  length,
  generatedPassword,
  lengthMin = 4,
  lengthMax = 128,
  additionalSectionHover = false,
  onSettingChange,
  onLengthChange,
  onRegenerate,
  onCopy,
  onCancel,
  onInsert,
}: KeyFormPasswordGeneratorPanelProps) {
  const [copied, setCopied] = useState(false);
  const options: Array<{ key: keyof KeyFormPasswordGeneratorSettings; label: string }> = [
    { key: "uppercase", label: messages.passwordGenerator.uppercase },
    { key: "lowercase", label: messages.passwordGenerator.lowercase },
    { key: "numbers", label: messages.passwordGenerator.numbers },
    { key: "symbols", label: messages.passwordGenerator.symbols },
  ];
  const generatedStrength = getPasswordStrength(generatedPassword);
  const crackTimeKey = estimatePasswordCrackTimeKey(generatedPassword);

  async function handleCopy() {
    await onCopy();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-3" data-password-generator-panel-body>
      <div className="flex flex-col gap-3 rounded-lg bg-secondary p-3">
        <div className="flex items-center justify-between gap-4">
          {options.map((option) => (
            <label
              key={option.key}
              className="flex cursor-pointer select-none items-center gap-2 text-sm text-foreground"
            >
              <Checkbox
                checked={settings[option.key]}
                onCheckedChange={(checked) => onSettingChange(option.key, checked === true)}
              />
              {option.label}
            </label>
          ))}
        </div>

        <Separator className="-mx-3 w-auto self-stretch bg-border" />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-foreground">
              {formatKeyFormMessage(messages.passwordGenerator.charactersTemplate, {
                count: length,
              })}
            </span>
            <span className="text-xs text-muted-foreground">{messages.passwordGenerator.lengthRange}</span>
          </div>
          <Slider
            value={[length]}
            min={lengthMin}
            max={lengthMax}
            step={1}
            onValueChange={(value) => onLengthChange(value[0] ?? length)}
            aria-label={messages.passwordGenerator.lengthAria}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <span className="min-w-0 flex-1 break-all font-mono text-sm font-semibold leading-5 text-foreground">
          {renderKeyFormGeneratedPassword(generatedPassword)}
        </span>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                className={cn(
                  "size-8 min-h-8 min-w-8 text-muted-foreground hover:text-foreground",
                  additionalSectionHover && "hover:!bg-secondary",
                )}
                aria-label={messages.passwordGenerator.copyGeneratedAria}
                onClick={() => void handleCopy()}
              >
                {copied ? <CopySuccessIcon className="size-4" /> : <CopyIcon className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? messages.copied : messages.copy}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                className={cn(
                  "size-8 min-h-8 min-w-8 text-muted-foreground hover:text-foreground",
                  additionalSectionHover && "hover:!bg-secondary",
                )}
                aria-label={messages.passwordGenerator.regenerateAria}
                onClick={onRegenerate}
              >
                <RegeneratePasswordIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{messages.passwordGenerator.regenerate}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex items-center justify-between gap-3 px-3 text-sm">
        <span className="min-w-0 truncate text-muted-foreground">
          {messages.passwordGenerator.strength}{" "}
          {generatedStrength ? (
            <span className={cn("font-medium", passwordStrengthTextClassName[generatedStrength.labelKey])}>
              {messages.passwordStrengthLabels[generatedStrength.labelKey]}
            </span>
          ) : (
            <span className="font-medium text-muted-foreground">
              {messages.passwordStrengthLabels.weak}
            </span>
          )}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {messages.passwordGenerator.crackTime}{" "}
          <span
            className={cn(
              "font-medium",
              generatedStrength
                ? passwordStrengthTextClassName[generatedStrength.labelKey]
                : "text-muted-foreground",
            )}
          >
            {messages.crackTimeLabels[crackTimeKey]}
          </span>
        </span>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {messages.passwordGenerator.cancel}
        </Button>
        <Button type="button" onClick={onInsert}>
          {messages.passwordGenerator.insert}
        </Button>
      </div>
    </div>
  );
}

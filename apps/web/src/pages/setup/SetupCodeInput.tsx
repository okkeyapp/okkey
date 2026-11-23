import { Input } from "@okkey/ui";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import {
  SETUP_CODE_GROUP_COUNT,
  SETUP_CODE_GROUP_SIZE,
  SETUP_CODE_LENGTH,
  formatSetupCodeGroups,
  normalizeSetupCodeHex,
} from "./setupCodeFormat";

export { SETUP_CODE_LENGTH, formatSetupCodeGroups } from "./setupCodeFormat";

const cellClassName =
  "h-[54px] w-full min-w-0 p-0 text-center font-mono text-lg font-semibold uppercase tracking-wide";

function emptyDigits(): string[] {
  return Array.from({ length: SETUP_CODE_LENGTH }, () => "");
}

type SetupCodeInputProps = {
  onChange: (formattedCode: string) => void;
  onComplete?: (formattedCode: string) => void;
  digitAriaLabel: (index: number, total: number) => string;
  labelledBy?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  resetKey?: string | number;
};

/**
 * Multi-cell setup-code entry modeled on {@link SixDigitCodeInput} / Auth TOTP,
 * adapted for the 16-character hex install code (4 groups of 4).
 */
export function SetupCodeInput({
  onChange,
  onComplete,
  digitAriaLabel,
  labelledBy,
  disabled = false,
  autoFocus = true,
  resetKey,
}: SetupCodeInputProps) {
  const [digits, setDigits] = useState(emptyDigits);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const onChangeRef = useRef(onChange);
  const onCompleteRef = useRef(onComplete);
  onChangeRef.current = onChange;
  onCompleteRef.current = onComplete;
  const lastCompletedRef = useRef<string | null>(null);

  useEffect(() => {
    setDigits(emptyDigits());
    lastCompletedRef.current = null;
    onChangeRef.current("");
    if (autoFocus) {
      const handle = window.setTimeout(() => inputsRef.current[0]?.focus(), 0);
      return () => window.clearTimeout(handle);
    }
    return undefined;
  }, [resetKey, autoFocus]);

  useEffect(() => {
    const joined = digits.join("");
    const formatted = formatSetupCodeGroups(joined);
    onChangeRef.current(formatted);
    if (joined.length === SETUP_CODE_LENGTH && lastCompletedRef.current !== formatted) {
      lastCompletedRef.current = formatted;
      onCompleteRef.current?.(formatted);
    }
  }, [digits]);

  const setDigitAt = useCallback((index: number, char: string) => {
    const d = normalizeSetupCodeHex(char).slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = d;
      return next;
    });
    if (d && index < SETUP_CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }, []);

  const applyPaste = useCallback((raw: string) => {
    const pasted = normalizeSetupCodeHex(raw);
    if (!pasted) {
      return;
    }
    setDigits(Array.from({ length: SETUP_CODE_LENGTH }, (_, i) => pasted[i] ?? ""));
    inputsRef.current[Math.min(pasted.length, SETUP_CODE_LENGTH - 1)]?.focus();
  }, []);

  const handleCellChange = useCallback(
    (index: number, raw: string) => {
      if (raw.length > 1) {
        applyPaste(raw);
        return;
      }
      setDigitAt(index, raw);
    },
    [applyPaste, setDigitAt],
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
      if (e.key === "ArrowLeft" && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
      if (e.key === "ArrowRight" && index < SETUP_CODE_LENGTH - 1) {
        inputsRef.current[index + 1]?.focus();
      }
    },
    [digits],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      applyPaste(e.clipboardData.getData("text"));
    },
    [applyPaste],
  );

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      data-testid="setup-code-input"
      className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5"
    >
      {Array.from({ length: SETUP_CODE_GROUP_COUNT }, (_, groupIndex) => (
        <div
          key={groupIndex}
          className="grid min-w-0 flex-1 grid-cols-4 gap-1.5"
        >
          {Array.from({ length: SETUP_CODE_GROUP_SIZE }, (_, cellOffset) => {
            const index = groupIndex * SETUP_CODE_GROUP_SIZE + cellOffset;
            return (
              <Input
                key={index}
                ref={(el) => {
                  inputsRef.current[index] = el;
                }}
                id={index === 0 ? "setup-code" : undefined}
                type="text"
                inputMode="text"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                autoCapitalize="characters"
                spellCheck={false}
                name={`setup-code-digit-${index}`}
                maxLength={1}
                value={digits[index] ?? ""}
                disabled={disabled}
                aria-label={digitAriaLabel(index + 1, SETUP_CODE_LENGTH)}
                className={cellClassName}
                onChange={(event) => handleCellChange(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={index === 0 ? handlePaste : undefined}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

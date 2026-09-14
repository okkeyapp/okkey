import { Input } from "@okkey/ui";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

export const TOTP_CODE_LENGTH = 6;

const cellClassName =
  "h-[54px] w-full min-w-0 p-0 text-center text-lg font-semibold tabular-nums";

function emptyDigits(): string[] {
  return Array.from({ length: TOTP_CODE_LENGTH }, () => "");
}

type SixDigitCodeInputProps = {
  /** Controlled only via resetKey clears; parent tracks joined code through onChange. */
  onChange: (code: string) => void;
  /** Fires once when all digits are filled (caller decides auto-submit policy). */
  onComplete?: (code: string) => void;
  digitAriaLabel: (index: number, total: number) => string;
  labelledBy?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  resetKey?: string | number;
};

export function SixDigitCodeInput({
  onChange,
  onComplete,
  digitAriaLabel,
  labelledBy,
  disabled = false,
  autoFocus = true,
  resetKey,
}: SixDigitCodeInputProps) {
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
    const next = digits.join("");
    onChangeRef.current(next);
    if (next.length === TOTP_CODE_LENGTH && lastCompletedRef.current !== next) {
      lastCompletedRef.current = next;
      onCompleteRef.current?.(next);
    }
  }, [digits]);

  const setDigitAt = useCallback((index: number, char: string) => {
    const d = char.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = d;
      return next;
    });
    if (d && index < TOTP_CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }, []);

  const handleCellChange = useCallback(
    (index: number, raw: string) => {
      if (raw.length > 1) {
        const pasted = raw.replace(/\D/g, "").slice(0, TOTP_CODE_LENGTH);
        if (pasted) {
          setDigits(Array.from({ length: TOTP_CODE_LENGTH }, (_, i) => pasted[i] ?? ""));
          inputsRef.current[Math.min(pasted.length, TOTP_CODE_LENGTH - 1)]?.focus();
        }
        return;
      }
      setDigitAt(index, raw);
    },
    [setDigitAt],
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
      if (e.key === "ArrowLeft" && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
      if (e.key === "ArrowRight" && index < TOTP_CODE_LENGTH - 1) {
        inputsRef.current[index + 1]?.focus();
      }
    },
    [digits],
  );

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, TOTP_CODE_LENGTH);
    if (!text) {
      return;
    }
    setDigits(Array.from({ length: TOTP_CODE_LENGTH }, (_, i) => text[i] ?? ""));
    inputsRef.current[Math.min(text.length, TOTP_CODE_LENGTH - 1)]?.focus();
  }, []);

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="grid w-full grid-cols-6 gap-2.5"
    >
      {digits.map((digit, index) => (
        <Input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          name={`totp-digit-${index}`}
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={digitAriaLabel(index + 1, TOTP_CODE_LENGTH)}
          className={cellClassName}
          onChange={(event) => handleCellChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={index === 0 ? handlePaste : undefined}
        />
      ))}
    </div>
  );
}

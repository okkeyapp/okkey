import { Input } from "@okkey/ui";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import {
  SETUP_CODE_LENGTH,
  formatSetupCodeGroups,
  normalizeSetupCodeHex,
} from "./setupCodeFormat";

export { SETUP_CODE_LENGTH, formatSetupCodeGroups } from "./setupCodeFormat";

type SetupCodeInputProps = {
  onChange: (formattedCode: string) => void;
  onComplete?: (formattedCode: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  resetKey?: string | number;
};

/**
 * Single-line setup-code entry for the 16-character hex install code
 * (displayed as 4 groups of 4).
 */
export function SetupCodeInput({
  onChange,
  onComplete,
  disabled = false,
  autoFocus = true,
  resetKey,
}: SetupCodeInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const onCompleteRef = useRef(onComplete);
  onChangeRef.current = onChange;
  onCompleteRef.current = onComplete;
  const lastCompletedRef = useRef<string | null>(null);

  useEffect(() => {
    setValue("");
    lastCompletedRef.current = null;
    onChangeRef.current("");
    if (autoFocus) {
      const handle = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(handle);
    }
    return undefined;
  }, [resetKey, autoFocus]);

  const applyValue = (raw: string) => {
    const formatted = formatSetupCodeGroups(raw);
    setValue(formatted);
    onChangeRef.current(formatted);
    const hex = normalizeSetupCodeHex(formatted);
    if (hex.length === SETUP_CODE_LENGTH && lastCompletedRef.current !== formatted) {
      lastCompletedRef.current = formatted;
      onCompleteRef.current?.(formatted);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    applyValue(event.target.value);
  };

  return (
    <Input
      ref={inputRef}
      id="setup-code"
      name="setup-code"
      type="text"
      inputMode="text"
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      disabled={disabled}
      value={value}
      data-testid="setup-code-input"
      className="font-mono tracking-wide uppercase"
      onChange={handleChange}
    />
  );
}

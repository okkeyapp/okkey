import * as React from "react";

import { keyFieldDateDisplayFormat } from "../../lib/date-field.js";
import { cn } from "../../lib/utils.js";

export type KeyFieldDateInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  placeholder?: string;
};

export function KeyFieldDateInput({
  value,
  onValueChange,
  onFocus,
  onBlur,
  className,
  inputRef,
  placeholder = keyFieldDateDisplayFormat.toLowerCase(),
}: KeyFieldDateInputProps) {
  return (
    <input
      ref={inputRef}
      value={value}
      placeholder={placeholder}
      inputMode="numeric"
      onChange={(event) => onValueChange(event.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        "h-5 w-full min-w-0 bg-transparent p-0 text-sm leading-5 text-foreground outline-none",
        className,
      )}
    />
  );
}

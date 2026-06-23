import {
  keyFieldRecoveryCodesConcealedLine,
  type KeyFieldRecoveryCodesValue,
} from "../../lib/key-field-recovery-codes.js";
import { cn } from "../../lib/utils.js";
import { Checkbox } from "./checkbox.js";

export type KeyFieldRecoveryCodesConcealedViewProps = {
  codes: KeyFieldRecoveryCodesValue;
  className?: string;
};

export function KeyFieldRecoveryCodesConcealedView({ codes, className }: KeyFieldRecoveryCodesConcealedViewProps) {
  if (codes.length === 0) {
    return <span className={cn("text-sm leading-5 text-muted-foreground", className)}>No recovery codes</span>;
  }

  return <span className={cn("text-sm leading-5 text-foreground", className)}>{keyFieldRecoveryCodesConcealedLine}</span>;
}

export type KeyFieldRecoveryCodesChecklistViewProps = {
  codes: KeyFieldRecoveryCodesValue;
  readOnly?: boolean;
  onToggleUsed?: (index: number, used: boolean) => void;
  className?: string;
};

export function KeyFieldRecoveryCodesChecklistView({
  codes,
  readOnly = false,
  onToggleUsed,
  className,
}: KeyFieldRecoveryCodesChecklistViewProps) {
  if (codes.length === 0) {
    return <span className={cn("text-sm leading-5 text-muted-foreground", className)}>No recovery codes</span>;
  }

  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      {codes.map((item, index) => (
        <label
          key={`${item.code}-${index}`}
          className={cn(
            "flex min-w-0 items-center gap-2 text-sm leading-5 text-foreground",
            readOnly && "cursor-default",
          )}
        >
          <Checkbox
            checked={item.used}
            disabled={readOnly}
            onCheckedChange={readOnly ? undefined : (checked) => onToggleUsed?.(index, checked === true)}
          />
          <span className={cn("min-w-0 break-all font-mono", item.used && "text-muted-foreground line-through")}>{item.code}</span>
        </label>
      ))}
    </div>
  );
}

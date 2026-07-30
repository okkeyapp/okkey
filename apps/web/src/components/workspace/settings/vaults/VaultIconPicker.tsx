import { Button, Popover, PopoverContent, PopoverTrigger, ScrollArea, cn } from "@okkey/ui";
import { useState } from "react";

import { VAULT_ICON_EMOJIS } from "./vaultIcons";

type VaultIconPickerProps = {
  value: string;
  onChange: (icon: string) => void;
  label: string;
  disabled?: boolean;
};

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function VaultIconPicker({ value, onChange, label, disabled }: VaultIconPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-10 shrink-0 gap-2 py-0 pe-3 ps-[3px] font-normal shadow-xs"
          aria-label={label}
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-secondary text-sm leading-none">
            {value}
          </span>
          <span>{label}</span>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] overflow-hidden p-0">
        <ScrollArea className="max-h-[240px] w-full">
          <div className="grid grid-cols-8 gap-1 p-2">
            {VAULT_ICON_EMOJIS.map((emoji) => {
              const selected = emoji === value;
              return (
                <button
                  key={emoji}
                  type="button"
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md text-base leading-none outline-none",
                    "hover:bg-secondary",
                    selected && "bg-secondary ring-2 ring-accent",
                  )}
                  onClick={() => {
                    onChange(emoji);
                    setOpen(false);
                  }}
                  aria-label={emoji}
                  aria-pressed={selected}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

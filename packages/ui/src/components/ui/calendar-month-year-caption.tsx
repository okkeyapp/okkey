import * as React from "react";
import { format } from "date-fns";
import type { Locale } from "date-fns";
import { useDayPicker, type MonthCaptionProps } from "react-day-picker";

import { cn } from "../../lib/utils.js";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.js";
import { ScrollArea } from "./scroll-area.js";
import { CheckIcon, ChevronDownIcon } from "./select-icons.js";

const englishMonthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

type CaptionMenuProps = {
  value: string;
  ariaLabel: string;
  triggerClassName: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onValueChange: (value: string) => void;
};

/**
 * Popover listbox (same family as country SearchableSelect) instead of Radix Select.
 * Radix Select uses RemoveScroll + disableOutsidePointerEvents + FocusScope; inside
 * KeyFieldPortaledOverlay that combination self-dismisses after overlay/autofill churn.
 * Popover stays open under the same conditions (proven by address country field).
 */
function CaptionMenu({ value, ariaLabel, triggerClassName, options, onValueChange }: CaptionMenuProps) {
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  const selected = options.find((option) => option.value === value);

  function choose(next: string) {
    onValueChange(next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          data-state={open ? "open" : "closed"}
          className={cn(
            "flex h-8 items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-left text-sm text-foreground outline-none",
            "hover:border-accent data-[state=open]:border-accent data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
            triggerClassName,
          )}
        >
          <span className="min-w-0 truncate">{selected?.label ?? value}</span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={2}
        className="w-[var(--radix-popover-trigger-width)] min-w-[max(var(--radix-popover-trigger-width),9.5rem)] border border-input p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) {
            event.preventDefault();
            return;
          }
          // Autofill host / body pointer-events shim must not dismiss the menu.
          if (
            target === document.body ||
            target === document.documentElement ||
            target.closest("[data-okkey-autofill]")
          ) {
            event.preventDefault();
          }
        }}
      >
        <ScrollArea className="w-full max-h-[min(15rem,var(--radix-popover-content-available-height,80vh))] shrink-0">
          <div id={listId} role="listbox" aria-label={ariaLabel} className="p-1">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
                    "hover:bg-secondary focus:bg-secondary",
                    isSelected && "bg-secondary",
                  )}
                  onClick={() => choose(option.value)}
                >
                  {isSelected ? (
                    <span className="absolute left-2 top-1/2 flex size-3.5 -translate-y-1/2 items-center justify-center">
                      <CheckIcon className="size-4" />
                    </span>
                  ) : null}
                  {option.label}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function CalendarMonthYearCaption({ calendarMonth }: MonthCaptionProps) {
  const { goToMonth, dayPickerProps } = useDayPicker();
  const date = calendarMonth.date;
  const month = date.getMonth();
  const year = date.getFullYear();
  const pickerLocale = dayPickerProps.locale as Locale | undefined;
  const startYear = (dayPickerProps.startMonth ?? new Date(new Date().getFullYear() - 100, 0)).getFullYear();
  const endYear = (dayPickerProps.endMonth ?? new Date(new Date().getFullYear() + 10, 11)).getFullYear();

  const monthOptions = React.useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        value: String(index),
        label: pickerLocale
          ? format(new Date(2024, index, 1), "LLLL", { locale: pickerLocale })
          : (englishMonthNames[index] ?? String(index + 1)),
      })),
    [pickerLocale],
  );

  const yearOptions = React.useMemo(
    () =>
      Array.from({ length: endYear - startYear + 1 }, (_, index) => {
        const optionYear = startYear + index;
        return { value: String(optionYear), label: String(optionYear) };
      }),
    [endYear, startYear],
  );

  function goToMonthIndex(nextMonth: number) {
    goToMonth(new Date(year, nextMonth, 1));
  }

  function goToYear(nextYear: number) {
    goToMonth(new Date(nextYear, month, 1));
  }

  return (
    <div className="flex h-[--cell-size] w-full items-center justify-center gap-2 px-1">
      <CaptionMenu
        value={String(month)}
        ariaLabel="Choose the month"
        triggerClassName="w-[9.5rem]"
        options={monthOptions}
        onValueChange={(value) => goToMonthIndex(Number(value))}
      />
      <CaptionMenu
        value={String(year)}
        ariaLabel="Choose the year"
        triggerClassName="w-[5.5rem]"
        options={yearOptions}
        onValueChange={(value) => goToYear(Number(value))}
      />
    </div>
  );
}

export { CalendarMonthYearCaption };

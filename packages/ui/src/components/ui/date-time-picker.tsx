import * as React from "react";
import type { Locale } from "date-fns";

import {
  DATE_TIME_PICKER_BODY_LAYOUT_CLASS,
  DATE_TIME_PICKER_CALENDAR_SCROLL_CLASS,
  DATE_TIME_PICKER_POPOVER_CONTENT_CLASS,
  DATE_TIME_PICKER_TIME_COLUMN_CLASS,
  DATE_TIME_PICKER_TIME_SCROLL_CLASS,
  resolveDateTimePickerPlacement,
  type DateTimePickerPlacementSide,
} from "../../lib/popover-positioning.js";
import { scrollIntoNearestViewport } from "../../lib/scroll-into-nearest-viewport.js";
import { cn } from "../../lib/utils.js";
import { Button } from "./button.js";
import { Calendar } from "./calendar.js";
import { CalendarMonthYearCaption } from "./calendar-month-year-caption.js";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.js";
import { ScrollArea } from "./scroll-area.js";

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

const calendarStartMonth = new Date(new Date().getFullYear() - 100, 0);
const calendarEndMonth = new Date(new Date().getFullYear() + 10, 11);

const calendarClassNames = {
  nav: "hidden",
} as const;

const calendarComponents = {
  MonthCaption: CalendarMonthYearCaption,
} as const;

export type DateTimePickerLabels = {
  time: string;
  hour: string;
  minute: string;
  today: string;
  done: string;
};

export type DateTimePickerPanelProps = {
  value: Date;
  onChange: (value: Date) => void;
  onToday: () => void;
  onDone: () => void;
  labels: DateTimePickerLabels;
  locale?: Locale;
  minimumDate?: Date;
  todayDisabled?: boolean;
  doneDisabled?: boolean;
  className?: string;
};

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function TimeValueScroll({
  values,
  selected,
  date,
  minimumDate,
  part,
  onSelect,
  className,
}: {
  values: readonly number[];
  selected: number;
  date: Date;
  minimumDate: Date | undefined;
  part: "hours" | "minutes";
  onSelect: (value: number) => void;
  className?: string;
}) {
  const selectedRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    scrollIntoNearestViewport(selectedRef.current, { block: "center" });
  }, [selected]);

  return (
    <ScrollArea className={cn(DATE_TIME_PICKER_TIME_SCROLL_CLASS, className)}>
      <div className="flex flex-col p-1">
        {values.map((value) => {
          const candidate = new Date(date);
          if (part === "hours") {
            candidate.setHours(value);
          } else {
            candidate.setMinutes(value);
          }
          const disabled = minimumDate ? candidate.getTime() < minimumDate.getTime() : false;
          return (
            <button
              key={value}
              ref={selected === value ? selectedRef : undefined}
              type="button"
              disabled={disabled}
              className={cn(
                "flex h-10 w-full shrink-0 items-center justify-center rounded-md text-sm font-normal tabular-nums",
                "hover:bg-muted disabled:pointer-events-none disabled:text-muted-foreground/40",
                selected === value && "bg-muted text-foreground",
              )}
              onClick={() => onSelect(value)}
            >
              {String(value).padStart(2, "0")}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/**
 * Calendar + hours/minutes columns + Today/Done footer.
 * Sized with max-width/max-height tied to the viewport / Radix available height so
 * collision flip/shift keeps the panel fully visible (including inside modals).
 */
export function DateTimePickerPanel({
  value,
  onChange,
  onToday,
  onDone,
  labels,
  locale,
  minimumDate,
  todayDisabled = false,
  doneDisabled = false,
  className,
}: DateTimePickerPanelProps) {
  const [calendarMonth, setCalendarMonth] = React.useState<Date>(value);

  React.useEffect(() => {
    setCalendarMonth(value);
  }, [value]);

  const updateTime = React.useCallback(
    (part: "hours" | "minutes", nextValue: number) => {
      const next = new Date(value);
      if (part === "hours") {
        next.setHours(nextValue);
      } else {
        next.setMinutes(nextValue);
      }
      onChange(next);
    },
    [onChange, value],
  );

  return (
    <div
      data-slot="date-time-picker-panel"
      className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden", className)}
    >
      <div
        className={DATE_TIME_PICKER_BODY_LAYOUT_CLASS}
        data-slot="date-time-picker-body"
      >
        <div className={DATE_TIME_PICKER_CALENDAR_SCROLL_CLASS} data-slot="date-time-picker-calendar">
          <Calendar
            mode="single"
            captionLayout="label"
            selected={value}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            locale={locale}
            startMonth={calendarStartMonth}
            endMonth={calendarEndMonth}
            disabled={minimumDate ? { before: startOfDay(minimumDate) } : undefined}
            onSelect={(date) => {
              if (!date) {
                return;
              }
              const next = new Date(date);
              next.setHours(value.getHours(), value.getMinutes(), 0, 0);
              if (minimumDate && next.getTime() < minimumDate.getTime()) {
                onChange(new Date(minimumDate));
                return;
              }
              onChange(next);
            }}
            className="w-full max-w-full [--cell-size:clamp(1.75rem,calc((100%-1.5rem)/7),2rem)]"
            classNames={calendarClassNames}
            components={calendarComponents}
          />
        </div>
        <div className={DATE_TIME_PICKER_TIME_COLUMN_CLASS} data-slot="date-time-picker-time">
          <div className="shrink-0 border-b px-3 py-2 text-center text-sm font-medium">{labels.time}</div>
          <div className="grid shrink-0 grid-cols-2 border-b text-center text-xs text-muted-foreground">
            <span className="px-2 py-1.5">{labels.hour}</span>
            <span className="border-l px-2 py-1.5">{labels.minute}</span>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1">
            <TimeValueScroll
              values={HOURS}
              selected={value.getHours()}
              date={value}
              minimumDate={minimumDate}
              part="hours"
              onSelect={(hours) => updateTime("hours", hours)}
            />
            <TimeValueScroll
              values={MINUTES}
              selected={value.getMinutes()}
              date={value}
              minimumDate={minimumDate}
              part="minutes"
              onSelect={(minutes) => updateTime("minutes", minutes)}
              className="border-l"
            />
          </div>
        </div>
      </div>
      <div
        className="flex shrink-0 items-center justify-between gap-2 border-t p-3"
        data-slot="date-time-picker-footer"
      >
        <Button type="button" variant="ghost" disabled={todayDisabled} onClick={onToday}>
          {labels.today}
        </Button>
        <Button type="button" disabled={doneDisabled} onClick={onDone}>
          {labels.done}
        </Button>
      </div>
    </div>
  );
}

export type DateTimePickerProps = DateTimePickerPanelProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactElement;
  align?: React.ComponentPropsWithoutRef<typeof PopoverContent>["align"];
  side?: React.ComponentPropsWithoutRef<typeof PopoverContent>["side"];
  contentClassName?: string;
};

/**
 * Anchored date+time popover with collision-aware positioning (portal, flip/shift).
 * Prefers the vertical side with more free space; body scrolls so footer stays visible.
 */
export function DateTimePicker({
  open,
  onOpenChange,
  trigger,
  align = "end",
  side: sideProp,
  contentClassName,
  ...panelProps
}: DateTimePickerProps) {
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const [resolvedSide, setResolvedSide] = React.useState<DateTimePickerPlacementSide>("bottom");

  const updateSideFromTrigger = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el || sideProp) {
      return;
    }
    const placement = resolveDateTimePickerPlacement(
      el.getBoundingClientRect(),
      window.innerHeight,
      400,
    );
    setResolvedSide(placement.side);
  }, [sideProp]);

  React.useLayoutEffect(() => {
    if (open) {
      updateSideFromTrigger();
    }
  }, [open, updateSideFromTrigger]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        updateSideFromTrigger();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, updateSideFromTrigger],
  );

  const triggerWithRef = React.isValidElement(trigger)
    ? React.cloneElement(trigger as React.ReactElement<{ ref?: React.Ref<HTMLElement | null> }>, {
        ref: (node: HTMLElement | null) => {
          triggerRef.current = node;
          const originalRef = (
            trigger as React.ReactElement<{ ref?: React.Ref<HTMLElement | null> }>
          ).props.ref;
          if (typeof originalRef === "function") {
            originalRef(node);
          } else if (originalRef && typeof originalRef === "object") {
            (originalRef as React.MutableRefObject<HTMLElement | null>).current = node;
          }
        },
      })
    : trigger;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{triggerWithRef}</PopoverTrigger>
      <PopoverContent
        align={align}
        side={sideProp ?? resolvedSide}
        className={cn(DATE_TIME_PICKER_POPOVER_CONTENT_CLASS, contentClassName)}
      >
        <DateTimePickerPanel {...panelProps} />
      </PopoverContent>
    </Popover>
  );
}

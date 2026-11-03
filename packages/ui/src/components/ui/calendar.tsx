import * as React from "react";
import { DayPicker, getDefaultClassNames, type DayButtonProps } from "react-day-picker";

import { cn } from "../../lib/utils.js";
import { Button, buttonVariants } from "./button.js";
import { ChevronDownIcon } from "./select-icons.js";

function ChevronLeftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function CalendarDayButton({ className, day, modifiers, ...props }: DayButtonProps) {
  const defaultClassNames = getDefaultClassNames();
  const hasCluster =
    Boolean(modifiers.cluster_start) ||
    Boolean(modifiers.cluster_middle) ||
    Boolean(modifiers.cluster_end) ||
    Boolean(modifiers.cluster_single);
  const isSelectedSingle =
    modifiers.selected &&
    !modifiers.range_start &&
    !modifiers.range_end &&
    !modifiers.range_middle &&
    (!hasCluster || Boolean(modifiers.cluster_single));

  return (
    <Button
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={isSelectedSingle}
      data-today={modifiers.today && !isSelectedSingle && !hasCluster}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      data-cluster-start={modifiers.cluster_start || undefined}
      data-cluster-middle={modifiers.cluster_middle || undefined}
      data-cluster-end={modifiers.cluster_end || undefined}
      className={cn(
        "focus:outline-none focus:shadow-none focus-visible:outline-none focus-visible:shadow-none",
        "data-[today=true]:bg-[color-mix(in_hsl,hsl(var(--secondary))_96%,hsl(var(--foreground))_4%)] data-[today=true]:text-foreground data-[today=true]:hover:bg-[color-mix(in_hsl,hsl(var(--secondary))_96%,hsl(var(--foreground))_4%)]",
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[selected-single=true]:hover:bg-primary data-[selected-single=true]:hover:text-primary-foreground",
        "data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground",
        "data-[cluster-start=true]:rounded-l-md data-[cluster-start=true]:rounded-r-none data-[cluster-start=true]:bg-primary data-[cluster-start=true]:text-primary-foreground data-[cluster-start=true]:hover:bg-primary data-[cluster-start=true]:hover:text-primary-foreground",
        "data-[cluster-middle=true]:rounded-none data-[cluster-middle=true]:bg-primary data-[cluster-middle=true]:text-primary-foreground data-[cluster-middle=true]:hover:bg-primary data-[cluster-middle=true]:hover:text-primary-foreground",
        "data-[cluster-end=true]:rounded-r-md data-[cluster-end=true]:rounded-l-none data-[cluster-end=true]:bg-primary data-[cluster-end=true]:text-primary-foreground data-[cluster-end=true]:hover:bg-primary data-[cluster-end=true]:hover:text-primary-foreground",
        "flex aspect-square h-auto w-full min-w-[--cell-size] flex-col gap-1 font-normal leading-none data-[range-end=true]:rounded-md data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-md [&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  );
}

// Module-stable DayPicker slots. Inline components recreate element types on every
// Calendar render and remount the whole tree (including month/year CaptionMenu state).
function CalendarRoot({
  className,
  rootRef,
  ...props
}: React.ComponentProps<"div"> & { rootRef?: React.Ref<HTMLDivElement> }) {
  return <div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />;
}

function CalendarChevron({
  className,
  orientation,
  ...props
}: React.SVGProps<SVGSVGElement> & { orientation?: "left" | "right" | "up" | "down" }) {
  if (orientation === "left") {
    return <ChevronLeftIcon className={cn("size-4", className)} {...props} />;
  }
  if (orientation === "right") {
    return <ChevronRightIcon className={cn("size-4", className)} {...props} />;
  }
  return <ChevronDownIcon className={cn("size-4", className)} {...props} />;
}

function CalendarWeekNumber({
  children,
  ...props
}: React.ComponentProps<"td">) {
  return (
    <td {...props}>
      <div className="flex size-[--cell-size] items-center justify-center text-center">{children}</div>
    </td>
  );
}

const calendarFormatMonthDropdown = (date: Date) =>
  date.toLocaleString("default", { month: "short" });

const defaultCalendarClassNames = getDefaultClassNames();

const calendarBaseClassNames = {
  root: cn("w-fit", defaultCalendarClassNames.root),
  months: cn("relative flex flex-col gap-4 md:flex-row", defaultCalendarClassNames.months),
  month: cn("flex w-full flex-col gap-4", defaultCalendarClassNames.month),
  nav: cn(
    "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
    defaultCalendarClassNames.nav,
  ),
  month_caption: cn(
    "flex h-[--cell-size] w-full items-center justify-center px-[--cell-size]",
    defaultCalendarClassNames.month_caption,
  ),
  dropdowns: cn(
    "flex h-[--cell-size] w-full items-center justify-center gap-1.5 text-sm font-medium",
    defaultCalendarClassNames.dropdowns,
  ),
  dropdown_root: cn(
    "relative rounded-md border border-input bg-background shadow-[0_1px_2px_rgba(0,0,0,0.05)] has-[:focus]:border-accent has-[:focus]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
    defaultCalendarClassNames.dropdown_root,
  ),
  dropdown: cn(
    "absolute inset-0 cursor-pointer appearance-none rounded-md bg-transparent px-2 py-1 text-sm text-foreground outline-none",
    defaultCalendarClassNames.dropdown,
  ),
  month_grid: cn("w-full border-collapse", defaultCalendarClassNames.month_grid),
  weekdays: cn("flex", defaultCalendarClassNames.weekdays),
  weekday: cn(
    "text-muted-foreground flex-1 select-none rounded-md text-[0.8rem] font-normal",
    defaultCalendarClassNames.weekday,
  ),
  week: cn("mt-2 flex w-full", defaultCalendarClassNames.week),
  week_number_header: cn("w-[--cell-size] select-none", defaultCalendarClassNames.week_number_header),
  week_number: cn("text-muted-foreground select-none text-[0.8rem]", defaultCalendarClassNames.week_number),
  day: cn(
    "group/day relative aspect-square h-full w-full select-none p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md",
    defaultCalendarClassNames.day,
  ),
  range_start: cn("bg-accent rounded-l-md", defaultCalendarClassNames.range_start),
  range_middle: cn("rounded-none", defaultCalendarClassNames.range_middle),
  range_end: cn("bg-accent rounded-r-md", defaultCalendarClassNames.range_end),
  today: cn("rounded-md", defaultCalendarClassNames.today),
  outside: cn("text-muted-foreground aria-selected:text-muted-foreground", defaultCalendarClassNames.outside),
  disabled: cn("text-muted-foreground opacity-50", defaultCalendarClassNames.disabled),
  hidden: cn("invisible", defaultCalendarClassNames.hidden),
} as const;

const calendarBaseComponents = {
  Root: CalendarRoot,
  Chevron: CalendarChevron,
  DayButton: CalendarDayButton,
  WeekNumber: CalendarWeekNumber,
} as const;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const mergedFormatters = React.useMemo(
    () => ({
      formatMonthDropdown: calendarFormatMonthDropdown,
      ...formatters,
    }),
    [formatters],
  );

  const mergedClassNames = React.useMemo(
    () => ({
      ...calendarBaseClassNames,
      button_previous: cn(
        buttonVariants({ variant: buttonVariant }),
        "h-[--cell-size] w-[--cell-size] select-none p-0 aria-disabled:opacity-50",
        defaultCalendarClassNames.button_previous,
      ),
      button_next: cn(
        buttonVariants({ variant: buttonVariant }),
        "h-[--cell-size] w-[--cell-size] select-none p-0 aria-disabled:opacity-50",
        defaultCalendarClassNames.button_next,
      ),
      caption_label: cn(
        "select-none font-medium",
        captionLayout === "label"
          ? "text-sm"
          : "[&>svg]:text-muted-foreground flex h-8 items-center gap-1 rounded-md pl-2 pr-1 text-sm [&>svg]:size-3.5",
        defaultCalendarClassNames.caption_label,
      ),
      ...classNames,
    }),
    [buttonVariant, captionLayout, classNames],
  );

  const mergedComponents = React.useMemo(
    () => ({
      ...calendarBaseComponents,
      ...components,
    }),
    [components],
  );

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "bg-background group/calendar p-3 [--cell-size:2rem] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      captionLayout={captionLayout}
      formatters={mergedFormatters}
      classNames={mergedClassNames}
      components={mergedComponents}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };

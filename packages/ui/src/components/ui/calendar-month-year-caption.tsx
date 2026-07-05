import * as React from "react";
import { format } from "date-fns";
import type { Locale } from "date-fns";
import { useDayPicker, type MonthCaptionProps } from "react-day-picker";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select.js";

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
      <Select value={String(month)} onValueChange={(value) => goToMonthIndex(Number(value))}>
        <SelectTrigger className="h-8 w-[9.5rem]" aria-label="Choose the month">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {monthOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(year)} onValueChange={(value) => goToYear(Number(value))}>
        <SelectTrigger className="h-8 w-[5.5rem]" aria-label="Choose the year">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {yearOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export { CalendarMonthYearCaption };

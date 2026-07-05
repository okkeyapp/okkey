import * as React from "react";
import type { Locale } from "date-fns";

import {
  formatKeyFieldDateValue,
  parseKeyFieldDateValue,
} from "../../lib/date-field.js";
import { Calendar } from "./calendar.js";
import { CalendarMonthYearCaption } from "./calendar-month-year-caption.js";
import { KeyFieldOverlayPanel } from "./key-field-overlay-panel.js";

const calendarStartMonth = new Date(new Date().getFullYear() - 100, 0);
const calendarEndMonth = new Date(new Date().getFullYear() + 10, 11);

export type KeyFieldDatePickerPanelProps = {
  value: string;
  onValueChange: (value: string) => void;
  onClose?: () => void;
  locale?: Locale;
};

function KeyFieldDatePickerPanelComponent({
  value,
  onValueChange,
  onClose,
  locale,
}: KeyFieldDatePickerPanelProps) {
  const selectedDate = React.useMemo(() => parseKeyFieldDateValue(value), [value]);
  const [month, setMonth] = React.useState<Date>(() => selectedDate ?? new Date());

  React.useEffect(() => {
    if (selectedDate) {
      setMonth(selectedDate);
    }
  }, [selectedDate]);

  function handleDateSelect(date: Date | undefined) {
    if (!date) {
      return;
    }

    onValueChange(formatKeyFieldDateValue(date));
    onClose?.();
  }

  return (
    <KeyFieldOverlayPanel data-key-field-date-picker-panel className="w-auto p-0">
      <Calendar
        mode="single"
        captionLayout="label"
        locale={locale}
        startMonth={calendarStartMonth}
        endMonth={calendarEndMonth}
        selected={selectedDate}
        month={month}
        onMonthChange={setMonth}
        onSelect={handleDateSelect}
        classNames={{
          nav: "hidden",
        }}
        components={{
          MonthCaption: CalendarMonthYearCaption,
        }}
      />
    </KeyFieldOverlayPanel>
  );
}

export const KeyFieldDatePickerPanel = React.memo(KeyFieldDatePickerPanelComponent);

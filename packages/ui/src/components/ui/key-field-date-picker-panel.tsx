import * as React from "react";

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
};

function KeyFieldDatePickerPanelComponent({
  value,
  onValueChange,
  onClose,
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
    <KeyFieldOverlayPanel data-key-field-date-picker-panel className="w-auto overflow-hidden p-0">
      <Calendar
        mode="single"
        captionLayout="label"
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

/** Local calendar-day difference: positive = `from` is before `to` (e.g. days ago). */
export function calendarDaysBetween(from: Date, to: Date = new Date()): number {
  const startOfDayMs = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  return Math.round((startOfDayMs(to) - startOfDayMs(from)) / 86_400_000);
}

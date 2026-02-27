const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function toISODate(date: Date): string {
  const d = startOfDay(date);
  return d.toISOString().slice(0, 10);
}

export function parseISODate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function addDays(date: Date, days: number): Date {
  const next = startOfDay(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number): Date {
  const base = startOfDay(date);
  const originalDate = base.getDate();
  const result = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const maxDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDate, maxDay));
  return result;
}

export function addYears(date: Date, years: number): Date {
  const base = startOfDay(date);
  const result = new Date(base.getFullYear() + years, base.getMonth(), 1);
  const maxDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(base.getDate(), maxDay));
  return result;
}

export function differenceInDays(start: Date, end: Date): number {
  const s = startOfDay(start).getTime();
  const e = startOfDay(end).getTime();
  return Math.round((e - s) / MS_PER_DAY);
}

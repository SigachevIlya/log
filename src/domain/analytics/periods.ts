import { dateKey, localDate } from '../calendar';
export type Period = 'week' | 'month' | 'quarter' | 'all';
export interface DateRange { start: number; end: number }
export const periodLabels: Record<Period, string> = { week: 'Неделя', month: 'Месяц', quarter: 'Три месяца', all: 'Всё время' };
export function calendarDay(date: Date | string | number): number {
  const value = new Date(date); return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86_400_000;
}
export function weekStart(date: Date) { const value = new Date(date); value.setHours(0, 0, 0, 0); value.setDate(value.getDate() - (value.getDay() + 6) % 7); return value; }
export function periodRange(period: Period, now: Date, first?: number): DateRange {
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  if (period === 'all') { const start = new Date(Math.min(first ?? Infinity, new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime())); start.setHours(0, 0, 0, 0); return { start: start.getTime(), end: end.getTime() }; }
  if (period === 'week') { const start = weekStart(now); end.setTime(start.getTime()); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999); return { start: start.getTime(), end: end.getTime() }; }
  const start = new Date(now.getFullYear(), now.getMonth() - (period === 'month' ? 1 : 3), 1);
  const last = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate(); start.setDate(Math.min(now.getDate(), last));
  return { start: start.getTime(), end: end.getTime() };
}
export const inRange = (date: string | number, range: DateRange) => { const stamp = typeof date === 'number' ? date : Date.parse(date); return stamp >= range.start && stamp <= range.end; };
export const shortDate = (date: string | number) => new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
export const fullDate = (date: string | number) => new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
export function rangeLabel(range: DateRange) { return `${fullDate(range.start)} — ${fullDate(range.end)}`; }
export function dayStamp(key: string) { return localDate(key).getTime(); }
export function weekKey(date: string | number) { return dateKey(weekStart(new Date(date))); }

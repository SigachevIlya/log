import type { ScheduleException, WorkoutSession } from './models';
export const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export function dateKey(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function localDate(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error('Укажите календарную дату.');
  const [year, month, day] = key.split('-').map(Number); const result = new Date(year, month - 1, day, 12);
  if (dateKey(result) !== key) throw new Error('Некорректная дата.'); return result;
}
export function dayPlan(date: Date, days: number[], exceptions: ScheduleException[]) {
  const key = dateKey(date);
  const source = exceptions.find(row => row.date === key && row.kind !== 'extra');
  const extra = exceptions.find(row => row.date === key && row.kind === 'extra');
  const moved = exceptions.find(row => row.targetDate === key && row.kind === 'move');
  return { planned: !!moved || !!extra || (days.includes(date.getDay()) && !source), kind: moved ? 'moved' : extra ? 'extra' : source?.kind ?? 'regular', source, extra, moved };
}
export function upcomingDate(now: Date, days: number[], exceptions: ScheduleException[], history: WorkoutSession[]): Date | null {
  const used = new Set(history.filter(row => row.status !== 'active').map(row => dateKey(new Date(row.startedAt))));
  const date = new Date(now); date.setHours(12, 0, 0, 0);
  for (let i = 0; i < 3660; i++) { if (dayPlan(date, days, exceptions).planned && !used.has(dateKey(date))) return date; date.setDate(date.getDate() + 1); }
  return null;
}

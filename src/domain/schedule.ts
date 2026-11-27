import type { TemplateId } from './models';
export const sequence: TemplateId[] = ['A', 'B', 'C'];
export function nextTemplate(current: TemplateId, order: TemplateId[] = sequence): TemplateId {
  if (order.length === 0) throw new Error('Тренировочный цикл не может быть пустым.');
  return order[(order.indexOf(current) + 1) % order.length];
}
/** Calendar dates do not advance the program: only a completed session can do so. */
export function nextTrainingDate(now: Date, trainingDays: number[]): Date | null {
  if (!trainingDays.some(day => Number.isInteger(day) && day >= 0 && day <= 6)) return null;
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    if (trainingDays.includes(date.getDay())) return date;
    date.setDate(date.getDate() + 1);
  }
  return null;
}
export function weekDates(now: Date): Date[] {
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday); date.setDate(date.getDate() + index); return date;
  });
}
export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

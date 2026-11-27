import type { Exercise, WorkingSet } from './models';
export function plural(value: number, forms: readonly [string, string, string]): string {
  const n = Math.abs(value) % 100;
  return forms[n >= 11 && n <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2];
}
export const exerciseCount = (n: number) => `${n} ${plural(n, ['упражнение', 'упражнения', 'упражнений'])}`;
export const setCount = (n: number) => `${n} ${plural(n, ['рабочий подход', 'рабочих подхода', 'рабочих подходов'])}`;
export function naturalDuration(start: string, end: string | null): string {
  const seconds = Math.max(0, Math.floor((Date.parse(end ?? start) - Date.parse(start)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} ч. ${minutes % 60} мин.` : `${minutes} мин. ${seconds % 60} сек.`;
}
export function resultText(exercise: Exercise, set: WorkingSet, separate = false): string {
  const side = (weight: number | null | undefined, reps: number | null | undefined) => exercise.weightMode === 'bodyweight' ? `Собственный вес × ${reps}` : exercise.weightMode === 'additional'
    ? `${weight === 0 ? 'Собственный вес' : `+${weight} кг`} × ${reps}` : `${weight} кг × ${reps}`;
  return `${side(set.weightKg, set.reps)}${separate ? ` (Л) / ${side(set.rightWeightKg, set.rightReps)} (П)` : ''}`;
}
export const statusText = { active: 'В процессе', completed: 'Завершена', incomplete: 'Неполная', skipped: 'Пропущена' };

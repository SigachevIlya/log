import type { Exercise, WorkoutSession } from '../models';
import { completedSets } from '../workout';
import { dateKey } from '../calendar';
import { inRange, weekKey, type DateRange } from './periods';
export const generalMuscle = (muscle?: string) => {
  if (!muscle) return 'Неизвестно';
  if (['Широчайшие', 'Верхняя и средняя часть спины', 'Разгибатели позвоночника'].includes(muscle)) return 'Спина';
  if (muscle.includes('дельта')) return 'Плечи';
  if (['Квадрицепс', 'Задняя поверхность бедра', 'Ягодичные', 'Икры'].includes(muscle)) return 'Ноги';
  if (['Бицепс', 'Трицепс', 'Предплечья'].includes(muscle)) return 'Руки';
  return muscle === 'Верхняя трапеция' ? 'Трапеция' : muscle;
};
export interface MuscleVolume { name: string; direct: number; indirect: number }
export function addMuscleVolume(map: Map<string, MuscleVolume>, exercise: Exercise, count: number, general: boolean) {
  const group = (muscle?: string) => general ? generalMuscle(muscle) : muscle ?? 'Неизвестно';
  const primary = group(exercise.primaryMuscle), secondary = new Set((exercise.secondaryMuscles ?? []).map(group)); secondary.delete(primary);
  const add = (name: string, kind: 'direct' | 'indirect') => { const row = map.get(name) ?? { name, direct: 0, indirect: 0 }; row[kind] += count; map.set(name, row); };
  add(primary, 'direct'); secondary.forEach(name => add(name, 'indirect'));
}
export function muscleVolume(sessions: WorkoutSession[], general = true): MuscleVolume[] {
  const map = new Map<string, MuscleVolume>();
  for (const session of sessions) if (['completed', 'incomplete'].includes(session.status)) for (const row of session.exercises) addMuscleVolume(map, row.exercise, completedSets(row).length, general);
  return [...map.values()].filter(row => row.direct || row.indirect).sort((a, b) => b.direct - a.direct || a.name.localeCompare(b.name, 'ru'));
}
export function weeklyVolume(sessions: WorkoutSession[], range: DateRange) {
  const map = new Map<string, number>();
  for (const session of sessions) if (inRange(session.startedAt, range) && ['completed', 'incomplete'].includes(session.status)) { const count = session.exercises.reduce((sum, row) => sum + completedSets(row).length, 0); if (count) { const key = weekKey(session.startedAt); map.set(key, (map.get(key) ?? 0) + count); } }
  return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}
export function trainingStatistics(history: WorkoutSession[], range: DateRange) {
  const selected = history.filter(row => inRange(row.startedAt, range));
  const performed = selected.filter(row => ['completed', 'incomplete'].includes(row.status) && row.exercises.some(row => completedSets(row).length));
  const durations = performed.map(row => row.endedAt ? Date.parse(row.endedAt) - Date.parse(row.startedAt) : NaN).filter(value => Number.isFinite(value) && value >= 0);
  const duration = durations.reduce((sum, value) => sum + value, 0);
  return { performed, visits: new Set(performed.map(row => dateKey(new Date(row.startedAt)))).size, completed: performed.filter(row => row.status === 'completed').length, incomplete: performed.filter(row => row.status === 'incomplete').length, skipped: selected.filter(row => row.status === 'skipped').length, sets: performed.reduce((sum, session) => sum + session.exercises.reduce((sum, row) => sum + completedSets(row).length, 0), 0), duration, average: durations.length ? duration / durations.length : null };
}

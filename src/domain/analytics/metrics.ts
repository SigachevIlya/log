import type { BodyWeightEntry, Exercise, SessionExercise, WorkingSet } from '../models';
import { weightOnDate } from './bodyWeight';
export type Side = 'mean' | 'left' | 'right';
export type Metric = 'strength' | 'weight' | 'reps' | 'totalReps' | 'sets' | 'tonnage';
export const metricLabels: Record<Metric, string> = { strength: 'Расчётный максимум', weight: 'Максимальный рабочий вес', reps: 'Максимум повторений', totalReps: 'Количество повторений', sets: 'Выполненные подходы', tonnage: 'Тоннаж' };
export const metricUnits: Record<Metric, string> = { strength: 'кг', weight: 'кг', reps: 'повт.', totalReps: 'повт.', sets: 'подх.', tonnage: 'кг' };
export const e1rmHint = 'Приблизительный показатель силового прогресса, рассчитанный по рабочему весу и повторениям. Не является рекомендацией поднимать этот вес';
export function loadCalculation(exercise: Exercise) { return exercise.loadCalculation ?? (!exercise.unilateral && ['total', 'machine', 'plates', 'smith'].includes(exercise.weightMode) ? 'total' : 'unknown'); }
export function comparisonKey(exercise: Exercise): string {
  return JSON.stringify([exercise.id, exercise.comparisonKey ?? exercise.id, exercise.weightMode, exercise.unilateral, exercise.repetitionRule ?? (exercise.unilateral ? 'Повторения на одну сторону; подход включает обе стороны' : 'Повторения за подход'), exercise.customWeightNote ?? '', exercise.bodyWeight ?? ['bodyweight', 'additional'].includes(exercise.weightMode), loadCalculation(exercise), exercise.bodyWeightModel ?? 'unknown']);
}
export function epley(weight: number, reps: number): number | null { return Number.isFinite(weight) && weight >= 0 && Number.isInteger(reps) && reps >= 1 && reps <= 12 ? reps === 1 ? weight : weight * (1 + reps / 30) : null; }
export function sideResults(row: SessionExercise, set: WorkingSet) {
  const left = { weight: set.weightKg!, reps: set.reps! }, right = row.separateSides ? { weight: set.rightWeightKg!, reps: set.rightReps! } : left;
  return { left, right };
}
export function setMetrics(row: SessionExercise, set: WorkingSet, date: number, weights: BodyWeightEntry[]) {
  const exercise = row.exercise, sides = sideResults(row, set), body = exercise.bodyWeight || ['additional', 'bodyweight'].includes(exercise.weightMode);
  const measurement = exercise.bodyWeightModel === 'pull-up' ? weightOnDate(weights, date) : undefined;
  const strength = (side: typeof sides.left) => body ? measurement ? epley(measurement.weightKg + side.weight, side.reps) : null : epley(side.weight, side.reps);
  const left = { ...sides.left, strength: strength(sides.left) }, right = { ...sides.right, strength: strength(sides.right) };
  const mean = { weight: (left.weight + right.weight) / 2, reps: (left.reps + right.reps) / 2, strength: left.strength !== null && right.strength !== null ? (left.strength + right.strength) / 2 : null };
  let tonnage: number | null = null;
  const mechanics = loadCalculation(exercise);
  if (body) { if (measurement && exercise.bodyWeightModel === 'pull-up' && !exercise.unilateral) tonnage = (measurement.weightKg + left.weight) * left.reps; }
  else if (mechanics === 'total' && !exercise.unilateral) tonnage = left.weight * left.reps;
  else if (mechanics === 'paired' && !exercise.unilateral && exercise.weightMode === 'per-dumbbell') tonnage = 2 * left.weight * left.reps;
  else if (exercise.unilateral && ['per-side-one', 'per-side-pair'].includes(mechanics)) tonnage = (left.weight * left.reps + right.weight * right.reps) * (mechanics === 'per-side-pair' ? 2 : 1);
  return { left, right, mean, tonnage, measurement };
}
export function repetitionLoadKey(metrics: ReturnType<typeof setMetrics>, side: Side) { return side === 'mean' ? JSON.stringify([metrics.left.weight, metrics.right.weight]) : String(metrics[side].weight); }

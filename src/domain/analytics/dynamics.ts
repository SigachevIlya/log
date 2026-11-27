import { pointValue, type ExercisePoint } from './index';
import { comparisonKey, repetitionLoadKey, type Side } from './metrics';
export interface Dynamics { state: 'up' | 'steady' | 'down' | 'insufficient'; label: string; change?: number; unit?: '%' | 'повт.'; slowed: boolean }
function compare(first: ExercisePoint, last: ExercisePoint, side: Side): { change: number; unit: '%' | 'повт.' } | null {
  if (comparisonKey(first.rows[0].exercise) !== comparisonKey(last.rows[0].exercise)) return null;
  const a = pointValue(first, 'strength', side), b = pointValue(last, 'strength', side);
  if (a !== null && b !== null && a > 0) return { change: (b - a) / a * 100, unit: '%' };
  const weights = new Map<string, number>(); for (const observation of first.observations) { const value = observation.metrics[side], key = repetitionLoadKey(observation.metrics, side); weights.set(key, Math.max(weights.get(key) ?? 0, value.reps)); }
  const common = last.observations.filter(row => weights.has(repetitionLoadKey(row.metrics, side))).sort((a, b) => b.metrics[side].weight - a.metrics[side].weight);
  if (!common.length) return null;
  const key = repetitionLoadKey(common[0].metrics, side), lastReps = Math.max(...common.filter(row => repetitionLoadKey(row.metrics, side) === key).map(row => row.metrics[side].reps));
  return { change: lastReps - weights.get(key)!, unit: 'повт.' };
}
export function dynamics(points: ExercisePoint[], side: Side = 'mean', scope: 'period' | 'previous' = 'period'): Dynamics {
  if (points.length < 2) return { state: 'insufficient', label: 'Недостаточно данных для сравнения', slowed: false };
  const result = compare(scope === 'period' ? points[0] : points.at(-2)!, points.at(-1)!, side);
  if (!result) return { state: 'insufficient', label: 'Недостаточно данных для сравнения', slowed: false };
  const threshold = result.unit === '%' ? 2 : .000001;
  const state = result.change >= threshold ? 'up' : result.change <= -threshold ? 'down' : 'steady';
  const four = points.slice(-4), comparisons = four.slice(1).map(point => compare(four[0], point, side));
  const slowed = four.length === 4 && comparisons.every(row => row && row.unit === result.unit && row.change < (row.unit === '%' ? 2 : .000001));
  return { ...result, state, label: { up: 'Рост', down: 'Снижение показателя', steady: 'Без заметных изменений' }[state], slowed };
}
export function repetitionLoads(points: ExercisePoint[], side: Side = 'mean') {
  const loads = new Map<string, string>();
  for (const point of points) for (const row of point.observations) {
    const key = repetitionLoadKey(row.metrics, side), result = row.metrics[side];
    loads.set(key, side === 'mean' && row.row.separateSides ? `${row.metrics.left.weight} / ${row.metrics.right.weight} кг (Л / П)` : `${result.weight} кг`);
  }
  return [...loads].map(([key, label]) => ({ key, label }));
}
export function repsAtLoad(point: ExercisePoint, load: string, side: Side = 'mean') {
  const reps = point.observations.filter(row => repetitionLoadKey(row.metrics, side) === load).map(row => row.metrics[side].reps);
  return reps.length ? Math.max(...reps) : null;
}
